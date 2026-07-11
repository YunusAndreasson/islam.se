import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Linking, Platform } from 'react-native';

import { openDirections } from './directions';
import type { Mosque } from './index';

// A minimal mosque — only the coordinates matter for a directions link.
const MOSQUE = {
  id: 'test',
  name: 'Testmoské',
  lat: 59.25,
  lng: 17.86,
  city: '',
  citySlug: '',
  kommun: '',
  lan: '',
} as Mosque;

const DEST = '59.25,17.86';
const GOOGLE_UNIVERSAL = `https://www.google.com/maps/dir/?api=1&destination=${DEST}`;

function setPlatform(os: 'ios' | 'android') {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
}

/** Let the fire-and-forget openURL chain (and any fallback) settle. */
function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

const originalOS = Platform.OS;

// The jest-expo preset ships Linking.openURL as a persistent mock; without a per-test
// clear its call history accumulates across tests and breaks the nth-call assertions.
beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => originalOS });
  jest.restoreAllMocks();
});

describe('openDirections', () => {
  it('opens Apple Maps on iOS', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    setPlatform('ios');

    openDirections(MOSQUE);
    await flush();

    expect(openURL).toHaveBeenCalledWith(`https://maps.apple.com/?daddr=${DEST}&dirflg=d`);
  });

  it('opens Google Maps navigation on Android', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    setPlatform('android');

    openDirections(MOSQUE);
    await flush();

    expect(openURL).toHaveBeenCalledWith(`google.navigation:q=${DEST}`);
  });

  it('falls back to the universal Google Maps link when the native app is absent', async () => {
    // First attempt rejects (no maps app for the scheme); the helper must retry the
    // cross-platform https link rather than surfacing the error.
    const openURL = jest
      .spyOn(Linking, 'openURL')
      .mockRejectedValueOnce(new Error('no handler'))
      .mockResolvedValueOnce(undefined);
    setPlatform('android');

    openDirections(MOSQUE);
    await flush();

    expect(openURL).toHaveBeenNthCalledWith(1, `google.navigation:q=${DEST}`);
    expect(openURL).toHaveBeenNthCalledWith(2, GOOGLE_UNIVERSAL);
  });

  it('never throws even when every open fails', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error("nope"));
    setPlatform('ios');

    // The call itself is synchronous (fire-and-forget); the rejections are swallowed.
    expect(() => openDirections(MOSQUE)).not.toThrow();
    await expect(flush()).resolves.toBeUndefined();
  });
});
