// When may the map offer its "turn on prayer reminders" hint?
//
// The hint is a SOFT ASK. It exists because iOS grants exactly one notification
// prompt per install: spend it cold at launch and a reflexive "Don't allow" locks
// the app's most valuable feature away behind the system Settings app forever.
// So the card explains the offer first, and only its button fires the real dialog.
//
// The policy itself — first launch, one quiet retry, then never — lives in ./hints,
// shared with the location soft-ask. This file is only the notification instance:
// its storage key and its numbers. Every export is named for THIS hint, exactly
// parallel to ./location-hint's — the two are read side by side in bonetider.tsx's
// soft-ask queue, and an unprefixed `shouldShowHint` there both hid which card was
// being decided and collided with ./hints' differently-shaped `shouldShowHint(record,
// policy)`.
import { createHintStore } from './hints';

const STORAGE_KEY = 'notificationHintSeen:v1';

/** Launch at which the single retry becomes available, if the first showing went unanswered. */
const RETRY_AFTER_LAUNCHES = 4;
/** Hard cap on how many times the card may ever appear. */
const MAX_SHOWINGS = 2;

const store = createHintStore(STORAGE_KEY, {
  retryAfterLaunches: RETRY_AFTER_LAUNCHES,
  maxShowings: MAX_SHOWINGS,
});

export const loadNotificationHintRecord = store.loadRecord;
export const noteNotificationLaunch = store.noteLaunch;
export const noteNotificationShown = store.noteShown;
export const noteNotificationResolved = store.noteResolved;
export const resetNotificationLaunchCountForTests = store.resetLaunchCountForTests;
/** The re-show policy for the notification card. See ./hints for what it decides. */
export const shouldShowNotificationHint = store.shouldShow;
