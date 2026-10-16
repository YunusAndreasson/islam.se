// The colophon's build label. The mapping is the decision; the reader around it exists to keep
// a platform that has no such call — and a StoreKit lookup that fails — from breaking the
// settings screen it sits at the bottom of.
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Platform } from 'react-native';

import { storeEnvironmentLabel } from './index';

describe('storeEnvironmentLabel', () => {
  it('names a TestFlight, App Review or Xcode build, and leaves an App Store install unlabelled', () => {
    expect(storeEnvironmentLabel('sandbox')).toBe('Testversion');
    expect(storeEnvironmentLabel('xcode')).toBe('Testversion');
    // The build everyone has needs no word for it.
    expect(storeEnvironmentLabel('production')).toBeNull();
    // iOS could not vouch for the build (offline, signed out, simulator): say nothing
    // rather than guess.
    expect(storeEnvironmentLabel(null)).toBeNull();
  });
});

describe('readStoreEnvironmentLabel', () => {
  const globals = globalThis as unknown as { __DEV__: boolean };
  const wasDev = globals.__DEV__;
  const wasOS = Platform.OS;
  afterEach(() => {
    globals.__DEV__ = wasDev;
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => wasOS });
  });

  /** A fresh copy of the module, so its once-per-process cache starts empty. */
  async function load(os: 'ios' | 'android') {
    globals.__DEV__ = false;
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
    let about!: typeof import('./index');
    let Application!: typeof import('expo-application');
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      about = require('./index');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      Application = require('expo-application');
    });
    return { about, store: jest.mocked(Application.getAppleStoreEnvironmentAsync) };
  }

  // REGRESSION GUARD: Android's expo-application has no getAppleStoreEnvironmentAsync and
  // throws UnavailabilityError when it is called — on the screen every reader opens.
  it('never asks on Android', async () => {
    const { about, store } = await load('android');
    await expect(about.readStoreEnvironmentLabel()).resolves.toBeNull();
    expect(store).not.toHaveBeenCalled();
  });

  it('labels a TestFlight build on iOS', async () => {
    const { about, store } = await load('ios');
    store.mockResolvedValueOnce('sandbox');
    await expect(about.readStoreEnvironmentLabel()).resolves.toBe('Testversion');
  });

  it('settles on no label when StoreKit cannot answer', async () => {
    const { about, store } = await load('ios');
    store.mockRejectedValueOnce(new Error('AppTransaction unavailable'));
    await expect(about.readStoreEnvironmentLabel()).resolves.toBeNull();
  });
});
