// Has the user seen the introduction?
//
// The app opens on a map covered in twilight and six named curves, and until the
// introduction existed nothing on that screen said what any of it meant. The intro is
// therefore a one-time gate in front of the map (src/app/valkommen.tsx), and this module
// is the single fact that decides whether it runs.
//
// It lives in its OWN storage key rather than as a field on PrayerSettings, for the
// same reason lib/hints.ts gives: "Återställ appens standard" wipes PrayerSettings
// wholesale, and a factory reset must not drag a first-run wizard back in front of a
// user who has been using the app for months. (It also keeps the settings-shape drift
// guards in compute-signature.test.ts untouched.)
//
// The UPGRADE path is the subtle part and is why `decideIntroStatus` takes two blobs.
// This module ships to installs that already exist. Those users have already answered
// every question the intro asks — location, reminders, calculation method — and putting
// a wizard in front of them on an ordinary update reads as the app forgetting them. A
// persisted `prayerSettings:v1` blob is the evidence that this is not a fresh install,
// so it counts as the intro already being done. They reach it deliberately instead, via
// Inställningar → "Visa introduktionen igen" (which calls replayIntro).
import { storage } from './storage';

import { SETTINGS_STORAGE_KEY } from '@/lib/settings/store';

const STORAGE_KEY = 'introSeen:v1';
const PROGRESS_KEY = 'introStep:v1';
export const INTRO_STEPS = ['welcome', 'location', 'notifications', 'method'] as const;

/** 'unknown' is the pre-hydration state the gate renders nothing for — see intro-context. */
export type IntroStatus = 'unknown' | 'pending' | 'done';

/** How a pass through the introduction ended: its last step, or the welcome step's skip. */
export type IntroOutcome = 'completed' | 'skipped';

/** How this install came past the introduction, for analytics (the `intro_status` super
 *  property): one of the two outcomes, or 'not_shown' for an install that predates it and
 *  was let straight through (see the upgrade rule above). */
export type IntroHistory = IntroOutcome | 'not_shown';

/** What the two persisted blobs imply, as one pure function so the upgrade rule can be
 *  tested without touching storage.
 *
 *  Any non-null intro record means the intro has run — the value is written once and
 *  never read for anything else, so a corrupt or truncated blob still answers the only
 *  question being asked ("has this device been through it?") with yes. Erring that way
 *  is deliberate: showing the intro twice is a worse failure than skipping it once, and
 *  the manual replay row exists for anyone who wants it back. */
export function decideIntroStatus(
  introRaw: string | null,
  settingsRaw: string | null,
): 'pending' | 'done' {
  // Any non-empty record means it has run. (storage returns null for a missing key,
  // so an empty string can only be a failed half-write — treated as no record.)
  if (introRaw) return 'done';
  // No intro record, but settings already on disk → an install that predates the intro.
  return settingsRaw ? 'done' : 'pending';
}

/**
 * What the same two blobs say about HOW the introduction was passed, or null while it has
 * not been (a fresh install still in front of it).
 *
 * A record without an `outcome` was written before the outcome was kept, by a build that
 * wrote the same `{ completed: true }` for a finish and a skip. It reads as 'completed':
 * that is what the record says, and those installs' Intro Skipped events in the analytics
 * history are the only way to tell them apart. An unparseable record reads the same way,
 * for the reason decideIntroStatus gives.
 */
export function decideIntroHistory(
  introRaw: string | null,
  settingsRaw: string | null,
): IntroHistory | null {
  if (introRaw) {
    try {
      const record: unknown = JSON.parse(introRaw);
      if (typeof record === 'object' && record !== null && 'outcome' in record && record.outcome === 'skipped') {
        return 'skipped';
      }
    } catch {
      // Falls through: see above.
    }
    return 'completed';
  }
  return settingsRaw ? 'not_shown' : null;
}

/**
 * Read the completion, settings and progress records together. Never throws: unreadable
 * storage falls back to 'done' so a broken read can't trap the user in a wizard they can't
 * get past — the map is the app, and it must always be reachable.
 */
export async function loadIntro(): Promise<{ status: 'pending' | 'done'; history: IntroHistory | null; step?: number }> {
  try {
    // Indexed rather than destructured two levels deep: multiGet's result length is the
    // platform module's promise, not ours, and a short array would make the nested
    // `[, settingsRaw]` pattern throw on undefined — landing in the catch below and
    // silently reporting 'done', i.e. skipping the intro for a first-time user.
    const pairs = await storage.multiGet([STORAGE_KEY, SETTINGS_STORAGE_KEY, PROGRESS_KEY]);
    const introRaw = pairs[0]?.[1] ?? null;
    const settingsRaw = pairs[1]?.[1] ?? null;
    // A city or permission choice can create settings halfway through a fresh run.
    // The saved step distinguishes that install from one predating the introduction.
    const step = INTRO_STEPS.findIndex((name) => name === pairs[2]?.[1]);
    if (!introRaw && step >= 0) return { status: 'pending', history: null, step };
    return {
      status: decideIntroStatus(introRaw, settingsRaw),
      history: decideIntroHistory(introRaw, settingsRaw),
    };
  } catch {
    return { status: 'done', history: null };
  }
}

/** The gate alone. See loadIntro. */
export async function loadIntroStatus(): Promise<'pending' | 'done'> {
  return (await loadIntro()).status;
}

// Serialize navigation taps so a slow write from an earlier step cannot undo Back.
let progressWrite = Promise.resolve();
export function saveIntroStep(step: number, onlyIfMissing = false): Promise<boolean> {
  const name = INTRO_STEPS[step];
  if (!name) return Promise.resolve(false);
  const saved = progressWrite.then(async () => {
    if (onlyIfMissing) {
      const current = await storage.getItem(PROGRESS_KEY);
      if (INTRO_STEPS.some(stepName => stepName === current)) return;
    }
    await storage.setItem(PROGRESS_KEY, name);
  });
  progressWrite = saved.catch(() => undefined);
  return saved.then(() => true, () => false);
}

/** Mark the introduction as seen — finished OR skipped, and which. Best-effort: a failed
 *  write only means it may be offered once more, which is survivable.
 *
 *  `completed: true` stays in the record although nothing reads it any more: an older
 *  build (an OTA rollback) reads only that the record exists, and this keeps the record
 *  looking like the one it wrote. */
export async function completeIntro(outcome: IntroOutcome = 'completed'): Promise<void> {
  try {
    await storage.setItem(STORAGE_KEY, JSON.stringify({ completed: true, outcome }));
    await progressWrite;
    await storage.removeItem(PROGRESS_KEY);
  } catch {
    // Ignored on purpose — see above.
  }
}

// There is deliberately NO persisted `replayIntro`. Removing the record here would be a
// no-op that reads like a feature: by the time anyone can reach Inställningar → Visa
// introduktionen igen they necessarily have a settings blob, so the upgrade rule above
// would re-derive 'done' on the very next read. Replay is therefore an in-session flip in
// ./intro-context — show it now, navigate to it, and be back to normal on the next launch,
// which is also the behaviour you want: asking to re-read the explanation is not asking
// for a wizard on every cold start from now on.
