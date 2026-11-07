// Property-based tests for the aiming maths. aim.test.ts pins a handful of fixed
// angles; these fuzz the whole input space so a modular-arithmetic regression (the
// +540/−180 wrap, a stray sign) can't survive between the chosen examples.
import { describe, expect, it } from '@jest/globals';
import * as fc from 'fast-check';

import {
  AIM_PROX_RANGE,
  AIM_TURN_AROUND,
  aimProximity,
  aimTurn,
  angleDelta,
  CALIBRATION_COLD,
  CALIBRATION_HOLD_MS,
  deriveAimStatus,
  HEADING_ACCURACY_MIN,
  headingReliable,
  holdCalibration,
  normalizeHeading,
  shortestTurn,
} from './aim';
import { at } from '@/test-utils/at';

// Compass bearings live in [0, 360). noNaN keeps the generator on real angles.
const bearing = fc.double({ min: 0, max: 360, noNaN: true, maxExcluded: true });

describe('angleDelta — modular wrap invariants', () => {
  it('is symmetric: angleDelta(a,b) === angleDelta(b,a)', () => {
    fc.assert(
      fc.property(bearing, bearing, (a, b) => {
        expect(angleDelta(a, b)).toBeCloseTo(angleDelta(b, a), 9);
      }),
    );
  });

  it('always lands in [0, 180]', () => {
    fc.assert(
      fc.property(bearing, bearing, (a, b) => {
        const d = angleDelta(a, b);
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(180 + 1e-9);
      }),
    );
  });

  it('is zero for identical bearings', () => {
    fc.assert(
      fc.property(bearing, (a) => {
        expect(angleDelta(a, a)).toBe(0);
      }),
    );
  });

  it('matches the independent minimal circular-distance formula', () => {
    // An oracle written a completely different way: the shortest arc between two bearings
    // is min(|a−b|, 360−|a−b|). angleDelta's +540/−180 wrap must agree with it for every
    // pair in the real [0,360) domain — this is what actually pins the modular arithmetic
    // (the symmetry/range/identity checks alone would pass several wrong formulas).
    fc.assert(
      fc.property(bearing, bearing, (a, b) => {
        const raw = Math.abs(a - b);
        const expected = Math.min(raw, 360 - raw);
        expect(angleDelta(a, b)).toBeCloseTo(expected, 9);
      }),
    );
  });
});

describe('normalizeHeading — into [0, 360)', () => {
  it('wraps negatives and ≥360 into range (concrete)', () => {
    expect(normalizeHeading(0)).toBe(0);
    expect(normalizeHeading(370)).toBeCloseTo(10, 9);
    expect(normalizeHeading(-10)).toBeCloseTo(350, 9);
    expect(normalizeHeading(720)).toBe(0);
  });

  it('always returns a value in [0, 360) for any real input', () => {
    fc.assert(
      fc.property(fc.double({ min: -10000, max: 10000, noNaN: true }), (x) => {
        const n = normalizeHeading(x);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThan(360);
      }),
    );
  });
});

describe('shortestTurn — the dial-unwrap step', () => {
  // These two properties together UNIQUELY define the shortest signed turn — the only value in
  // (−180,180] congruent to (to−from) mod 360. A wrong wrap constant (the +540, the −180) or a
  // sign flip breaks one of them, and that exact bug is what would make the needle whip the
  // LONG way around the 0/360 seam — a regression no geometry test in qibla.test.ts would catch
  // (they only check the magnitude, never the sign or the winding).
  it('lands exactly on the target heading (≡ to, mod 360)', () => {
    fc.assert(
      fc.property(bearing, bearing, (from, to) => {
        // Wrap-aware: the landed heading must sit at zero circular distance from `to` (a plain
        // numeric compare would spuriously fail at the seam, where 359.999 ≡ 0.001).
        expect(angleDelta(from + shortestTurn(from, to), to)).toBeCloseTo(0, 6);
      }),
    );
  });

  it('never turns more than 180° — always the short way', () => {
    fc.assert(
      fc.property(bearing, bearing, (from, to) => {
        expect(Math.abs(shortestTurn(from, to))).toBeLessThanOrEqual(180 + 1e-9);
      }),
    );
  });

  it('its magnitude equals the independent min-arc oracle (and angleDelta)', () => {
    fc.assert(
      fc.property(bearing, bearing, (a, b) => {
        const raw = Math.abs(a - b);
        const minArc = Math.min(raw, 360 - raw);
        expect(Math.abs(shortestTurn(a, b))).toBeCloseTo(minArc, 9);
        expect(Math.abs(shortestTurn(a, b))).toBeCloseTo(angleDelta(a, b), 9);
      }),
    );
  });

  it('eases the SHORT way across the 0/360 seam (concrete signs)', () => {
    expect(shortestTurn(359, 1)).toBeCloseTo(2, 9); // +2°, not −358°
    expect(shortestTurn(1, 359)).toBeCloseTo(-2, 9); // −2°, not +358°
    expect(shortestTurn(10, 350)).toBeCloseTo(-20, 9);
    expect(shortestTurn(350, 10)).toBeCloseTo(20, 9);
  });

  it('accumulates into a continuous winding (the unwrap the rose feeds its rotation)', () => {
    // Stepping a quarter-turn at a time all the way around must total a full +360 (and −360 the
    // other way): the running sum the screen feeds the dial rotation never snaps back at the
    // seam. A single long-way step anywhere would blow this far past ±360.
    const round = (path: number[]) =>
      path.slice(1).reduce((sum, h, i) => sum + shortestTurn(at(path, i, 'heading path'), h), 0);
    expect(round([0, 90, 180, 270, 0])).toBeCloseTo(360, 9);
    expect(round([0, 270, 180, 90, 0])).toBeCloseTo(-360, 9);
  });
});

describe('aimProximity — the "getting warmer" ramp', () => {
  const accuracy = fc.option(fc.integer({ min: 0, max: 3 }), { nil: null });

  it('always lands in [0, 1]', () => {
    fc.assert(
      fc.property(bearing, bearing, accuracy, (h, b, a) => {
        const p = aimProximity(h, a, b);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }),
    );
  });

  it('is pinned to 0 for any untrusted reading — even one pointing dead-on', () => {
    // The safety property: a not-yet-calibrated compass must never warm the dial toward a
    // bearing it can't vouch for, no matter how aligned it happens to look during warm-up.
    fc.assert(
      fc.property(bearing, bearing, (h, b) => {
        expect(aimProximity(h, 0, b)).toBe(0);
        expect(aimProximity(h, 1, b)).toBe(0);
        expect(aimProximity(h, null, b)).toBe(0);
      }),
    );
    expect(aimProximity(100, 1, 100)).toBe(0); // dead-on but uncalibrated → still cold
  });

  it('peaks at the bearing and is cold past the range, when trusted', () => {
    expect(aimProximity(100, 3, 100)).toBeCloseTo(1, 9);
    expect(aimProximity(100 + AIM_PROX_RANGE, 3, 100)).toBeCloseTo(0, 9);
    expect(aimProximity(100 + AIM_PROX_RANGE + 10, 3, 100)).toBe(0); // clamped, never negative
  });

  it('never warms as you turn away — monotonic in angle when trusted', () => {
    const off = fc.double({ min: 0, max: 90, noNaN: true });
    fc.assert(
      fc.property(bearing, off, off, (b, d1, d2) => {
        const [near, far] = d1 <= d2 ? [d1, d2] : [d2, d1];
        expect(aimProximity(b + near, 3, b)).toBeGreaterThanOrEqual(aimProximity(b + far, 3, b) - 1e-9);
      }),
    );
  });
});

describe('aimTurn — how far, and which way', () => {
  it('reports exactly the magnitude angleDelta already agrees on', () => {
    // Two independent formulas for the same quantity: if one drifts, the other objects.
    fc.assert(
      fc.property(bearing, bearing, (h, b) => {
        expect(aimTurn(h, b).deg).toBeCloseTo(angleDelta(h, b), 9);
      }),
    );
  });

  it('never reports more than half a turn', () => {
    fc.assert(
      fc.property(bearing, bearing, (h, b) => {
        expect(aimTurn(h, b).deg).toBeGreaterThanOrEqual(0);
        expect(aimTurn(h, b).deg).toBeLessThanOrEqual(180);
      }),
    );
  });

  it('lands on the bearing when you actually make the turn it asks for', () => {
    // The end-to-end contract, in the reader's terms: turn by `deg` toward `dir` and you are
    // facing the qibla. (Clockwise is positive on a compass, which on the ground is your right.)
    //
    // This is deliberately the ONLY test of the side, and it is behavioural. Asserting
    // `dir === (shortestTurn(h, b) >= 0 ? 'right' : 'left')` was tried and removed: it
    // restates the implementation line for line, which CLAUDE.md forbids for good reason.
    // This one catches the same inversion strictly harder — flip the sign inside aimTurn
    // and `turned` lands 2·deg away from the bearing — while saying something a reader
    // could check with their own feet.
    fc.assert(
      fc.property(bearing, bearing, (h, b) => {
        const t = aimTurn(h, b);
        if (t.dir === 'around') return;
        const turned = normalizeHeading(h + (t.dir === 'right' ? t.deg : -t.deg));
        expect(angleDelta(turned, b)).toBeCloseTo(0, 6);
      }),
    );
  });

  it('only stops naming a side when the two sides really are the same journey', () => {
    // The behavioural half of the `around` band: whenever it declines to pick a side, going
    // the other way costs at most 2·(180 − AIM_TURN_AROUND)° more — i.e. the choice was
    // genuinely not worth making. (The exact boundary is pinned by example in qibla.test.ts.)
    fc.assert(
      fc.property(bearing, bearing, (h, b) => {
        const t = aimTurn(h, b);
        if (t.dir !== 'around') return;
        expect(360 - t.deg - t.deg).toBeLessThanOrEqual(2 * (180 - AIM_TURN_AROUND) + 1e-9);
      }),
    );
  });

  it('is unmoved by a heading that arrives outside [0, 360)', () => {
    // shortestTurn alone is only in range for normalized inputs; aimTurn normalizes so a
    // sensor that hands over 725° or -30° can't produce a 250° turn to the wrong side.
    fc.assert(
      fc.property(bearing, bearing, fc.integer({ min: -3, max: 3 }), (h, b, laps) => {
        // Magnitude compared with a tolerance, not exactly: adding whole laps to a double
        // and taking it back mod 360 costs a few ulps, which is float noise, not a wrap bug.
        const wrapped = aimTurn(h + laps * 360, b);
        const plain = aimTurn(h, b);
        expect(wrapped.deg).toBeCloseTo(plain.deg, 6);
        expect(wrapped.dir).toBe(plain.dir);
      }),
    );
  });
});

describe('deriveAimStatus — the band machine stays self-consistent', () => {
  const accuracy = fc.option(fc.integer({ min: 0, max: 3 }), { nil: null });

  it('keeps the three bands mutually consistent for every reading', () => {
    fc.assert(
      fc.property(bearing, bearing, accuracy, fc.boolean(), (heading, brg, acc, wasAligned) => {
        const s = deriveAimStatus(heading, acc, brg, wasAligned);
        const reliable = headingReliable(acc);
        expect(s.calibrating).toBe(!reliable); // calibrating iff the reading is untrusted
        expect(s.aligned && s.near).toBe(false); // never both at once
        if (s.aligned || s.near) expect(reliable).toBe(true); // a direction claim needs trust
        if (s.calibrating) {
          // an untrusted reading makes NO direction claim, even pointing dead-on
          expect(s.aligned).toBe(false);
          expect(s.near).toBe(false);
        }
      }),
    );
  });
});

describe('headingReliable — gates exactly at the calibration threshold', () => {
  it('is true at and above HEADING_ACCURACY_MIN, false below, and false for no reading', () => {
    // The lock/point decision turns on this boundary; an off-by-one (`>=` → `>`) would refuse
    // to ever confirm a just-calibrated compass, or lock onto a still-wobbly one.
    expect(headingReliable(HEADING_ACCURACY_MIN)).toBe(true); // exactly at threshold → trust
    expect(headingReliable(HEADING_ACCURACY_MIN + 1)).toBe(true);
    expect(headingReliable(HEADING_ACCURACY_MIN - 1)).toBe(false); // below → still calibrating
    expect(headingReliable(null)).toBe(false);
    expect(headingReliable(undefined)).toBe(false);
  });
});

// The qibla arc drawn on the map, fuzzed over every position the app can resolve to.
// Sweden's own bounding box, matching SWEDEN_BOUNDS in bonetider.tsx.

// ── Calibration hysteresis ───────────────────────────────────────────────────────
// A run of readings: each one's calibration level and the ms since the previous one.
const readings = fc.array(
  fc.record({ level: fc.constantFrom(0, 1, 2, 3), gap: fc.integer({ min: 0, max: 400 }) }),
  { minLength: 1, maxLength: 60 },
);

function fold(run: { level: number; gap: number }[]) {
  let gate = CALIBRATION_COLD;
  let now = 0;
  return run.map(({ level, gap }) => {
    now += gap;
    const step = holdCalibration(gate, level, now);
    gate = step.gate;
    return { level, now, trusted: headingReliable(step.accuracy) };
  });
}

describe('holdCalibration', () => {
  it('never trusts a low reading before any reading was trusted (the warm-up gate)', () => {
    fc.assert(
      fc.property(readings, (run) => {
        let seenTrusted = false;
        for (const r of fold(run)) {
          if (!seenTrusted && r.level < HEADING_ACCURACY_MIN) expect(r.trusted).toBe(false);
          if (r.level >= HEADING_ACCURACY_MIN) seenTrusted = true;
        }
      }),
    );
  });

  it('trusts every MEDIUM-or-better reading, and never a level-0 one', () => {
    fc.assert(
      fc.property(readings, (run) => {
        for (const r of fold(run)) {
          if (r.level >= HEADING_ACCURACY_MIN) expect(r.trusted).toBe(true);
          if (r.level === 0) expect(r.trusted).toBe(false);
        }
      }),
    );
  });

  it('withdraws trust once a run of low readings outlasts the hold', () => {
    fc.assert(
      fc.property(readings, (run) => {
        let lowSince: number | null = null;
        for (const r of fold(run)) {
          if (r.level >= HEADING_ACCURACY_MIN || r.level === 0) lowSince = null;
          else lowSince ??= r.now;
          if (lowSince !== null && r.now - lowSince >= CALIBRATION_HOLD_MS) expect(r.trusted).toBe(false);
        }
      }),
    );
  });

  // THE BUG THIS PINS: a phone held still near a band edge reads 2, 1, 2, 1 … and the raw
  // gate blinked the lock and the dial's warmth off and on with every other reading.
  it('rides out a one-reading dip without blinking', () => {
    const run = fold([
      { level: 2, gap: 0 },
      { level: 1, gap: 100 },
      { level: 2, gap: 100 },
      { level: 1, gap: 100 },
      { level: 2, gap: 100 },
    ]);
    expect(run.map((r) => r.trusted)).toEqual([true, true, true, true, true]);
  });
});
