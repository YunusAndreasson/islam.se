import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { type LatLng } from '@/lib/prayer-times';
import { DEFAULT_SETTINGS } from '@/lib/settings/types';
import { oracleTimes } from '@/test-utils/prayer-oracle';
import {
  applyPrayerActivity,
  buildPrayerActivityProps,
  type LiveActivityApi,
  resetLiveActivityStateForTests,
} from './live-activity';
import { buildPayloadAt } from './payload';

const STOCKHOLM: LatLng = { latitude: 59.3293, longitude: 18.0686 };
const ref = oracleTimes(STOCKHOLM, new Date(2026, 2, 20));
/** 30 min before ʿAṣr — inside the live-activity window. */
const INSIDE = ref.asr.getTime() - 30 * 60 * 1000;
/** Hours before ʿAṣr — nothing close enough to count down to. */
const OUTSIDE = ref.asr.getTime() - 5 * 60 * 60 * 1000;

interface FakeActivity {
  update: jest.Mock<(...args: never[]) => Promise<void>>;
  end: jest.Mock<(...args: never[]) => Promise<void>>;
}

/** A stand-in for expo-widgets' LiveActivityFactory, so the start/update/end/skip
 *  decision is observable without the native extension. */
function fakeApi(): LiveActivityApi & { instances: FakeActivity[]; start: jest.Mock } {
  const instances: FakeActivity[] = [];
  const start = jest.fn(() => {
    const activity: FakeActivity = {
      update: jest.fn(async () => {}),
      end: jest.fn(async () => {
        const at = instances.indexOf(activity);
        if (at >= 0) instances.splice(at, 1);
      }),
    };
    instances.push(activity);
    return activity;
  });
  return { instances, start, getInstances: () => instances };
}

/** What one foreground at `now` does to the activity. */
const syncAt = (api: LiveActivityApi, now: number): Promise<void> =>
  applyPrayerActivity(
    api,
    buildPrayerActivityProps(buildPayloadAt(STOCKHOLM, DEFAULT_SETTINGS, now, 'Stockholm'), now),
  );

describe('applyPrayerActivity', () => {
  beforeEach(() => resetLiveActivityStateForTests());

  it('starts exactly one activity inside the window', async () => {
    const api = fakeApi();
    await syncAt(api, INSIDE);
    expect(api.start).toHaveBeenCalledTimes(1);
    expect(api.instances).toHaveLength(1);
  });

  it('never starts a second activity when two syncs overlap', async () => {
    // THE RACE: this is read-then-write across an await — it asks ActivityKit what
    // exists, then starts. Fired concurrently, which is ordinary (the AppState 'active'
    // edge fires again after a permission dialog is dismissed, while a settings change
    // re-runs the effect), both runs saw an empty instance list and both called start(),
    // putting two identical countdown banners on the Lock Screen.
    const api = fakeApi();
    await Promise.all([syncAt(api, INSIDE), syncAt(api, INSIDE), syncAt(api, INSIDE)]);
    expect(api.start).toHaveBeenCalledTimes(1);
    expect(api.instances).toHaveLength(1);
  });

  it('does not spend an ActivityKit update when nothing changed', async () => {
    const api = fakeApi();
    await syncAt(api, INSIDE);
    const activity = api.instances[0];
    await syncAt(api, INSIDE + 60_000);
    await syncAt(api, INSIDE + 120_000);
    // The countdown is system-rendered from bounds that don't move, so re-pushing it
    // would burn update budget (iOS reduces an over-updated activity's sync rate) to
    // change no pixels.
    expect(activity.update).not.toHaveBeenCalled();
  });

  it('re-points the activity when the next prayer changes', async () => {
    const api = fakeApi();
    await syncAt(api, INSIDE);
    const activity = api.instances[0];
    await syncAt(api, ref.maghrib.getTime() - 30 * 60 * 1000);
    expect(activity.update).toHaveBeenCalledTimes(1);
    expect(api.start).toHaveBeenCalledTimes(1);
  });

  it('ends the activity once there is nothing to count down to', async () => {
    const api = fakeApi();
    await syncAt(api, INSIDE);
    const activity = api.instances[0];
    await syncAt(api, OUTSIDE);
    expect(activity.end).toHaveBeenCalledWith('immediate');
    expect(api.instances).toHaveLength(0);
  });

  it('ends duplicates it finds, keeping one', async () => {
    // Belt and braces for an activity that survived from a previous app session
    // alongside a fresh one — the Lock Screen must not show the same countdown twice.
    const api = fakeApi();
    api.start(buildPrayerActivityProps(buildPayloadAt(STOCKHOLM, DEFAULT_SETTINGS, INSIDE, 'Stockholm'), INSIDE)!);
    api.start(buildPrayerActivityProps(buildPayloadAt(STOCKHOLM, DEFAULT_SETTINGS, INSIDE, 'Stockholm'), INSIDE)!);
    expect(api.instances).toHaveLength(2);
    await syncAt(api, INSIDE);
    expect(api.instances).toHaveLength(1);
  });
});
