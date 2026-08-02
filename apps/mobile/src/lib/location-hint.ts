// When may the map offer its "use my location" hint?
//
// Same soft-ask reasoning as the notification card (see ./hints), with an extra edge:
// the location dialog used to fire from a MOUNT EFFECT, so on a first launch the OS
// alert landed on top of the daybreak intro — a question about a screen the user had
// not seen yet. Now the mount effect only reads an already-granted permission, and
// this card's button is the one thing in the app that can prompt.
//
// Same numbers as the notification hint on purpose: two showings, one quiet retry.
// The stakes are higher here (without a fix the times are simply another city's), but
// that argues for offering the card at the right MOMENT, not for asking more often —
// and the user always has the manual city picker, which the card links to.
import { createHintStore, type HintRecord } from './hints';

const STORAGE_KEY = 'locationHintSeen:v1';

/** Launch at which the single retry becomes available, if the first showing went unanswered. */
const RETRY_AFTER_LAUNCHES = 4;
/** Hard cap on how many times the card may ever appear. */
const MAX_SHOWINGS = 2;

const store = createHintStore(STORAGE_KEY, {
  retryAfterLaunches: RETRY_AFTER_LAUNCHES,
  maxShowings: MAX_SHOWINGS,
});

export type { HintRecord };

export const loadLocationHintRecord = store.loadRecord;
export const noteLocationLaunch = store.noteLaunch;
export const noteLocationShown = store.noteShown;
export const noteLocationResolved = store.noteResolved;
export const resetLocationLaunchCountForTests = store.resetLaunchCountForTests;
/** The re-show policy for the location card. See ./hints for what it decides. */
export const shouldShowLocationHint = store.shouldShow;
