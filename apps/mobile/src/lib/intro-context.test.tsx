// The context layer intro.test.ts doesn't reach: mapLessonPending, the flag that lets
// bonetider.tsx show the map lesson in place of the dock. onboarding.test.tsx pins the
// wizard's own steps and never mounts bonetider.tsx, so this is the seam between the two
// — complete() arming the flag, dismissMapLesson() clearing it, and the no-provider
// default a screen mounted alone (most of bonetider.tsx's own tests) falls back to.
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook } from '@testing-library/react-native';

import { IntroProvider, useIntro, useOptionalMapLesson } from './intro-context';

describe('mapLessonPending', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('starts false, and complete() arms it', async () => {
    const { result } = renderHook(() => useIntro(), { wrapper: IntroProvider });
    await act(async () => {});

    expect(result.current.mapLessonPending).toBe(false);

    act(() => {
      result.current.complete();
    });

    expect(result.current.mapLessonPending).toBe(true);
    // complete() still does its original job too — the two are not exclusive.
    expect(result.current.status).toBe('done');
  });

  it('clears on dismissMapLesson(), and only that', async () => {
    const { result } = renderHook(() => useIntro(), { wrapper: IntroProvider });
    await act(async () => {});

    act(() => {
      result.current.complete();
    });
    expect(result.current.mapLessonPending).toBe(true);

    act(() => {
      result.current.dismissMapLesson();
    });

    expect(result.current.mapLessonPending).toBe(false);
    // Dismissing the lesson is not the same event as finishing the wizard — status stays
    // 'done', it was already there.
    expect(result.current.status).toBe('done');
  });

  it('arms again on a replay\'s finish, same as the first run', async () => {
    const { result } = renderHook(() => useIntro(), { wrapper: IntroProvider });
    await act(async () => {});

    act(() => {
      result.current.complete();
      result.current.dismissMapLesson();
    });
    expect(result.current.mapLessonPending).toBe(false);

    // Inställningar → Visa introduktionen igen, then walking the wizard again.
    act(() => {
      result.current.replay();
    });
    act(() => {
      result.current.complete();
    });

    expect(result.current.mapLessonPending).toBe(true);
  });

  it('is never pending with no provider — the fallback bonetider.tsx\'s own tests rely on', () => {
    const { result } = renderHook(() => useOptionalMapLesson());

    expect(result.current.pending).toBe(false);
    // Calling dismiss with nothing to dismiss must not throw — screens that mount without
    // a provider still wire onDismiss handlers unconditionally.
    expect(() => result.current.dismiss()).not.toThrow();
  });
});
