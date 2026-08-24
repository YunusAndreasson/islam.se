// The instrument's own maths: how far off am I, which way do I turn, and may I trust the
// reading at all. Shared by the qibla compass, the Moon's sky dial and the map's compass
// button — see lib/aim. The qibla-specific geometry (the bearing to Mecca, the great-circle
// arc) is tested next door in qibla.test.ts.
import { describe, expect, it } from '@jest/globals';

import {
  AIM_ALIGN_RELEASE,
  AIM_ALIGN_TOL,
  AIM_TURN_AROUND,
  aimAligned,
  aimTurn,
  angleDelta,
  compassPoint,
  deriveAimStatus,
  headingReliable,
} from './aim';

describe('angleDelta', () => {
  it('is wrap-aware across 0/360', () => {
    expect(angleDelta(359, 1)).toBe(2);
    expect(angleDelta(10, 350)).toBe(20);
  });

  it('is 0 when equal and 180 when opposite', () => {
    expect(angleDelta(90, 90)).toBe(0);
    expect(angleDelta(0, 180)).toBe(180);
  });
});

describe('headingReliable', () => {
  // The compass needle was "wrong at first, then right": the first readings arrive
  // mid-calibration (accuracy 0–1, up to >50° off on iOS) before the magnetometer
  // settles. Gating the qibla lock on accuracy ≥ 2 is what stops the app pointing at —
  // and buzzing "you're facing Mecca" on — a confidently-wrong heading during warm-up.
  it('rejects no-reading and low-calibration levels', () => {
    expect(headingReliable(null)).toBe(false);
    expect(headingReliable(undefined)).toBe(false);
    expect(headingReliable(0)).toBe(false); // none (>50° uncertainty on iOS)
    expect(headingReliable(1)).toBe(false); // low — still too coarse for a 4° lock
  });

  it('accepts medium and high calibration', () => {
    expect(headingReliable(2)).toBe(true);
    expect(headingReliable(3)).toBe(true); // high (<20° uncertainty on iOS)
  });
});

describe('aimAligned', () => {
  it('acquires a lock only within the tight tolerance', () => {
    expect(aimAligned(0, false)).toBe(true);
    expect(aimAligned(AIM_ALIGN_TOL, false)).toBe(true); // exactly at the edge → lock
    expect(aimAligned(AIM_ALIGN_TOL + 0.1, false)).toBe(false);
  });

  it('holds a lock through the wider release band (hysteresis)', () => {
    // The whole point: a heading sitting at 5° off is NOT close enough to acquire a fresh
    // lock, but IS close enough to keep an existing one. That gap is what stops jitter on
    // the 4° edge from strobing the brass lock and re-buzzing the haptic frame after frame.
    expect(aimAligned(5, false)).toBe(false); // can't acquire here…
    expect(aimAligned(5, true)).toBe(true); // …but holds if already locked
    expect(aimAligned(AIM_ALIGN_RELEASE, true)).toBe(true); // holds to the release edge
    expect(aimAligned(AIM_ALIGN_RELEASE + 0.1, true)).toBe(false); // past it → release
  });

  it('keeps acquire tighter than release so the band is real', () => {
    expect(AIM_ALIGN_TOL).toBeLessThan(AIM_ALIGN_RELEASE);
  });
});

describe('deriveAimStatus', () => {
  const BEARING = 148; // a Stockholm-ish qibla, due south-east

  it('does NOT lock onto an uncalibrated reading pointing dead at the qibla', () => {
    // THE documented "wrong at first, then right" bug: during magnetometer warm-up the heading
    // can read tens of degrees off while the OS still reports low calibration. Even when such a
    // reading happens to point EXACTLY at the bearing, accuracy below MEDIUM must surface as
    // `calibrating` — never `aligned` — or the app buzzes "du är vänd mot Mecka" at the wrong
    // orientation. This is the single most important correctness property of the screen.
    expect(deriveAimStatus(BEARING, 0, BEARING, false)).toEqual({ aligned: false, near: false, calibrating: true });
    expect(deriveAimStatus(BEARING, 1, BEARING, false)).toEqual({ aligned: false, near: false, calibrating: true });
  });

  it('locks the instant the reading is both trusted and aimed', () => {
    expect(deriveAimStatus(BEARING, 2, BEARING, false)).toEqual({ aligned: true, near: false, calibrating: false });
    expect(deriveAimStatus(BEARING, 3, BEARING, false)).toEqual({ aligned: true, near: false, calibrating: false });
  });

  it('reports "on your way" in the approach band, not a lock', () => {
    expect(deriveAimStatus(BEARING + 20, 3, BEARING, false)).toEqual({ aligned: false, near: true, calibrating: false });
  });

  it('carries the lock hysteresis through `wasAligned`', () => {
    // 6° off: not close enough to ACQUIRE a fresh lock (so it reads "near"), but close enough
    // to HOLD one already established — the gap that stops 4°-edge jitter from strobing it.
    expect(deriveAimStatus(BEARING + 6, 3, BEARING, false)).toEqual({ aligned: false, near: true, calibrating: false });
    expect(deriveAimStatus(BEARING + 6, 3, BEARING, true)).toEqual({ aligned: true, near: false, calibrating: false });
  });
});

// The remaining turn, which the readout counts down and the status line names. Getting the
// SIDE wrong is the worst failure here: it sends the reader turning away from Mecca while the
// screen encourages them, and unlike a wrong magnitude it never self-corrects.
describe('aimTurn', () => {
  const BEARING = 148;

  it('reports nothing left to turn when already aimed', () => {
    expect(aimTurn(BEARING, BEARING)).toEqual({ deg: 0, dir: 'right' });
  });

  it('sends you RIGHT when the qibla is clockwise of your heading', () => {
    // Facing north-east, qibla south-east: the short way round is clockwise = your right.
    expect(aimTurn(45, BEARING)).toEqual({ deg: 103, dir: 'right' });
  });

  it('sends you LEFT when the qibla is anticlockwise of your heading', () => {
    // Facing south-west, qibla south-east: the short way back is anticlockwise = your left.
    expect(aimTurn(220, BEARING)).toEqual({ deg: 72, dir: 'left' });
  });

  it('takes the SHORT way across the 0/360 seam', () => {
    // Heading 350°, qibla 10°: 20° to the right, not 340° to the left.
    expect(aimTurn(350, 10)).toEqual({ deg: 20, dir: 'right' });
    expect(aimTurn(10, 350)).toEqual({ deg: 20, dir: 'left' });
  });

  it('says "turn around" once the side stops meaning anything', () => {
    // Near 180° off, left and right are the same journey and the sign is decided by sensor
    // jitter — an un-banded readout would strobe "vrid åt höger" / "vrid åt vänster" every
    // tick. Inside the band we stop naming a side at all.
    expect(aimTurn(BEARING + 180, BEARING).dir).toBe('around');
    expect(aimTurn(BEARING + AIM_TURN_AROUND, BEARING).dir).toBe('around');
    // ...and one degree short of it still commits to a side. A heading CLOCKWISE of the
    // bearing turns back anticlockwise, so overshooting to the right sends you left.
    expect(aimTurn(BEARING + AIM_TURN_AROUND - 1, BEARING).dir).toBe('left');
    expect(aimTurn(BEARING - AIM_TURN_AROUND + 1, BEARING).dir).toBe('right');
  });

  it('normalizes an out-of-range heading rather than reporting a wild turn', () => {
    expect(aimTurn(45 + 720, BEARING)).toEqual({ deg: 103, dir: 'right' });
  });
});

describe('compassPoint — a bearing, said out loud', () => {
  it('names the eight points at their exact bearings', () => {
    expect([0, 45, 90, 135, 180, 225, 270, 315].map(compassPoint)).toEqual([
      'norr',
      'nordost',
      'öster',
      'sydost',
      'söder',
      'sydväst',
      'väster',
      'nordväst',
    ]);
  });

  it('rounds to the nearest point and wraps cleanly through north', () => {
    // 337.5 and above belongs to north again: the last sector straddles 0°, which is the one
    // place a naive floor(deg / 45) produces "nordväst" for a bearing of 359°.
    expect(compassPoint(359)).toBe('norr');
    expect(compassPoint(360)).toBe('norr');
    expect(compassPoint(338)).toBe('norr');
    expect(compassPoint(337)).toBe('nordväst');
    expect(compassPoint(-45)).toBe('nordväst');
  });

  it('names every bearing, so no sentence can be built round an undefined', () => {
    for (let deg = 0; deg < 360; deg += 0.5) expect(compassPoint(deg)).toBeTruthy();
  });
});
