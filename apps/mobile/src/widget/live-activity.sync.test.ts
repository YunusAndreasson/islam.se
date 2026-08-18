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
import { first } from '@/test-utils/at';

const STOCKHOLM: LatLng = { latitude: 59.3293, longitude: 18.0686 };
const ref = oracleTimes(STOCKHOLM, new Date(2026, 2, 20));
/** 30 min before ʿAṣr — inside the live-activity window. */
const INSIDE = ref.asr.getTime() - 30 * 60 * 1000;
/** Hours before ʿAṣr — nothing close enough to count down to. */
const OUTSIDE = ref.asr.getTime() - 5 * 60 * 60 * 1000;
/** A minute AFTER ʿAṣr — the prayer being counted down to has arrived and gone.
 *  Distinct from OUTSIDE, which is hours before it: this is the state the user actually
 *  complains about, where the system-rendered countdown has bottomed out at 0:00 and
 *  nothing on the device can clear it (see the note in ./live-activity.ts). Maghrib is
 *  ~181 min after ʿAṣr on this fixture date, far outside the 60-minute window, so there
 *  is nothing to re-point to and the only correct outcome is to end. */
const PASSED = ref.asr.getTime() + 60 * 1000;

type Policy = 'immediate' | { after: Date };

interface FakeActivity {
  end: jest.Mock<(policy: Policy, props?: unknown) => Promise<void>>;
  /** The removal date this activity was handed, if any. */
  dismissAt: Date | null;
}

/** A stand-in for expo-widgets' LiveActivityFactory, so the start/end/skip decision is
 *  observable without the native extension.
 *
 *  The one behaviour worth getting right: ending with `{ after: date }` does NOT remove
 *  the activity. It stays on the Lock Screen until iOS clears it at that date, and
 *  `Activity.activities` — which is what getInstances() wraps — keeps listing it. The
 *  reconcile logic depends on exactly that, so a fake that dropped it here would let a
 *  broken implementation pass. */
function fakeApi(): LiveActivityApi & { instances: FakeActivity[]; start: jest.Mock } {
  const instances: FakeActivity[] = [];
  const start = jest.fn(() => {
    const activity: FakeActivity = {
      dismissAt: null,
      end: jest.fn(async (policy: Policy) => {
        if (policy === 'immediate') {
          const at = instances.indexOf(activity);
          if (at >= 0) instances.splice(at, 1);
          return;
        }
        activity.dismissAt = policy.after;
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

  // The RECOVERY is correct; only its timing is the problem. A sync that happens after
  // the prayer has passed does end the banner — which is why one foreground clears a
  // stranded 0:00. Pinning it here so a fix for the timing cannot quietly break the
  // behaviour it is meant to make timely.
  it('ends the activity once the prayer it counted down to has passed', async () => {
    const api = fakeApi();
    await syncAt(api, INSIDE);
    const activity = first(api.instances, 'Live Activity instances');
    await syncAt(api, PASSED);
    expect(activity.end).toHaveBeenCalledWith('immediate');
    expect(api.instances).toHaveLength(0);
  });

  it('has nothing to show for a prayer that has already passed', async () => {
    // The decision core, independent of ActivityKit: after the prayer, the next slot is
    // hours away, so no activity should exist at all.
    const props = buildPrayerActivityProps(
      buildPayloadAt(STOCKHOLM, DEFAULT_SETTINGS, PASSED, 'Stockholm'),
      PASSED,
    );
    expect(props).toBeNull();
  });

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

  it('schedules its own removal for the prayer instant', async () => {
    // THE FIX. The countdown is system-rendered and nothing in this app runs between
    // foregrounds, so an activity the app does not hand a removal date to will sit at
    // 0:00 from the prayer until the user next opens the app — overnight, after ʿIshāʾ.
    // Ending it with `{ after: <prayer instant> }` leaves the banner up and counting, and
    // makes iOS the thing that clears it, on time, with the app closed.
    const api = fakeApi();
    await syncAt(api, INSIDE);
    const activity = first(api.instances, 'Live Activity instances');
    expect(activity.dismissAt).toEqual(new Date(ref.asr.getTime()));
    // Still on screen — `after` is a scheduled removal, not an immediate one.
    expect(api.instances).toHaveLength(1);
  });

  it('leaves a matching activity completely alone on a later foreground', async () => {
    const api = fakeApi();
    await syncAt(api, INSIDE);
    const activity = first(api.instances, 'Live Activity instances');
    activity.end.mockClear();
    await syncAt(api, INSIDE + 60_000);
    await syncAt(api, INSIDE + 120_000);
    // The countdown is system-rendered from bounds that don't move and already carries
    // its removal date, so touching it would burn ActivityKit budget (iOS reduces the
    // sync rate of an activity it sees churned) to change no pixels.
    expect(activity.end).not.toHaveBeenCalled();
    expect(api.start).toHaveBeenCalledTimes(1);
  });

  it('replaces the activity when the next prayer changes', async () => {
    // Not an update(): the activity is already ended (it holds a dismissal date), and
    // ActivityKit ignores updates to an ended activity while getInstances() still lists
    // it. Updating would leave ʿAṣr on the Lock Screen with Maghrib approaching.
    const api = fakeApi();
    await syncAt(api, INSIDE);
    const asrActivity = first(api.instances, 'Live Activity instances');
    await syncAt(api, ref.maghrib.getTime() - 30 * 60 * 1000);
    expect(asrActivity.end).toHaveBeenCalledWith('immediate');
    expect(api.start).toHaveBeenCalledTimes(2);
    expect(api.instances).toHaveLength(1);
    expect(first(api.instances, 'Live Activity instances').dismissAt).toEqual(
      new Date(ref.maghrib.getTime()),
    );
  });

  it('ends the activity once there is nothing to count down to', async () => {
    const api = fakeApi();
    await syncAt(api, INSIDE);
    const activity = first(api.instances, 'Live Activity instances');
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
