// How often may the map offer an unprompted card?
//
// The app has two SOFT ASKS — reminders and location — and they share one problem:
// each stands in front of an OS permission dialog that can be spent exactly once.
// Fire it cold and a reflexive "Don't allow" locks the feature behind the system
// Settings app forever. So a card explains the offer first, and only its button
// fires the real dialog. Everything in this file is about the *card's* frequency:
// dismissing one never touches the OS prompt, which stays unspent.
//
// The policy: show it on the first launch. If the user dismisses it — or simply
// ignores it and leaves — stay quiet for a couple of launches, offer it once more,
// then never again. A first-launch dismissal is often reflexive; one calm retry
// recovers those users. `maxShowings` is the cap, whatever happens.
//
// Each hint lives in its OWN AsyncStorage key rather than as a field on
// PrayerSettings, deliberately: "Återställ appens standard" wipes PrayerSettings
// wholesale, and a factory reset should not resurrect a hint the user already
// answered. (It also keeps the settings-shape drift guards in
// compute-signature.test.ts untouched.)
//
// This module is the shared policy; ./notification-hint and ./location-hint are its
// two instantiations. It is a factory rather than a base class so each hint keeps its
// own launch-count guard — a card being shown must never mark the other one as seen.
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface HintRecord {
  /** Cold launches counted so far (this one included). */
  launches: number;
  /** How many times the card has been presented. */
  shown: number;
  /** The user acted on the CTA and the OS gave a definitive answer — we're done asking. */
  resolved: boolean;
}

export interface HintPolicy {
  /** Launch at which the single retry becomes available, if the first showing went unanswered. */
  retryAfterLaunches: number;
  /** Hard cap on how many times the card may ever appear. */
  maxShowings: number;
}

export const EMPTY_HINT_RECORD: HintRecord = { launches: 0, shown: 0, resolved: false };

/**
 * The whole re-show policy, as one pure expression so it can be tested without
 * touching storage, the clock, or React.
 *
 * - `resolved` short-circuits everything: they answered, never ask again.
 * - `shown === 0` → the first launch, show it.
 * - `shown === 1` → hold until `retryAfterLaunches` for the one retry.
 * - `shown >= maxShowings` → done.
 */
export function shouldShowHint(record: HintRecord, policy: HintPolicy): boolean {
  if (record.resolved) return false;
  if (record.shown >= policy.maxShowings) return false;
  return record.shown === 0 || record.launches >= policy.retryAfterLaunches;
}

function sanitize(raw: unknown): HintRecord {
  if (typeof raw !== 'object' || raw === null) return EMPTY_HINT_RECORD;
  const r = raw as Record<string, unknown>;
  const count = (value: unknown): number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  return {
    launches: count(r.launches),
    shown: count(r.shown),
    resolved: r.resolved === true,
  };
}

export interface HintStore {
  /** The persisted record, or an empty one if absent/unreadable. Never throws. */
  loadRecord: () => Promise<HintRecord>;
  /** Count this cold launch and return the resulting record. Idempotent within a JS context. */
  noteLaunch: () => Promise<HintRecord>;
  /** The card was presented. Counts against the policy's `maxShowings`. */
  noteShown: () => Promise<void>;
  /** The user tapped the CTA and the OS answered — granted or denied, we stop asking. */
  noteResolved: () => Promise<void>;
  /** This hint's policy, applied to a record. */
  shouldShow: (record: HintRecord) => boolean;
  /** Test seam — reset the once-per-context launch guard. */
  resetLaunchCountForTests: () => void;
}

/** One hint's storage + policy. Every member is a closure, so callers may destructure
 *  or re-export them individually without losing their binding. */
export function createHintStore(storageKey: string, policy: HintPolicy): HintStore {
  const loadRecord = async (): Promise<HintRecord> => {
    try {
      const raw = await AsyncStorage.getItem(storageKey);
      return raw ? sanitize(JSON.parse(raw)) : EMPTY_HINT_RECORD;
    } catch {
      // A hint is a nicety — an unreadable record must never break the map screen.
      // Treating it as empty is the safe read: at worst the user is offered the hint
      // once more, which the maxShowings cap still bounds.
      return EMPTY_HINT_RECORD;
    }
  };

  const save = async (record: HintRecord): Promise<HintRecord> => {
    try {
      await AsyncStorage.setItem(storageKey, JSON.stringify(record));
    } catch {
      // Best-effort: an unwritable record means the hint may be offered again later.
    }
    return record;
  };

  // Counting happens once per JS context. A module-scope flag (the same trick
  // bonetider.tsx uses for `introConsumed`) survives component remounts — navigating
  // to Inställningar and back must not look like a new launch — but resets on a cold
  // start, which is exactly the event we want to count. It is per-STORE, so the two
  // hints count launches independently.
  let launchCounted = false;

  return {
    loadRecord,
    noteLaunch: async () => {
      const record = await loadRecord();
      if (launchCounted) return record;
      launchCounted = true;
      return save({ ...record, launches: record.launches + 1 });
    },
    noteShown: async () => {
      const record = await loadRecord();
      await save({ ...record, shown: record.shown + 1 });
    },
    noteResolved: async () => {
      const record = await loadRecord();
      await save({ ...record, resolved: true });
    },
    shouldShow: (record) => shouldShowHint(record, policy),
    resetLaunchCountForTests: () => {
      launchCounted = false;
    },
  };
}
