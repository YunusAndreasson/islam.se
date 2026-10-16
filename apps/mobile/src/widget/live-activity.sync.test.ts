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
/** A minute AFTER ʿAṣr — the prayer being counted down to has arrived and gone.
 *  Distinct from OUTSIDE, which is hours before it: this is the state the user actually
 *  sees once the countdown has run out: the activity has gone stale and reads »Dags för
 *  ʿAṣr«. Maghrib is ~181 min after ʿAṣr on this fixture date, far outside the 60-minute
 *  window, so there is nothing to roll over to and the only correct outcome is to end. */
const PASSED = ref.asr.getTime() + 60 * 1000;

interface FakeActivity {
  props: PrayerActivityProps;
  /** When ActivityKit will mark this content stale — the prayer it counts down to. */
  staleDate: Date | null;
  update: jest.Mock<(props: PrayerActivityProps, staleDate?: Date) => Promise<void>>;
  end: jest.Mock<(policy: 'immediate') => Promise<void>>;
}

/** A stand-in for expo-widgets' LiveActivityFactory as of SDK 58, so the start/update/end/
 *  skip decision is observable without the native extension.
 *
 *  The behaviour worth getting right: getInstances() lists ACTIVE and STALE activities and
 *  never an ended one. A stale activity — its prayer has passed — therefore stays listed
 *  until something ends it, which this fake models by doing nothing at the staleDate. */
function fakeApi() {
  const instances: FakeActivity[] = [];
  const start = jest.fn((props: PrayerActivityProps, _url: string | undefined, staleDate: Date) => {
    const activity: FakeActivity = {
      props,
      staleDate,
      update: jest.fn(async (next: PrayerActivityProps, nextStale?: Date) => {
        activity.props = next;
        activity.staleDate = nextStale ?? null;
      }),
      end: jest.fn(async () => {
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

/** What one background-task run at `now` does: it may update or end, never start. */
const backgroundSyncAt = (api: LiveActivityApi, now: number): Promise<void> =>
  applyPrayerActivity(api, propsAt(now), { canStart: false });

/** Half an hour before Maghrib on the fixture day — the next prayer after ʿAṣr, in window. */
const BEFORE_MAGHRIB = ref.maghrib.getTime() - 30 * 60 * 1000;

describe('applyPrayerActivity', () => {
  beforeEach(() => resetLiveActivityStateForTests());

  // A sync after the prayer has passed takes the banner down: the stale »Dags för ʿAṣr«
  // has said its piece, and Maghrib is hours away.
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

  // THE MECHANISM, and a regression guard. The countdown is system-rendered and nothing of
  // ours runs at the prayer, so the content must be handed its stale date up front: that is
  // what lets the layout swap 0:00 for »Dags för ʿAṣr« with the app closed. The design this
  // replaced ended every activity at start with `{ after: prayer }` — which cost the Dynamic
  // Island and only worked with a patched getInstances() that still listed ended activities.
  // SDK 58 lists none, so if this ever goes back to ending at start, that patch is needed
  // again and duplicates stack on every foreground without it.
  it('starts with a stale date at the prayer instant and never schedules its own removal', async () => {
    const { api, instances, start } = fakeApi();
    await syncAt(api, INSIDE);
    expect(start).toHaveBeenCalledWith(expect.anything(), undefined, new Date(ref.asr.getTime()));
    const activity = first(instances, 'Live Activity instances');
    expect(activity.end).not.toHaveBeenCalled();
  });

  it('leaves a matching activity completely alone on a later foreground', async () => {
    const { api, instances, start } = fakeApi();
    await syncAt(api, INSIDE);
    const activity = first(instances, 'Live Activity instances');
    await syncAt(api, INSIDE + 60_000);
    await syncAt(api, INSIDE + 120_000);
    // The countdown is system-rendered from bounds that don't move and already carries its
    // stale date, so touching it would burn ActivityKit budget (iOS reduces the sync rate of
    // an activity it sees churned) to change no pixels.
    expect(activity.update).not.toHaveBeenCalled();
    expect(activity.end).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalledTimes(1);
  });

  // Not a replacement any more. While every activity was ended at start, an update() was
  // silently ignored and the only way forward was end + start — which also bounced the
  // banner off the Dynamic Island. An active activity takes the update.
  it('rolls the same activity over to the next prayer in place', async () => {
    const { api, instances, start } = fakeApi();
    await syncAt(api, INSIDE);
    const activity = first(instances, 'Live Activity instances');
    await syncAt(api, BEFORE_MAGHRIB);
    expect(start).toHaveBeenCalledTimes(1);
    expect(activity.end).not.toHaveBeenCalled();
    expect(activity.props.nextKey).toBe('maghrib');
    expect(activity.staleDate).toEqual(new Date(ref.maghrib.getTime()));
    expect(instances).toHaveLength(1);
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
    it('ends a stale activity once nothing is near', async () => {
      const { api, instances } = fakeApi();
      await syncAt(api, INSIDE);
      await backgroundSyncAt(api, PASSED);
      expect(instances).toHaveLength(0);
    });

    it('rolls an existing activity over in place', async () => {
      const { api, instances, start } = fakeApi();
      await syncAt(api, INSIDE);
      const activity = first(instances, 'Live Activity instances');
      await backgroundSyncAt(api, BEFORE_MAGHRIB);
      expect(start).toHaveBeenCalledTimes(1);
      expect(activity.props.nextKey).toBe('maghrib');
    });
  });
});
