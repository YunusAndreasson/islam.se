import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { router } from 'expo-router';

import { redirectSystemPath } from '@/app/+native-intent';
import { analytics } from '@/lib/analytics';

const url = 'islamse:///widget/prayer-times';
const dismissTo = jest.mocked(router.dismissTo);
beforeEach(() => { jest.clearAllMocks(); });

describe('prayer widget links', () => {
  // Plain deep links used to push a second map over an open Qibla/settings sheet.
  // Warm widget taps must unwind that stack, while cold taps retain onboarding.
  it('dismisses to the existing prayer screen and consumes warm widget links', () => {
    expect(redirectSystemPath({ path: url, initial: false })).toBeNull();
    expect(dismissTo).toHaveBeenCalledWith('/bonetider');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('sends cold widget launches through the existing introduction gate', () => {
    expect(redirectSystemPath({ path: url, initial: true })).toBe('/');
    expect(dismissTo).not.toHaveBeenCalled();
  });

  it.each(['/qibla', 'islamse:///manen', 'https://example.com/widget/prayer-times',
    'islamse://example.com/widget/prayer-times', 'not a URL'])('leaves unrelated paths alone: %s', path => {
    expect(redirectSystemPath({ path, initial: false })).toBe(path);
    expect(dismissTo).not.toHaveBeenCalled();
  });

  it('falls back to Router handling if navigation is not ready', () => {
    dismissTo.mockImplementationOnce(() => { throw new Error('navigator not ready'); });
    expect(redirectSystemPath({ path: `${url}?source=widget`, initial: false })).toBe('/bonetider');
  });
});

describe('Widget Opened', () => {
  it('opens the countdown through onboarding on cold start and unwinds an open sheet on warm tap', () => {
    // A countdown previously resumed whichever sheet was last open. Its tap is distinct
    // from a home-screen widget tap even though both lead to the same timetable.
    const track = jest.spyOn(analytics, 'track').mockResolvedValue(undefined);
    try {
      const countdown = 'islamse:///countdown/prayer-times';
      expect(redirectSystemPath({ path: countdown, initial: true })).toBe('/');
      expect(dismissTo).not.toHaveBeenCalled();
      expect(redirectSystemPath({ path: countdown, initial: false })).toBeNull();
      expect(dismissTo).toHaveBeenCalledWith('/bonetider?calendar=closed');
      expect(track).not.toHaveBeenCalled();
    } finally {
      track.mockRestore();
    }
  });

  it('reports a widget tap, cold or warm, and nothing for any other link', () => {
    const track = jest.spyOn(analytics, 'track').mockResolvedValue(undefined);
    redirectSystemPath({ path: url, initial: true });
    redirectSystemPath({ path: url, initial: false });
    redirectSystemPath({ path: 'islamse:///manen', initial: false });
    expect(track.mock.calls).toEqual([
      ['Widget Opened', { cold: true }],
      ['Widget Opened', { cold: false }],
    ]);
    track.mockRestore();
  });
});
