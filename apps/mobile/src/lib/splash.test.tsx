// The splash gate's contract, which is worth a test rather than a careful reading because
// both ways it can fail are invisible in normal use and unrecoverable when they happen:
//
//   1. Hiding too EARLY puts the app back where it started — the splash gone while
//      app/index.tsx still renders `null`, so the user watches a blank screen while two
//      AsyncStorage reads decide which screen this launch is.
//   2. Never hiding at all strands the user on a splash with no way out. Both loaders
//      resolve on failure by design, so the only route to this is a native promise that
//      never settles — which no catch can see, and which only the timeout covers.
//
// Nothing here asserts WHICH screen was chosen; that is app/index.tsx's job and
// intro.test.ts owns the rule it reads.
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render } from '@testing-library/react-native';
import * as SplashScreen from 'expo-splash-screen';

import { IntroProvider } from '@/lib/intro-context';
import { SettingsProvider } from '@/lib/settings/context';
import { SplashGate } from '@/lib/splash';

// Read at module scope, because the thing being asserted happened when the import above was
// evaluated — before any test, and before beforeEach's clearAllMocks() erases the record of
// it. Checking the live mock inside a test would only ever see zero.
const pinnedOnImport = jest.mocked(SplashScreen.preventAutoHideAsync).mock.calls.length;

function mount() {
  return render(
    <SettingsProvider>
      <IntroProvider>
        <SplashGate />
      </IntroProvider>
    </SettingsProvider>,
  );
}

describe('the splash gate', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('pins the splash before anything renders', () => {
    // Module scope, not an effect: the API's own note is that a call from inside a component
    // or hook "might be called too late, when the splash screen is already hidden". So this
    // must already have happened by the time the import completes — before any mount.
    expect(pinnedOnImport).toBeGreaterThanOrEqual(1);
  });

  it('holds the splash until both storage reads have landed, then hides it once', async () => {
    mount();
    // The mount itself must not be enough. At this point the providers have rendered but
    // neither read has resolved, so the app does not yet know whether this launch belongs to
    // the introduction or to the map — which is exactly the gap that used to be a blank
    // frame the user could see.
    expect(SplashScreen.hide).not.toHaveBeenCalled();

    await act(async () => {});

    expect(SplashScreen.hide).toHaveBeenCalledTimes(1);
  });

  it('hides anyway when a storage read never settles', async () => {
    // Not a rejection — a promise that never resolves at all, which is what a wedged native
    // module looks like and what the loaders' own catch blocks cannot help with. Without the
    // timeout the user sits on the splash for the life of the process.
    jest.mocked(AsyncStorage.multiGet).mockReturnValue(new Promise(() => {}) as never);
    jest.useFakeTimers();
    try {
      mount();
      expect(SplashScreen.hide).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      expect(SplashScreen.hide).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
      jest.mocked(AsyncStorage.multiGet).mockReset();
    }
  });
});
