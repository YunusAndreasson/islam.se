// The guard is an ORACLE test made permanent: MapLibre is the authority on where a
// coordinate lands, and lib/map/projection.ts is our copy of that answer. So the fake probe
// below is `project()` under the TRUE camera, and each case hands the guard a camera that is
// wrong in one specific, historically-real way. If the guard can tell those apart from the
// numbers it prints, it can name the next one too.
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';

import type { LonLat } from '../coordinates';
import { type Camera, project, unproject } from './projection';
import {
  CLEAN_PASSES_BEFORE_TRUST,
  DRIFT_TOLERANCE_DP,
  GUARD_POINTS,
  projectionDrift,
  reportProjectionDrift,
  resetProjectionGuard,
} from './projection-guard';

/** The camera MapLibre is actually rendering with: Sweden on a tall phone. */
const TRUE_CAM: Camera = { lon: 17.4, lat: 62.1, zoom: 4.5, width: 390, height: 800 };

/** MapLibre's own projection, stood in for by ours under the camera it really has. */
function probeFor(cam: Camera) {
  return {
    project: jest.fn(async (p: LonLat) => {
      const { x, y } = project(p[0], p[1], cam);
      return [x, y] as [number, number];
    }),
  };
}

beforeEach(() => {
  resetProjectionGuard();
});

describe('projectionDrift', () => {
  it('reports no drift when the mirrored camera matches MapLibre', async () => {
    const drifts = await projectionDrift(probeFor(TRUE_CAM), TRUE_CAM);
    expect(drifts).toHaveLength(GUARD_POINTS.length);
    for (const d of drifts) expect(d.distance).toBeLessThan(1e-9);
  });

  it('orders the reference points worst-first', async () => {
    // A zoom that is wrong scales the map about the viewport centre, so the drift grows
    // with distance from it — which is exactly what makes a scale error diagnosable.
    const drifts = await projectionDrift(probeFor(TRUE_CAM), { ...TRUE_CAM, zoom: 4.6 });
    expect(drifts[0]!.distance).toBeGreaterThan(drifts[drifts.length - 1]!.distance);
  });

  // THE BUG THIS DESCRIBES: the camera centre was read from MapLibre's reported `center`,
  // which is the camera TARGET and sits half the dock padding north of the viewport centre.
  // Every city drew ~50 svenska mil south of where the basemap had it.
  //
  // Its fingerprint is what the guard exists to show: the SAME dy at every latitude and no
  // dx at all, because a wrong centre latitude shifts only the constant term of project()'s
  // y — it is not a scale error and not a per-point error.
  it('shows a wrong centre latitude as one uniform vertical offset', async () => {
    const PAD_HALF = 135;
    const paddedCentre = unproject(TRUE_CAM.width / 2, TRUE_CAM.height / 2 - PAD_HALF, TRUE_CAM);
    const drifts = await projectionDrift(probeFor(TRUE_CAM), { ...TRUE_CAM, lat: paddedCentre.lat });

    for (const d of drifts) {
      expect(d.dx).toBeCloseTo(0, 6);
      expect(d.dy).toBeCloseTo(PAD_HALF, 6);
    }
  });

  // THE BUG THIS DESCRIBES: the viewport size came from useWindowDimensions, which on iOS
  // can exceed the Stack screen's content area. Fingerprint: a constant offset in BOTH axes
  // (half the size difference), which is what separates it from the centre bug above.
  it('shows a wrong viewport size as a constant offset in both axes', async () => {
    const rendered: Camera = { ...TRUE_CAM, width: 360, height: 760 };
    const drifts = await projectionDrift(probeFor(rendered), TRUE_CAM);

    for (const d of drifts) {
      expect(d.dx).toBeCloseTo((TRUE_CAM.width - rendered.width) / 2, 6);
      expect(d.dy).toBeCloseTo((TRUE_CAM.height - rendered.height) / 2, 6);
    }
  });
});

describe('reportProjectionDrift', () => {
  let warn: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
  });

  it('stays silent while the two projections agree', async () => {
    const worst = await reportProjectionDrift(probeFor(TRUE_CAM), TRUE_CAM);
    expect(worst?.distance).toBeLessThan(DRIFT_TOLERANCE_DP);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns once — and only once — when the overlay has come off the map', async () => {
    const wrong: Camera = { ...TRUE_CAM, lat: 63.4 };
    const first = await reportProjectionDrift(probeFor(TRUE_CAM), wrong);
    expect(first!.distance).toBeGreaterThan(DRIFT_TOLERANCE_DP);
    expect(warn).toHaveBeenCalledTimes(1);
    // The message has to carry enough to name the bug without a rebuild: the camera, and
    // every point's own delta.
    const message = String(warn.mock.calls[0]![0]);
    expect(message).toContain('MapLibre');
    expect(message).toContain('zoom=4.500');
    for (const point of GUARD_POINTS) expect(message).toContain(String(point[0]));

    // A settled pan happens dozens of times a minute; the same warning on each is how a
    // real warning becomes noise.
    await reportProjectionDrift(probeFor(TRUE_CAM), wrong);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('does not run before the viewport has been measured', async () => {
    const seed: Camera = { ...TRUE_CAM, width: 0, height: 0 };
    expect(await reportProjectionDrift(probeFor(TRUE_CAM), seed)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not run without a probe, or against one that is not a MapLibre ref', async () => {
    expect(await reportProjectionDrift(null, TRUE_CAM)).toBeNull();
    // What the screen tests hand it: the string-mocked Map's host element.
    expect(await reportProjectionDrift({} as never, TRUE_CAM)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('survives a native module that rejects (teardown, no style yet)', async () => {
    const probe = {
      project: jest.fn(async () => {
        throw new Error('no map view');
      }),
    };
    expect(await reportProjectionDrift(probe as never, TRUE_CAM)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('reports nothing when given no reference points', async () => {
    expect(await reportProjectionDrift(probeFor(TRUE_CAM), TRUE_CAM, [])).toBeNull();
  });

  it('is a no-op outside development — it must never cost a shipped build a round-trip', async () => {
    const probe = probeFor(TRUE_CAM);
    const dev = __DEV__;
    // @ts-expect-error -- __DEV__ is a build-time constant; flipping it is the only way to
    // prove the production path from a test.
    global.__DEV__ = false;
    try {
      expect(await reportProjectionDrift(probe, { ...TRUE_CAM, lat: 63.4 })).toBeNull();
      expect(probe.project).not.toHaveBeenCalled();
    } finally {
      // @ts-expect-error -- see above
      global.__DEV__ = dev;
    }
    expect(warn).not.toHaveBeenCalled();
  });
});

// THE FALSE ALARMS THESE FORBID — both observed on a real device (Android emulator, API 35)
// before they were fixed:
//
//   1. Two quick swipes produced "our projection and MapLibre's differ by 253.3 dp". Nothing
//      was wrong: asking MapLibre costs a round-trip, the second swipe started during it, and
//      MapLibre answered for where the map had moved to while `cam` still described where it
//      was. The difference was the gesture.
//   2. Two warnings arrived from one gesture run, despite the once-per-session latch — the
//      latch is only set after the round-trip, so two settles inside one round-trip both got
//      through.
//
// A guard that cries wolf is worse than no guard: it is exactly how a real warning gets
// skimmed past later (this codebase already learned that from a permanent ParseStyle warning).
describe('reportProjectionDrift stays quiet when it cannot trust the reading', () => {
  let warn: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
  });

  it('voids a reading whose camera moved on during the round-trip', async () => {
    // A camera far from the truth — but the caller reports that it is no longer current, so
    // the disagreement is the pan, not a bug.
    const worst = await reportProjectionDrift(
      probeFor(TRUE_CAM),
      { ...TRUE_CAM, lat: 63.4 },
      GUARD_POINTS,
      () => false,
    );
    expect(worst).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('still reports when the camera held still across the round-trip', async () => {
    const worst = await reportProjectionDrift(
      probeFor(TRUE_CAM),
      { ...TRUE_CAM, lat: 63.4 },
      GUARD_POINTS,
      () => true,
    );
    expect(worst!.distance).toBeGreaterThan(DRIFT_TOLERANCE_DP);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('warns once even when two settles arrive inside one round-trip', async () => {
    const wrong: Camera = { ...TRUE_CAM, lat: 63.4 };
    // Both started before either finished — the case the latch alone could not hold.
    const [a, b] = await Promise.all([
      reportProjectionDrift(probeFor(TRUE_CAM), wrong),
      reportProjectionDrift(probeFor(TRUE_CAM), wrong),
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
    // The second call is refused outright rather than reporting a second time.
    expect([a, b].filter(Boolean)).toHaveLength(1);
  });

  // THE COST THIS AVOIDS: the guard only latched on a BREACH, so in the healthy case — the
  // normal one — every settled pan, fling and pinch paid three native round-trips for the
  // whole session, on the same JS thread this change set is otherwise busy protecting. The
  // bugs it looks for are systematic, so a few agreeing samples retire it.
  it('retires itself once a few different cameras have agreed', async () => {
    const probe = probeFor(TRUE_CAM);
    for (let i = 0; i < CLEAN_PASSES_BEFORE_TRUST; i += 1) {
      expect(await reportProjectionDrift(probe, TRUE_CAM)).not.toBeNull();
    }
    const calls = probe.project.mock.calls.length;

    // Every settle after that costs nothing at all.
    expect(await reportProjectionDrift(probe, TRUE_CAM)).toBeNull();
    expect(probe.project.mock.calls.length).toBe(calls);
    expect(warn).not.toHaveBeenCalled();
  });

  // …but not before it has had the chance to catch one. A breach inside the sampling window
  // still speaks.
  it('still reports a breach that arrives before it has retired', async () => {
    await reportProjectionDrift(probeFor(TRUE_CAM), TRUE_CAM);
    const worst = await reportProjectionDrift(probeFor(TRUE_CAM), { ...TRUE_CAM, lat: 63.4 });
    expect(worst!.distance).toBeGreaterThan(DRIFT_TOLERANCE_DP);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('releases the in-flight lock when the probe rejects', async () => {
    const angry = {
      project: jest.fn(async () => {
        throw new Error('no map view');
      }),
    };
    expect(await reportProjectionDrift(angry as never, TRUE_CAM)).toBeNull();
    // A lock left set by a rejection would silence the guard for the rest of the session.
    const worst = await reportProjectionDrift(probeFor(TRUE_CAM), { ...TRUE_CAM, lat: 63.4 });
    expect(worst!.distance).toBeGreaterThan(DRIFT_TOLERANCE_DP);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
