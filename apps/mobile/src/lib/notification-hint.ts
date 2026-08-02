// When may the map offer its "turn on prayer reminders" hint?
//
// The hint is a SOFT ASK. It exists because iOS grants exactly one notification
// prompt per install: spend it cold at launch and a reflexive "Don't allow" locks
// the app's most valuable feature away behind the system Settings app forever.
// So the card explains the offer first, and only its button fires the real dialog.
//
// The policy itself — first launch, one quiet retry, then never — lives in ./hints,
// shared with the location soft-ask. This file is only the notification instance:
// its storage key and its numbers. The public API is unchanged from when the policy
// lived here, which is what lets __tests__/notification-hint.test.ts go on guarding
// the behaviour through the extraction.
import { createHintStore, type HintRecord } from './hints';

const STORAGE_KEY = 'notificationHintSeen:v1';

/** Launch at which the single retry becomes available, if the first showing went unanswered. */
const RETRY_AFTER_LAUNCHES = 4;
/** Hard cap on how many times the card may ever appear. */
const MAX_SHOWINGS = 2;

const store = createHintStore(STORAGE_KEY, {
  retryAfterLaunches: RETRY_AFTER_LAUNCHES,
  maxShowings: MAX_SHOWINGS,
});

export type { HintRecord };

export const loadHintRecord = store.loadRecord;
export const noteLaunch = store.noteLaunch;
export const noteShown = store.noteShown;
export const noteResolved = store.noteResolved;
export const resetLaunchCountForTests = store.resetLaunchCountForTests;
/** The re-show policy for the notification card. See ./hints for what it decides. */
export const shouldShowHint = store.shouldShow;
