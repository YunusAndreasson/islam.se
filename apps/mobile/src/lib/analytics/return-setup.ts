import { Platform } from 'react-native';

import { acknowledgeReceipts, type WidgetSnapshot } from '@/widget/placement';
import type { PrayerEvidence } from '../notifications';
import { storage } from '../storage';
import { ANALYTICS_EVENTS, type EventPayloads, type Outcome, type SetupWindow, type TrackArguments, type WidgetState } from './events';
import { FIRST_OPEN_KEY, retryFirstOpenAfterSetupUpload } from './first-open';
import { enqueueSetupEvent } from './index';

const KEY = 'returnSetup:v1';
const GAP = 30 * 60_000;
const WEEK = 168 * 3600_000;
type Reason = EventPayloads['Return Setup Observed']['reason'];
type Origin = EventPayloads['Prayer Reminder Verified']['origin'];
type Exact = EventPayloads['Prayer Reminder Verified']['exact_state'];
type Checkpoint = EventPayloads['Return Setup Checkpoint'];
interface Sample {
  at: number; reason: Reason; auth: PrayerEvidence['auth']; pending: PrayerEvidence['pending'];
  alert: Outcome; widget: Outcome; widgetState: WidgetState; validUntil: number;
}
interface PendingEvent { args: TrackArguments; at: number; id: number }
interface Ledger {
  visitStart: number; lastForeground: number; first: number; lastVisit: number; sessionClosed: boolean; dayClosed: boolean; nativeSeq: number;
  firstAlert?: number; firstWidget?: number; sawAbsent: boolean; preexisting: boolean;
  lastWindow?: SetupWindow; last?: Sample; exit?: Sample; beforeDay?: Sample; sessionExit: boolean; handoff: boolean; alertHandoff?: boolean;
  reminderOrigin?: Origin; sequence: number; nonce: string; outbox: PendingEvent[];
}
export interface SetupInput {
  at: number; reason: Exclude<Reason, 'native_callback'>; prayer: PrayerEvidence; widget: WidgetSnapshot;
  exact: Exact; origin: Origin; foreground: boolean; returned?: boolean;
}
let queue = Promise.resolve();
function serialized<T>(work: () => Promise<T>): Promise<T> {
  const result = queue.then(work);
  queue = result.then(() => undefined, () => undefined);
  return result;
}
async function load(): Promise<Ledger | null> {
  const raw = await storage.getItem(KEY);
  if (raw) return JSON.parse(raw) as Ledger;
  // Only the cold-open classifier assigns a participant, before navigation writes settings.
  const assignment = JSON.parse(await storage.getItem(FIRST_OPEN_KEY) ?? 'null');
  if (assignment?.install_kind !== 'new' || !Number.isFinite(assignment.setupStartedAt)) return null;
  const first = assignment.setupStartedAt;
  return { visitStart: first, lastForeground: first, first, lastVisit: first, sessionClosed: false,
    dayClosed: false, nativeSeq: 0, sawAbsent: false, preexisting: false, sessionExit: false, handoff: false,
    sequence: 0, nonce: Math.random().toString(36).slice(2), outbox: [] };
}
const save = (ledger: Ledger) => storage.setItem(KEY, JSON.stringify(ledger));
function emit(ledger: Ledger, at: number, ...args: TrackArguments) {
  ledger.outbox.push({ at, args, id: ++ledger.sequence });
}
function windowAt(ledger: Ledger, at: number): SetupWindow {
  if (!ledger.sessionClosed && at < ledger.lastVisit + GAP) return 'session_1';
  return at <= ledger.first + WEEK ? 'through_day_7' : 'later';
}
function note(ledger: Ledger, sample: Sample, added: boolean, pin: boolean, origin: Origin, exact: Exact, resumed = false) {
  const window = windowAt(ledger, sample.at);
  if (added && ledger.firstWidget === undefined) {
    ledger.firstWidget = sample.at;
    const ambiguous = !pin && sample.reason !== 'native_callback' && ledger.lastWindow && ledger.lastWindow !== window;
    emit(ledger, sample.at, ANALYTICS_EVENTS.PRAYER_WIDGET_ADDED, { proof: pin ? 'android_pin_verified' :
      Platform.OS === 'ios' ? 'ios_configuration' : 'android_provider', window: ambiguous ? 'ambiguous' : window });
  }
  if (sample.alert === 'yes' && ledger.firstAlert === undefined) {
    ledger.firstAlert = sample.at;
    emit(ledger, sample.at, ANALYTICS_EVENTS.PRAYER_REMINDER_VERIFIED, { window, origin: ledger.reminderOrigin ?? origin, exact_state: exact });
  }
  const old = ledger.last;
  // Export the final observable exit even if this install never runs again.
  // A subsequent foreground cancels that candidate until the next real exit.
  const endpoint = window === 'session_1' && (resumed || sample.reason === 'background' || sample.reason === 'native_callback');
  const witnessedExit = sample.reason === 'background' || sample.reason === 'native_callback';
  // The existing foreground sample is also evidence that session one remains open.
  const foregroundActivity = window === 'session_1' && sample.reason === 'resume';
  if (foregroundActivity || endpoint || !old || old.auth !== sample.auth || old.pending !== sample.pending || old.widgetState !== sample.widgetState) {
    emit(ledger, sample.at, ANALYTICS_EVENTS.RETURN_SETUP_OBSERVED, { sequence: ledger.sequence + 1, window, reason: old ? sample.reason : 'baseline',
      auth: sample.auth, pending: sample.pending, widget: sample.widgetState,
      ...(endpoint && {
        endpoint_alert: witnessedExit && !ledger.alertHandoff ? sample.alert : 'unknown',
        endpoint_widget: witnessedExit && (!ledger.handoff || sample.reason === 'native_callback') ? sample.widget : 'unknown',
      }) });
  }
  if (sample.at <= ledger.first + WEEK && sample.at >= (ledger.beforeDay?.at ?? 0)) ledger.beforeDay = sample;
  if (sample.at < (old?.at ?? 0)) return;
  ledger.last = sample;
  ledger.lastWindow = window;
}
function widgetState(ledger: Ledger, present: boolean | null, added: boolean): WidgetState {
  if (present === null) return 'unknown';
  if (!present) {
    ledger.sawAbsent = true;
    return 'absent';
  }
  if (added || ledger.sawAbsent || ledger.firstWidget !== undefined) return 'present';
  if (!ledger.last) ledger.preexisting = true;
  return ledger.preexisting ? 'preexisting' : 'unknown';
}
function widgetOutcome(state: WidgetState): Outcome {
  return state === 'present' ? 'yes' : state === 'unknown' ? 'unknown' : 'no';
}
function checkpoint(ledger: Ledger, cutoff: Checkpoint['cutoff'], at: number, sample: Sample | undefined, alert: Outcome, widget: Outcome, evidence: Checkpoint['evidence']) {
  const ever = (first: number | undefined, current: Outcome): Outcome => first !== undefined && first <= at ? 'yes' : current === 'unknown' ? 'unknown' : 'no';
  emit(ledger, at, ANALYTICS_EVENTS.RETURN_SETUP_CHECKPOINT, { cutoff, alert, widget, evidence, last_alert: sample?.alert ?? 'unknown',
    last_widget: sample?.widget ?? 'unknown', ever_alert: ever(ledger.firstAlert, alert), ever_widget: ever(ledger.firstWidget, widget) });
}
function closeSession(ledger: Ledger, now: number) {
  if (ledger.sessionClosed || now - ledger.lastVisit < GAP) return;
  const sample = ledger.exit;
  const direct = ledger.sessionExit && sample?.at === ledger.lastVisit;
  const alert = direct && !ledger.alertHandoff ? sample.alert : 'unknown';
  const widget = direct && !ledger.handoff ? sample.widget : 'unknown';
  checkpoint(ledger, 'session_1', ledger.lastVisit, sample, alert, widget, direct && !ledger.handoff && !ledger.alertHandoff ? 'boundary' : 'incomplete');
  ledger.sessionClosed = true;
}
function closeDay(ledger: Ledger, sample: Sample, returned = false) {
  const end = ledger.first + WEEK;
  if (ledger.dayClosed || sample.at < end) return;
  const before = ledger.beforeDay;
  // Only bracket the boundary across two adjacent foreground samples. An unobserved
  // night, even with the same outcomes on either side, cannot prove a cutoff state.
  const direct = sample.at === end;
  const near = before && !returned && end - before.at <= 60_000 && sample.at - end <= 60_000 &&
    before.reason !== 'background' && before.reason !== 'native_callback' && sample.reason !== 'native_callback';
  const alert = direct ? sample.alert : near && !ledger.alertHandoff && before.alert === sample.alert &&
    (sample.alert !== 'yes' || before.validUntil > end) ? sample.alert : 'unknown';
  const widget = direct ? sample.widget : near && !ledger.handoff && before.widget === sample.widget ? sample.widget : 'unknown';
  checkpoint(ledger, 'day_7', end, before, alert, widget, direct ? 'boundary' : near ? 'bounded_interval' : 'incomplete');
  ledger.dayClosed = true;
}
// Network acknowledgement can take seconds. Serialize sends separately so a new
// background edge can reach disk while an older observation is in flight.
let uploads = Promise.resolve();
function flush() {
  uploads = uploads.then(async () => {
    const batch = await serialized(load);
    if (!batch) return;
    for (const [index, event] of batch.outbox.entries()) {
      if (!await enqueueSetupEvent(event.args, batch.nonce + '-' + event.id, event.at)) return;
      if (index === 0) retryFirstOpenAfterSetupUpload();
      await serialized(async () => {
        const current = await load();
        if (current?.nonce === batch.nonce && current.outbox[0]?.id === event.id) {
          current.outbox.shift();
          await save(current);
        }
      });
    }
  }).catch(() => undefined);
  return uploads;
}

export function recordSetup(input: SetupInput) {
  return serialized(async () => {
    const ledger = await load();
    if (!ledger) return;
    const { at, prayer, widget, exact, origin } = input;
    for (const receipt of widget.receipts) {
      if (receipt.seq <= ledger.nativeSeq) continue;
      ledger.nativeSeq = receipt.seq;
      if (receipt.at < ledger.first) continue;
      closeSession(ledger, receipt.at);
      const state = widgetState(ledger, receipt.present, receipt.added);
      const sample: Sample = { at: receipt.at, reason: 'native_callback', auth: 'unknown', pending: 'unknown',
        alert: 'unknown', widget: widgetOutcome(state), widgetState: state, validUntil: 0 };
      note(ledger, sample, receipt.added && receipt.present, receipt.pin, origin, exact);
      if (sample.at === ledger.first + WEEK) closeDay(ledger, sample);
      if (!ledger.sessionClosed && receipt.at >= ledger.lastVisit) {
        ledger.lastVisit = receipt.at;
        ledger.exit = sample;
        ledger.sessionExit = true;
        ledger.handoff = false;
      }
    }
    closeSession(ledger, at);
    if (input.foreground || input.reason === 'background') {
      if (at - ledger.lastForeground >= GAP) ledger.visitStart = at;
      ledger.lastForeground = at;
    }
    const state = widgetState(ledger, widget.present, false);
    const sample: Sample = { at, reason: input.reason, auth: prayer.auth, pending: prayer.pending,
      alert: prayer.auth === 'off' || prayer.auth === 'limited' || prayer.pending === 'none' ? 'no' :
        prayer.auth === 'full' && prayer.pending === 'some' && prayer.alerts.length > 0 ? 'yes' : 'unknown',
      validUntil: prayer.alerts.reduce((max, a) => Math.max(max, a.fireAt.getTime()), 0),
      widget: widgetOutcome(state), widgetState: state };
    note(ledger, sample, state === 'present', false, origin, exact, input.returned);
    closeDay(ledger, sample, input.returned);
    if (!ledger.sessionClosed && (input.foreground || input.reason === 'background')) {
      ledger.lastVisit = at;
      ledger.exit = sample;
      ledger.sessionExit = input.reason === 'background';
    }
    if (input.returned) {
      ledger.handoff = false;
      ledger.alertHandoff = false;
    }
    await save(ledger);
    if (widget.receipts.length) await acknowledgeReceipts(ledger.nativeSeq);
    return ledger.outbox.length > 0;
  }).then(pending => pending ? flush() : undefined).catch(() => undefined);
}
// Preserve the intent that produced a verified schedule, including across OS settings
// and process restarts. Queue this before the preference change triggers a new observation.
export function setReminderOrigin(origin: Origin) {
  return serialized(async () => {
    const ledger = await load();
    if (ledger && ledger.firstAlert === undefined) {
      ledger.reminderOrigin = origin;
      await save(ledger);
    }
  }).catch(() => undefined);
}

const scheduleListeners = new Set<() => void>();
export function onScheduleVerified(listener: () => void) {
  scheduleListeners.add(listener);
  return () => { scheduleListeners.delete(listener); };
}
export function notifyScheduleVerified() {
  for (const listener of scheduleListeners) listener();
}

export function markSetupHandoff(kind: 'widget' | 'alert', open: boolean) {
  return serialized(async () => {
    const ledger = await load();
    if (ledger) {
      if (kind === 'widget') ledger.handoff = open;
      else ledger.alertHandoff = open;
      await save(ledger);
    }
  }).catch(() => undefined);
}
export async function widgetOfferOccasion(at: number) {
  const ledger = await load().catch(() => null);
  return ledger && windowAt(ledger, at) === 'session_1' ? 'first_session' : 'later';
}
export function recoveryVisit() {
  return serialized(async () => {
    const ledger = await load();
    return ledger && { started: Date.now() - ledger.lastForeground >= GAP ? Date.now() : ledger.visitStart, verified: ledger.firstAlert !== undefined || ledger.firstWidget !== undefined };
  });
}
