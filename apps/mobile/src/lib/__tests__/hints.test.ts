import { beforeEach, describe, expect, it } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { createHintStore, type HintRecord, shouldShowHint } from '@/lib/hints';

function record(patch: Partial<HintRecord> = {}): HintRecord {
  return { launches: 1, shown: 0, resolved: false, ...patch };
}

// The policy itself is walked end-to-end in __tests__/notification-hint.test.ts, through
// the public API that predates this extraction — that suite is the behavioural guard, and
// it passing unchanged is what proves the refactor preserved the notification card. What
// is tested HERE is only what the extraction added: that the numbers are per-instance and
// that two hints stay independent.
describe('shouldShowHint policy parameters', () => {
  it('reads the retry threshold and cap from the caller, not from constants', () => {
    const eager = { retryAfterLaunches: 2, maxShowings: 3 };
    // Launch 2 already unlocks the retry here, where the notification hint waits for 4.
    expect(shouldShowHint(record({ launches: 2, shown: 1 }), eager)).toBe(true);
    // ...and a third showing is still allowed, where the notification hint stops at two.
    expect(shouldShowHint(record({ launches: 9, shown: 2 }), eager)).toBe(true);
    expect(shouldShowHint(record({ launches: 9, shown: 3 }), eager)).toBe(false);
  });

  it('never shows a hint whose cap is zero, however many launches pass', () => {
    const never = { retryAfterLaunches: 1, maxShowings: 0 };
    expect(shouldShowHint(record({ launches: 1, shown: 0 }), never)).toBe(false);
    expect(shouldShowHint(record({ launches: 500, shown: 0 }), never)).toBe(false);
  });
});

// THE property the offer queue in bonetider.tsx depends on. The map may show at most one
// unprompted card per launch, so on a launch where the location card wins, the
// notification card is DEFERRED — not consumed. If the two stores shared a launch counter
// or a storage key, the notification hint's single retry would be burned by launches on
// which it was never even rendered, and a user who dismissed the location card twice
// would then never be told that prayer reminders exist at all.
describe('two hint stores are independent', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  const policy = { retryAfterLaunches: 4, maxShowings: 2 };

  it('keeps separate records and separate launch guards', async () => {
    const a = createHintStore('hintA:v1', policy);
    const b = createHintStore('hintB:v1', policy);

    // Store A counts a launch and burns a showing; B is untouched by both.
    await a.noteLaunch();
    await a.noteShown();
    expect(await a.loadRecord()).toEqual({ launches: 1, shown: 1, resolved: false });
    expect(await b.loadRecord()).toEqual({ launches: 0, shown: 0, resolved: false });

    // B's own launch guard is still unspent, so it counts its first launch here — the
    // launches A saw did not tick B's retry clock forward.
    expect((await b.noteLaunch()).launches).toBe(1);
    expect((await a.loadRecord()).launches).toBe(1);

    // Resolving one must not silence the other.
    await a.noteResolved();
    expect(a.shouldShow(await a.loadRecord())).toBe(false);
    expect(b.shouldShow(await b.loadRecord())).toBe(true);
  });

  it('writes each record under its own storage key', async () => {
    const a = createHintStore('hintA:v1', policy);
    await a.noteLaunch();

    expect(await AsyncStorage.getItem('hintA:v1')).toBeTruthy();
    expect(await AsyncStorage.getItem('hintB:v1')).toBeNull();
  });

  it('resets only its own launch guard for tests', async () => {
    const a = createHintStore('hintA:v1', policy);
    const b = createHintStore('hintB:v1', policy);
    await a.noteLaunch();
    await b.noteLaunch();

    a.resetLaunchCountForTests();
    expect((await a.noteLaunch()).launches).toBe(2);
    // b's guard is still set, so a repeat call is still a no-op for it.
    expect((await b.noteLaunch()).launches).toBe(1);
  });
});
