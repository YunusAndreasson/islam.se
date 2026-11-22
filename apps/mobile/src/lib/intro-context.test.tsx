// The context layer intro.test.ts doesn't reach: mapLessonPending, the flag that lets
// bonetider.tsx show the map lesson in place of the dock. onboarding.test.tsx pins the
// wizard's own steps and never mounts bonetider.tsx, so this is the seam between the two
// — complete() arming the flag, dismissMapLesson() clearing it, and the no-provider
// default a screen mounted alone (most of bonetider.tsx's own tests) falls back to.
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook } from '@testing-library/react-native';

import * as intro from './intro';
import { IntroProvider, useIntro, useOptionalMapLesson } from './intro-context';

describe('mapLessonPending', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('opens the map when the introduction read stalls and ignores a late first-run result', async () => {
    jest.useFakeTimers();
    let finishRead!: (value: Awaited<ReturnType<typeof intro.loadIntro>>) => void;
    const read = jest.spyOn(intro, 'loadIntro').mockImplementationOnce(() =>
      new Promise((resolve) => { finishRead = resolve; }),
    );
    try {
      const { result } = await renderHook(() => useIntro(), { wrapper: IntroProvider });
      expect(result.current.status).toBe('unknown');
      await act(() => { jest.advanceTimersByTime(2000); });
      expect(result.current.status).toBe('done');
      await act(async () => { finishRead({ status: 'pending', history: null }); });
      expect(result.current.status).toBe('done');
      expect(await AsyncStorage.getItem('introSeen:v1')).toBeNull();
    } finally {
      read.mockRestore();
      jest.useRealTimers();
    }
  });

  it('keeps an explicit replay and its outcome when startup storage answers late', async () => {
    let finishRead!: (value: Awaited<ReturnType<typeof intro.loadIntro>>) => void;
    const read = jest.spyOn(intro, 'loadIntro').mockImplementationOnce(() =>
      new Promise((resolve) => { finishRead = resolve; }),
    );
    try {
      const { result } = await renderHook(() => useIntro(), { wrapper: IntroProvider });
      await act(() => result.current.replay());
      await act(() => result.current.complete('skipped'));
      await act(async () => { finishRead({ status: 'pending', history: null }); });
      expect(result.current.status).toBe('done');
      expect(result.current.history).toBe('skipped');
      expect(result.current.mapLessonPending).toBe(true);
    } finally {
      read.mockRestore();
    }
  });

  it('starts false, and complete() arms it', async () => {
    const { result } = await renderHook(() => useIntro(), { wrapper: IntroProvider });
    await act(async () => {});

    expect(result.current.mapLessonPending).toBe(false);

    await act(() => {
      result.current.complete();
    });

    expect(result.current.mapLessonPending).toBe(true);
    // complete() still does its original job too — the two are not exclusive.
    expect(result.current.status).toBe('done');
  });

  it('clears on dismissMapLesson(), and only that', async () => {
    const { result } = await renderHook(() => useIntro(), { wrapper: IntroProvider });
    await act(async () => {});

    await act(() => {
      result.current.complete();
    });
    expect(result.current.mapLessonPending).toBe(true);

    await act(() => {
      result.current.dismissMapLesson();
    });

    expect(result.current.mapLessonPending).toBe(false);
    // Dismissing the lesson is not the same event as finishing the wizard — status stays
    // 'done', it was already there.
    expect(result.current.status).toBe('done');
  });

  it('arms again on a replay\'s finish, same as the first run', async () => {
    const { result } = await renderHook(() => useIntro(), { wrapper: IntroProvider });
    await act(async () => {});

    await act(() => {
      result.current.complete();
      result.current.dismissMapLesson();
    });
    expect(result.current.mapLessonPending).toBe(false);

    // Inställningar → Visa introduktionen igen, then walking the wizard again.
    await act(() => {
      result.current.replay();
    });
    await act(() => {
      result.current.complete();
    });

    expect(result.current.mapLessonPending).toBe(true);
  });

  it('marks a replay as such until it completes, and keeps the first pass\'s outcome through it', async () => {
    // intro_status says how the install BEGAN. A reader who finished the introduction and
    // later re-reads it, leaving through "Hoppa över", has not become someone who skipped it.
    const { result } = await renderHook(() => useIntro(), { wrapper: IntroProvider });
    await act(async () => {});
    expect(result.current.history).toBeNull();
    expect(result.current.replaying).toBe(false);

    await act(() => {
      result.current.complete('completed');
    });
    expect(result.current.history).toBe('completed');

    await act(() => {
      result.current.replay();
    });
    expect(result.current.replaying).toBe(true);
    await act(async () => {
      result.current.complete('skipped');
    });
    expect(result.current.replaying).toBe(false);
    expect(result.current.history).toBe('completed');
    expect(JSON.parse((await AsyncStorage.getItem('introSeen:v1')) as string)).toMatchObject({
      outcome: 'completed',
    });
  });

  it('gives an install that predates the introduction the outcome of its first pass', async () => {
    await AsyncStorage.setItem('prayerSettings:v1', JSON.stringify({ calculationMethod: 'Turkey' }));
    const { result } = await renderHook(() => useIntro(), { wrapper: IntroProvider });
    await act(async () => {});
    expect(result.current.history).toBe('not_shown');

    await act(() => {
      result.current.replay();
    });
    await act(() => {
      result.current.complete('skipped');
    });
    expect(result.current.history).toBe('skipped');
  });

  it('is never pending with no provider — the fallback bonetider.tsx\'s own tests rely on', async () => {
    const { result } = await renderHook(() => useOptionalMapLesson());

    expect(result.current.pending).toBe(false);
    // Calling dismiss with nothing to dismiss must not throw — screens that mount without
    // a provider still wire onDismiss handlers unconditionally.
    expect(() => result.current.dismiss()).not.toThrow();
  });
});
