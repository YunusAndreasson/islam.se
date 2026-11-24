import { uuid } from 'expo';
import { haversineKm, isValidLatLng } from './coordinates';
import { readCachedFix } from './location/gps-cache';
import type { LatLng } from './prayer-times';
import { computeSignature } from './settings/compute-signature';
import { storage } from './storage';
import { loadIntro } from './intro';
import { wereRemindersDisabled } from './notification-hint';
import { NOTIFY_PRAYERS, readReminderAuthorization } from './notifications';
import { DEFAULT_SETTINGS, type NotificationSettings, type PrayerSettings } from './settings/types';

export type PrayerMask = NotificationSettings['prayers'];
const DRAFT = 'firstReadingDraft:v1';
const SESSION_GAP = 30 * 60_000;

export function reminderSelection(prayers: PrayerMask): NotificationSettings {
  return { ...DEFAULT_SETTINGS.notifications, enabled: true, prayers };
}

export function reminderPlace(settings: PrayerSettings, coords?: { latitude: number; longitude: number }, label?: string) {
  return JSON.stringify({ optOutId: settings.reminderOptOutId, mode: settings.locationMode, method: computeSignature(settings),
    place: settings.locationMode === 'manual' ? settings.manualLocation : null, ...coords, label });
}

// Allow city-level GPS jitter without transferring a reminder grant to another place.
export function withinGpsHandoff(a: unknown, b: LatLng) {
  return isValidLatLng(a) && haversineKm(a.latitude, a.longitude, b.latitude, b.longitude) <= 1;
}

export async function acceptedGpsForResume(): Promise<LatLng | null> {
  try {
    const raw = await storage.getItem(DRAFT);
    if (!raw) return await readCachedFix();
    const place = JSON.parse(JSON.parse(raw).place);
    return place.mode === 'gps' && isValidLatLng(place) ? { latitude: place.latitude, longitude: place.longitude } : null;
  } catch { return null; }
}

function samePlace(saved: string, current: string) {
  try {
    const a = JSON.parse(saved);
    const b = JSON.parse(current);
    return a.optOutId === b.optOutId && a.method === b.method && a.mode === b.mode &&
      (a.mode === 'gps' && isValidLatLng(b) && withinGpsHandoff(a, b) ||
       a.mode === 'manual' && a.place && JSON.stringify(a.place) === JSON.stringify(b.place));
  } catch { return saved === current; } // Older drafts use a plain place key.
}

let handoffs = Promise.resolve();
function ordered<T>(work: () => Promise<T>) {
  const result = handoffs.then(work);
  handoffs = result.then(() => undefined, () => undefined);
  return result;
}
export function saveReminderDraft(place: string, prayers: PrayerMask) {
  return ordered(async () => {
    const afterDisable = await wereRemindersDisabled();
    await storage.setItem(DRAFT, JSON.stringify({ id: uuid.v4(), place, prayers, savedAt: Date.now(), afterDisable }));
  });
}
async function matchingDraft(place: string) {
  const raw = await storage.getItem(DRAFT);
  if (!raw) return null;
  const draft = JSON.parse(raw);
  if (!samePlace(draft.place, place)) return null;
  // Older saved preferences have only the separate deliberate-disable marker.
  if (!draft.afterDisable && await wereRemindersDisabled()) return null;
  const age = Date.now() - draft.savedAt;
  if (!(age >= 0 && age < SESSION_GAP)) {
    // Keep a settled OS answer recoverable until the matching preferences reach disk.
    if (!draft.id || !place.startsWith('{') || await readReminderAuthorization() === 'undetermined') {
      await storage.removeItem(DRAFT);
      return null;
    }
  }
  if (!NOTIFY_PRAYERS.every(key => typeof draft.prayers?.[key] === 'boolean') ||
      !NOTIFY_PRAYERS.some(key => draft.prayers[key])) return null;
  return draft.prayers as PrayerMask;
}
export function readReminderDraft(place: string) {
  return ordered(() => matchingDraft(place)).catch(() => null);
}

export function clearReminderDraft() {
  return ordered(() => storage.removeItem(DRAFT)).catch(() => undefined);
}

async function persistedReminderPlace(settings: PrayerSettings) {
  const fix = settings.locationMode === 'gps' ? await readCachedFix() : null;
  return reminderPlace(settings, fix ?? undefined);
}

// Hydration also runs when the intro already completed before a failed preference write.
export async function recoverReminderGrant(settings: PrayerSettings): Promise<PrayerSettings> {
  const mask = await readReminderDraft(await persistedReminderPlace(settings));
  if (!mask) return settings;
  if (settings.notifications.enabled) {
    await acknowledgeReminderGrant(settings);
    return settings;
  }
  // A pending first reading resumes its own preview, location and completion flow.
  if ((await loadIntro()).status === 'pending') return settings;
  return await readReminderAuthorization() === 'granted' ? { ...settings, notifications: reminderSelection(mask) } : settings;
}

export function acknowledgeReminderGrant(settings: PrayerSettings) {
  return ordered(async () => {
    if (!settings.notifications.enabled) return;
    const mask = await matchingDraft(await persistedReminderPlace(settings));
    if (mask && NOTIFY_PRAYERS.every(key => mask[key] === settings.notifications.prayers[key])) await storage.removeItem(DRAFT);
  }).catch(() => undefined);
}

// Serialize the read and claim: a resume and a reconciliation can witness the same event.
let claims = Promise.resolve();
export function firstReadingEventOnce(key: string, send: () => void) {
  claims = claims.then(async () => {
    const marker = 'firstReadingEvent:v1:' + key;
    if (await storage.getItem(marker)) return;
    await storage.setItem(marker, '1');
    send();
  }).catch(() => undefined);
  return claims;
}

type Window = 'session_1' | 'through_day_7' | 'later';
const VISIT = 'firstReadingVisit:v1';
let visits = Promise.resolve();
export async function observeReadingVisit(now = Date.now()): Promise<Window | null> {
  let window: Window | null = null;
  visits = visits.then(async () => {
    const raw = await storage.getItem(VISIT);
    const previous = raw ? JSON.parse(raw) : { first: now, last: now, ended: false };
    const ended = previous.ended || now - previous.last >= SESSION_GAP;
    window = !ended ? 'session_1' : now - previous.first <= 7 * 86400_000 ? 'through_day_7' : 'later';
    await storage.setItem(VISIT, JSON.stringify({ first: previous.first, last: now, ended }));
  }).catch(() => undefined);
  await visits;
  return window;
}
