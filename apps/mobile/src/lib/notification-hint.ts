// When may the map offer its "turn on prayer reminders" hint?
//
// The hint is a SOFT ASK. It exists because iOS grants exactly one notification
// prompt per install: spend it cold at launch and a reflexive "Don't allow" locks
// the app's most valuable feature away behind the system Settings app forever.
// So the card explains the offer first, and only its button fires the real dialog.
// Everything here is about the *card's* frequency — dismissing it never touches
// the OS prompt, which stays unspent.
//
// The policy: show it on the first launch. If the user dismisses it — or simply
// ignores it and leaves — stay quiet for a couple of launches, offer it once more,
// then never again. A first-launch dismissal is often reflexive; one calm retry
// recovers those users. Two showings is the cap, whatever happens.
//
// This lives in its OWN AsyncStorage key rather than as a field on PrayerSettings,
// deliberately: "Återställ appens standard" wipes PrayerSettings wholesale, and a
// factory reset should not resurrect a hint the user already answered. (It also
// keeps the settings-shape drift guards in compute-signature.test.ts untouched.)
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'notificationHintSeen:v1';

/** Launch at which the single retry becomes available, if the first showing went unanswered. */
const RETRY_AFTER_LAUNCHES = 4;
/** Hard cap on how many times the card may ever appear. */
const MAX_SHOWINGS = 2;

export interface HintRecord {
  /** Cold launches counted so far (this one included). */
  launches: number;
  /** How many times the card has been presented. */
  shown: number;
  /** The user acted on the CTA and the OS gave a definitive answer — we're done asking. */
  resolved: boolean;
}

const EMPTY: HintRecord = { launches: 0, shown: 0, resolved: false };

/**
 * The whole re-show policy, as one pure expression so it can be tested without
 * touching storage, the clock, or React.
 *
 * - `resolved` short-circuits everything: they answered, never ask again.
 * - `shown === 0` → the first launch, show it.
 * - `shown === 1` → hold until {@link RETRY_AFTER_LAUNCHES} for the one retry.
 * - `shown >= MAX_SHOWINGS` → done.
 */
export function shouldShowHint(record: HintRecord): boolean {
  if (record.resolved) return false;
  if (record.shown >= MAX_SHOWINGS) return false;
  return record.shown === 0 || record.launches >= RETRY_AFTER_LAUNCHES;
}

function sanitize(raw: unknown): HintRecord {
  if (typeof raw !== 'object' || raw === null) return EMPTY;
  const r = raw as Record<string, unknown>;
  const count = (value: unknown): number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  return {
    launches: count(r.launches),
    shown: count(r.shown),
    resolved: r.resolved === true,
  };
}

export async function loadHintRecord(): Promise<HintRecord> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? sanitize(JSON.parse(raw)) : EMPTY;
  } catch {
    // A hint is a nicety — an unreadable record must never break the map screen.
    // Treating it as empty is the safe read: at worst the user is offered the hint
    // once more, which the MAX_SHOWINGS cap still bounds.
    return EMPTY;
  }
}

async function save(record: HintRecord): Promise<HintRecord> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Best-effort: an unwritable record means the hint may be offered again later.
  }
  return record;
}

// Counting happens once per JS context. A module-scope flag (the same trick
// bonetider.tsx uses for `introConsumed`) survives component remounts — navigating
// to Inställningar and back must not look like a new launch — but resets on a cold
// start, which is exactly the event we want to count.
let launchCounted = false;

/** Count this cold launch and return the resulting record. Idempotent within a JS context. */
export async function noteLaunch(): Promise<HintRecord> {
  const record = await loadHintRecord();
  if (launchCounted) return record;
  launchCounted = true;
  return save({ ...record, launches: record.launches + 1 });
}

/** The card was presented. Counts against {@link MAX_SHOWINGS}. */
export async function noteShown(): Promise<void> {
  const record = await loadHintRecord();
  await save({ ...record, shown: record.shown + 1 });
}

/** The user tapped the CTA and the OS answered — granted or denied, we stop asking. */
export async function noteResolved(): Promise<void> {
  const record = await loadHintRecord();
  await save({ ...record, resolved: true });
}

/** Test seam — reset the once-per-context launch guard. */
export function resetLaunchCountForTests(): void {
  launchCounted = false;
}
