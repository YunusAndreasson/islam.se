import { describe, expect, it } from '@jest/globals';

import { createLaunchTracker, LAUNCH_MOMENT_MS, WARM_AFTER_MS } from './lifecycle';

const T0 = 1_000_000;

describe('what counts as an open', () => {
  it('is cold on the first active state, once per JS start', () => {
    const launch = createLaunchTracker();
    expect(launch.observe('active', T0)).toBe('cold');
    expect(launch.observe('active', T0 + 1)).toBeNull();
  });

  it('is nothing while an iOS background launch runs, and cold when the reader opens it', () => {
    // Regression the tracker exists for: BGTaskScheduler launches the app for the
    // notification refresh, React mounts, and an open counted at mount made every
    // background wake-up an "active user". The real open, hours later, is the cold one.
    const launch = createLaunchTracker();
    expect(launch.observe('background', T0)).toBeNull();
    expect(launch.observe('unknown', T0)).toBeNull();
    expect(launch.observe(undefined, T0)).toBeNull();
    expect(launch.observe('active', T0 + 6 * 3_600_000)).toBe('cold');
  });

  it('is warm on a return after 30 s or more in the background, and nothing for a shorter trip', () => {
    const launch = createLaunchTracker();
    launch.observe('active', T0);
    launch.observe('background', T0 + 1000);
    expect(launch.observe('active', T0 + 1000 + WARM_AFTER_MS - 1)).toBeNull();
    launch.observe('background', T0 + 60_000);
    expect(launch.observe('active', T0 + 60_000 + WARM_AFTER_MS)).toBe('warm');
    // One return is one open: the next 'active' without leaving is not another.
    expect(launch.observe('active', T0 + 200_000)).toBeNull();
  });

  it("does not treat iOS's 'inactive' as leaving: Control Centre over the app is the same visit", () => {
    const launch = createLaunchTracker();
    launch.observe('active', T0);
    launch.observe('inactive', T0 + 1000);
    expect(launch.observe('active', T0 + 1000 + 10 * WARM_AFTER_MS)).toBeNull();
  });
});

describe('isLaunchMoment — was a notification tap the one that started the app?', () => {
  it('is true before the first open and for the first moments after it', () => {
    const launch = createLaunchTracker();
    expect(launch.isLaunchMoment(T0)).toBe(true);
    launch.observe('active', T0);
    expect(launch.isLaunchMoment(T0 + LAUNCH_MOMENT_MS - 1)).toBe(true);
    expect(launch.isLaunchMoment(T0 + LAUNCH_MOMENT_MS)).toBe(false);
  });

  it('is false once the app has been in the background since the cold open', () => {
    const launch = createLaunchTracker();
    launch.observe('active', T0);
    launch.observe('background', T0 + 1000);
    launch.observe('active', T0 + 2000);
    expect(launch.isLaunchMoment(T0 + 3000)).toBe(false);
  });
});

describe('resetForTests', () => {
  it('returns the tracker to a JS start that has not been opened', () => {
    const launch = createLaunchTracker();
    launch.observe('active', T0);
    launch.observe('background', T0 + 1);
    launch.resetForTests();
    expect(launch.isLaunchMoment(T0 + 60_000)).toBe(true);
    expect(launch.observe('active', T0 + 60_000)).toBe('cold');
  });
});
