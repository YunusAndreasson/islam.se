import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { router } from 'expo-router';

import { redirectSystemPath } from '@/app/+native-intent';

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
