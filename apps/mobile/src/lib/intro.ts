// Has the user seen the introduction?
//
// The app opens on a map covered in twilight and six named curves, and until the
// introduction existed nothing on that screen said what any of it meant. The intro is
// therefore a one-time gate in front of the map (src/app/valkommen.tsx), and this module
// is the single fact that decides whether it runs.
//
// It lives in its OWN AsyncStorage key rather than as a field on PrayerSettings, for the
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
import AsyncStorage from '@react-native-async-storage/async-storage';

import { SETTINGS_STORAGE_KEY } from '@/lib/settings/store';

const STORAGE_KEY = 'introSeen:v1';

/** 'unknown' is the pre-hydration state the gate renders nothing for — see intro-context. */
export type IntroStatus = 'unknown' | 'pending' | 'done';

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
  // Any non-empty record means it has run. (AsyncStorage returns null for a missing key,
  // so an empty string can only be a failed half-write — treated as no record.)
  if (introRaw) return 'done';
  // No intro record, but settings already on disk → an install that predates the intro.
  return settingsRaw ? 'done' : 'pending';
}

/**
 * Read both blobs and decide. Never throws: unreadable storage falls back to 'done' so a
 * broken read can't trap the user in a wizard they can't get past — the map is the app,
 * and it must always be reachable.
 */
export async function loadIntroStatus(): Promise<'pending' | 'done'> {
  try {
    // Indexed rather than destructured two levels deep: multiGet's result length is the
    // platform module's promise, not ours, and a short array would make the nested
    // `[, settingsRaw]` pattern throw on undefined — landing in the catch below and
    // silently reporting 'done', i.e. skipping the intro for a first-time user.
    const pairs = await AsyncStorage.multiGet([STORAGE_KEY, SETTINGS_STORAGE_KEY]);
    return decideIntroStatus(pairs[0]?.[1] ?? null, pairs[1]?.[1] ?? null);
  } catch {
    return 'done';
  }
}

/** Mark the introduction as seen — finished OR skipped. Best-effort: a failed write only
 *  means it may be offered once more, which is survivable. */
export async function completeIntro(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ completed: true }));
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
