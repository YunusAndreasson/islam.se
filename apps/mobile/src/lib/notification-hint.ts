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
import { storage } from './storage';
import { createSoftAskStore } from './hints';
import type { NotificationPermissionState } from './notifications';

const STORAGE_KEY = 'notificationHintSeen:v1';
const store = createSoftAskStore(STORAGE_KEY);

export const loadNotificationHintRecord = store.loadRecord;
export const noteNotificationLaunch = store.noteLaunch;
export const noteNotificationShown = store.noteShown;
export const noteNotificationResolved = store.noteResolved;
export const resetNotificationLaunchCountForTests = store.resetLaunchCountForTests;
/** The re-show policy for the notification card. See ./hints for what it decides. */
export const shouldShowNotificationHint = store.shouldShow;

/**
 * Whether the card has anything to offer a reader whose reminders are OFF, before its
 * frequency policy is asked: the OS permission, and the platform it is read on.
 *
 * 'undetermined' everywhere: the card's button raises the dialog. A refusal never: the
 * button could not do anything. 'granted' only on Android. There it says nothing about the
 * reader: Android grants notifications by default below 13 (API 33) and pre-grants them when
 * a phone is upgraded to 13, so an install that never once turned reminders on reads
 * 'granted'. Requiring 'undetermined' there meant those readers, most of them installs from
 * before the introduction existed, never saw the card at all. Its button then simply turns
 * reminders on, with no dialog. On iOS 'granted' can only come from an earlier yes in this
 * app, which turned reminders on with it, so reminders being off now is the reader's own
 * choice, and the card stays away. (Android readers who switched reminders off in
 * Inställningar are kept out the same way: the switch resolves this record.)
 */
export function remindersOfferable(permission: NotificationPermissionState, os: string): boolean {
  if (permission === 'undetermined') return true;
  return permission === 'granted' && os === 'android';
}

export const REMINDERS_DECLINED_KEY = 'remindersDeclined:v1';
export async function recordReminderDenial() {
  // A later read of the same blocked OS state must not restart the 24-hour clock.
  try {
    if (!await storage.getItem(REMINDERS_DECLINED_KEY)) {
      await storage.setItem(REMINDERS_DECLINED_KEY, String(Date.now()));
    }
  } catch {
    // A storage failure must still let the user leave the declined screen.
  }
}

const RECOVERED = 'remindersRecoveryShown:v1';
const DISABLED = 'remindersDeliberatelyDisabled:v1';
export const wereRemindersDisabled = async () => (await storage.getItem(DISABLED)) !== null;
export const markRemindersDisabled = () => storage.setItem(DISABLED, '1').catch(() => undefined);
let recoveryClaim = Promise.resolve();
// Persist the cap under the same queue as its eligibility check, including two
// settings screens mounting together. A blurred screen must not spend the cap.
export async function claimReminderRecovery(visitStart: number, eligible: () => boolean, now = Date.now()) {
  let claimed = false;
  recoveryClaim = recoveryClaim.then(async () => {
    const [denial, shown, disabled] = await Promise.all([REMINDERS_DECLINED_KEY, RECOVERED, DISABLED].map(key => storage.getItem(key)));
    if (!denial || !Number.isFinite(Number(denial)) || now - Number(denial) < 86400_000 ||
        visitStart <= Number(denial) || shown || disabled || !eligible()) return;
    await storage.setItem(RECOVERED, '1');
    claimed = true;
  }).catch(() => undefined);
  await recoveryClaim;
  return claimed;
}
