import { beforeEach, describe, expect, it } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { HintRecord } from '@/lib/hints';
import {
  loadNotificationHintRecord,
  noteNotificationLaunch,
  noteNotificationResolved,
  noteNotificationShown,
  resetNotificationLaunchCountForTests,
  shouldShowNotificationHint,
} from '@/lib/notification-hint';

const KEY = 'notificationHintSeen:v1';

function record(patch: Partial<HintRecord> = {}): HintRecord {
  return { launches: 1, shown: 0, resolved: false, ...patch };
}

describe('shouldShowNotificationHint', () => {
  // The policy in full, walked as one sequence. Getting the frequency wrong is not a
  // cosmetic bug: too often and a faith app nags; too rarely and the user never learns
  // that prayer reminders exist at all, which is the app's whole reason to be.
  it('shows on the first launch, holds for two, offers once more, then stops', () => {
    expect(shouldShowNotificationHint(record({ launches: 1, shown: 0 }))).toBe(true);
    // Dismissed or ignored — stay quiet while the user settles in.
    expect(shouldShowNotificationHint(record({ launches: 2, shown: 1 }))).toBe(false);
    expect(shouldShowNotificationHint(record({ launches: 3, shown: 1 }))).toBe(false);
    // One retry: a first-launch dismissal is often reflexive.
    expect(shouldShowNotificationHint(record({ launches: 4, shown: 1 }))).toBe(true);
    // Two showings is the cap, forever.
    expect(shouldShowNotificationHint(record({ launches: 5, shown: 2 }))).toBe(false);
    expect(shouldShowNotificationHint(record({ launches: 500, shown: 2 }))).toBe(false);
  });

  // `resolved` means the user tapped the CTA and the OS answered. Re-offering after that
  // would ask a question they already answered — and on a refusal the button could no
  // longer do anything anyway, since iOS spends its single dialog once.
  it('never shows again once the user has answered the prompt', () => {
    expect(shouldShowNotificationHint(record({ shown: 0, resolved: true }))).toBe(false);
    expect(shouldShowNotificationHint(record({ launches: 99, shown: 1, resolved: true }))).toBe(false);
  });
});

describe('hint record persistence', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    resetNotificationLaunchCountForTests();
  });

  it('counts a cold launch once, however many times it is called', async () => {
    expect((await noteNotificationLaunch()).launches).toBe(1);
    // Remounting the map screen (navigating to Inställningar and back) must not read as
    // a new launch — that would burn through the retry delay in a single session.
    expect((await noteNotificationLaunch()).launches).toBe(1);
    expect((await noteNotificationLaunch()).launches).toBe(1);

    resetNotificationLaunchCountForTests(); // stand-in for a cold start
    expect((await noteNotificationLaunch()).launches).toBe(2);
  });

  it('accumulates showings and the resolved flag', async () => {
    await noteNotificationLaunch();
    await noteNotificationShown();
    expect(await loadNotificationHintRecord()).toEqual({ launches: 1, shown: 1, resolved: false });

    await noteNotificationResolved();
    expect(await loadNotificationHintRecord()).toEqual({ launches: 1, shown: 1, resolved: true });
  });

  // A hint is a nicety. Corrupt or hand-edited storage must degrade to "offer it again",
  // never throw — this record is read during the map screen's first paint.
  it('falls back to an empty record when storage holds garbage', async () => {
    await AsyncStorage.setItem(KEY, 'not json at all');
    expect(await loadNotificationHintRecord()).toEqual({ launches: 0, shown: 0, resolved: false });

    await AsyncStorage.setItem(KEY, JSON.stringify({ launches: -4, shown: 'lots' }));
    expect(await loadNotificationHintRecord()).toEqual({ launches: 0, shown: 0, resolved: false });
  });

  it('survives a round trip through storage', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ launches: 3, shown: 1, resolved: false }));
    const stored = await loadNotificationHintRecord();
    expect(stored).toEqual({ launches: 3, shown: 1, resolved: false });
    // The reason the shape matters: this is the state that unlocks the single retry.
    expect(shouldShowNotificationHint({ ...stored, launches: stored.launches + 1 })).toBe(true);
  });
});
