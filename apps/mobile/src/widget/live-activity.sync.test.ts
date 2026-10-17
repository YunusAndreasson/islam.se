import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { type LatLng } from '@/lib/prayer-times';
import { DEFAULT_SETTINGS } from '@/lib/settings/types';
import { oracleTimes } from '@/test-utils/prayer-oracle';
import type { PrayerActivityProps } from '@/widgets/PrayerLiveActivity';
import {
  applyPrayerActivity,
  buildPrayerActivityProps,
  type LiveActivityApi,
  resetLiveActivityStateForTests,
} from './live-activity';
import { buildPayloadAt } from './payload';
import { first } from '@/test-utils/at';

const STOCKHOLM: LatLng = { latitude: 59.3293, longitude: 18.0686 };
const ref = oracleTimes(STOCKHOLM, new Date(2026, 2, 20));
/** 30 min before ʿAṣr — inside the live-activity window. */
const INSIDE = ref.asr.getTime() - 30 * 60 * 1000;
/** Hours before ʿAṣr — nothing close enough to count down to. */
const OUTSIDE = ref.asr.getTime() - 5 * 60 * 60 * 1000;
/** A minute after ʿAṣr; the next prayer is outside the countdown window. */
const PASSED = ref.asr.getTime() + 60 * 1000;

type Policy = 'immediate' | { after: Date };
interface FakeActivity {
  dismissAt: Date | null;
  end: jest.Mock<(policy: Policy, props?: PrayerActivityProps) => Promise<void>>;
}

/** Match our patched native API: ending with a future dismissal date keeps the banner
 * listed until dismissed. Removing it here would hide duplicate-banner regressions. */
function fakeApi() {
  const instances: FakeActivity[] = [];
  const start = jest.fn((_props: PrayerActivityProps, _url: string | undefined, _stale: Date) => {
    const activity: FakeActivity = {
      dismissAt: null,
      end: jest.fn(async (policy: Policy) => {
        if (policy !== 'immediate') {
          activity.dismissAt = policy.after;
          return;
        }
        const at = instances.indexOf(activity);
        if (at >= 0) instances.splice(at, 1);
      }),
    };
    instances.push(activity);
    return activity;
  });
  const api: LiveActivityApi = { start, getInstances: () => instances };
  return { api, instances, start };
}

/** The props one sync at `now` hands ActivityKit — composed the way syncPrayerLiveActivity
 *  composes them, which Jest cannot reach through its dynamic import. */
function propsAt(now: number): PrayerActivityProps | null {
  const payload = buildPayloadAt(STOCKHOLM, DEFAULT_SETTINGS, now, 'Stockholm');
  const following =
    payload.nextAtMs == null
      ? null
      : buildPayloadAt(STOCKHOLM, DEFAULT_SETTINGS, payload.nextAtMs + 1, 'Stockholm');
  return buildPrayerActivityProps(payload, now, following);
}

/** What one foreground at `now` does to the activity. */
const syncAt = (api: LiveActivityApi, now: number): Promise<void> =>
  applyPrayerActivity(api, propsAt(now));

/** What one background-task run at `now` does: it may clean up, never start. */
const backgroundSyncAt = (api: LiveActivityApi, now: number): Promise<void> =>
  applyPrayerActivity(api, propsAt(now), { canStart: false });

/** Half an hour before Maghrib on the fixture day — the next prayer after ʿAṣr, in window. */
const BEFORE_MAGHRIB = ref.maghrib.getTime() - 30 * 60 * 1000;

describe('applyPrayerActivity', () => {
  beforeEach(() => resetLiveActivityStateForTests());

  // Also clean up any legacy active banner encountered after its prayer.
  it('ends the activity once the prayer it counted down to has passed', async () => {
    const { api, instances } = fakeApi();
    await syncAt(api, INSIDE);
    const activity = first(instances, 'Live Activity instances');
    await syncAt(api, PASSED);
    expect(activity.end).toHaveBeenCalledWith('immediate');
    expect(instances).toHaveLength(0);
  });

  it('has nothing to show for a prayer that has already passed', async () => {
    // The decision core, independent of ActivityKit: after the prayer, the next slot is
    // hours away, so no activity should exist at all.
    expect(propsAt(PASSED)).toBeNull();
  });

  it('starts exactly one activity inside the window', async () => {
    const { api, instances, start } = fakeApi();
    await syncAt(api, INSIDE);
    expect(start).toHaveBeenCalledTimes(1);
    expect(instances).toHaveLength(1);
  });

  it('never starts a second activity when two syncs overlap', async () => {
    // THE RACE: this is read-then-write across an await — it asks ActivityKit what
    // exists, then starts. Fired concurrently, which is ordinary (the AppState 'active'
    // edge fires again after a permission dialog is dismissed, while a settings change
    // re-runs the effect), both runs saw an empty instance list and both called start(),
    // putting two identical countdown banners on the Lock Screen.
    const { api, instances, start } = fakeApi();
    await Promise.all([syncAt(api, INSIDE), syncAt(api, INSIDE), syncAt(api, INSIDE)]);
    expect(start).toHaveBeenCalledTimes(1);
    expect(instances).toHaveLength(1);
  });

  // Regression: the SDK 58 migration replaced dismissal with staleDate, leaving
  // finished banners on the Lock Screen until the app next ran. Schedule removal up
  // front so iOS can dismiss without another foreground or background-task execution.
  it('schedules Lock Screen removal at prayer time when starting', async () => {
    const { api, instances } = fakeApi();
    await syncAt(api, INSIDE);
    const activity = first(instances, 'Live Activity instances');
    const props = propsAt(INSIDE);
    if (!props) throw new Error('INSIDE must produce countdown content');
    expect(activity.end).toHaveBeenCalledWith({ after: new Date(ref.asr.getTime()) }, props);
    expect(activity.dismissAt).toEqual(new Date(ref.asr.getTime()));
    expect(instances).toHaveLength(1);
  });

  it('leaves a matching activity completely alone on a later foreground', async () => {
    const { api, instances, start } = fakeApi();
    await syncAt(api, INSIDE);
    const activity = first(instances, 'Live Activity instances');
    await syncAt(api, INSIDE + 60_000);
    await syncAt(api, INSIDE + 120_000);
    // Its timer and dismissal are already scheduled; avoid replacing it on every resume.
    expect(activity.end).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('replaces ended content and schedules the new prayer dismissal', async () => {
    const { api, instances, start } = fakeApi();
    await syncAt(api, INSIDE);
    const old = first(instances, 'Live Activity instances');
    await syncAt(api, BEFORE_MAGHRIB);
    expect(old.end).toHaveBeenLastCalledWith('immediate');
    expect(start).toHaveBeenCalledTimes(2);
    expect(first(instances, 'replacement').dismissAt).toEqual(new Date(ref.maghrib.getTime()));
    expect(instances).toHaveLength(1);
  });

  it('clears a previous session banner instead of stacking one on cold start', async () => {
    const { api, instances, start } = fakeApi();
    await syncAt(api, INSIDE);
    const old = first(instances, 'previous session');
    resetLiveActivityStateForTests();
    await syncAt(api, INSIDE);
    expect(old.end).toHaveBeenLastCalledWith('immediate');
    expect(start).toHaveBeenCalledTimes(2);
    expect(instances).toHaveLength(1);
    expect(first(instances, 'new session').dismissAt).toEqual(new Date(ref.asr.getTime()));
  });

  it('ends the activity once there is nothing to count down to', async () => {
    const { api, instances } = fakeApi();
    await syncAt(api, INSIDE);
    const activity = first(instances, 'Live Activity instances');
    await syncAt(api, OUTSIDE);
    expect(activity.end).toHaveBeenCalledWith('immediate');
    expect(instances).toHaveLength(0);
  });

  it('ends the extras it finds and keeps one', async () => {
    // Belt and braces for an activity that survived from a previous app session
    // alongside a fresh one — the Lock Screen must not show the same countdown twice.
    const { api, instances, start } = fakeApi();
    const props = propsAt(INSIDE);
    if (!props) throw new Error('INSIDE must be inside the live-activity window');
    start(props, undefined, new Date(props.nextAtMs));
    start(props, undefined, new Date(props.nextAtMs));
    expect(instances).toHaveLength(2);
    await syncAt(api, INSIDE);
    expect(instances).toHaveLength(1);
  });

  describe('from the background task', () => {
    // ActivityKit refuses a start from the background; asking anyway is wasted work at
    // best. The next foreground starts it.
    it('never starts an activity, even inside the window', async () => {
      const { api, instances, start } = fakeApi();
      await backgroundSyncAt(api, INSIDE);
      expect(start).not.toHaveBeenCalled();
      expect(instances).toHaveLength(0);
    });

    // The overnight case this run exists for: »Dags för ʿIshāʾ« would otherwise sit on the
    // Lock Screen until morning, or until iOS's own cap removes it.
    it('cleans up remaining banners once nothing is near', async () => {
      const { api, instances } = fakeApi();
      await syncAt(api, INSIDE);
      await backgroundSyncAt(api, PASSED);
      expect(instances).toHaveLength(0);
    });

    it('clears changed content without attempting a background replacement', async () => {
      const { api, instances, start } = fakeApi();
      await syncAt(api, INSIDE);
      const activity = first(instances, 'Live Activity instances');
      await backgroundSyncAt(api, BEFORE_MAGHRIB);
      expect(activity.end).toHaveBeenLastCalledWith('immediate');
      expect(start).toHaveBeenCalledTimes(1);
      expect(instances).toHaveLength(0);
      await syncAt(api, BEFORE_MAGHRIB);
      expect(start).toHaveBeenCalledTimes(2);
      expect(first(instances, 'foreground replacement').dismissAt).toEqual(
        new Date(ref.maghrib.getTime()),
      );
    });
  });
});
