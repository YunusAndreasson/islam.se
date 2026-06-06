import { describe, expect, it } from '@jest/globals';

import {
  angleDelta,
  deriveQiblaStatus,
  formatKm,
  headingReliable,
  KAABA,
  QIBLA_ALIGN_RELEASE,
  QIBLA_ALIGN_TOL,
  qiblaAligned,
  qiblaBearing,
  qiblaDistanceKm,
} from './qibla';

describe('qiblaBearing', () => {
  it('points south-east from Sweden (toward Mecca)', () => {
    // Stockholm → ~148° (SE). A Swedish user faces roughly south-east for the qibla;
    // anything pointing north would be a sign the bearing math is inverted.
    const b = qiblaBearing({ latitude: 59.3293, longitude: 18.0686 });
    expect(b).toBeGreaterThan(120);
    expect(b).toBeLessThan(165);
  });
});

describe('qiblaDistanceKm', () => {
  it('is ~0 at the Kaaba itself', () => {
    expect(qiblaDistanceKm(KAABA)).toBeLessThan(1);
  });

  it('matches the known Stockholm→Mecca great-circle distance', () => {
    const d = qiblaDistanceKm({ latitude: 59.3293, longitude: 18.0686 });
    expect(d).toBeGreaterThan(4000);
    expect(d).toBeLessThan(4800);
  });
});

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

describe('qiblaAligned', () => {
  it('acquires a lock only within the tight tolerance', () => {
    expect(qiblaAligned(0, false)).toBe(true);
    expect(qiblaAligned(QIBLA_ALIGN_TOL, false)).toBe(true); // exactly at the edge → lock
    expect(qiblaAligned(QIBLA_ALIGN_TOL + 0.1, false)).toBe(false);
  });

  it('holds a lock through the wider release band (hysteresis)', () => {
    // The whole point: a heading sitting at 5° off is NOT close enough to acquire a fresh
    // lock, but IS close enough to keep an existing one. That gap is what stops jitter on
    // the 4° edge from strobing the brass lock and re-buzzing the haptic frame after frame.
    expect(qiblaAligned(5, false)).toBe(false); // can't acquire here…
    expect(qiblaAligned(5, true)).toBe(true); // …but holds if already locked
    expect(qiblaAligned(QIBLA_ALIGN_RELEASE, true)).toBe(true); // holds to the release edge
    expect(qiblaAligned(QIBLA_ALIGN_RELEASE + 0.1, true)).toBe(false); // past it → release
  });

  it('keeps acquire tighter than release so the band is real', () => {
    expect(QIBLA_ALIGN_TOL).toBeLessThan(QIBLA_ALIGN_RELEASE);
  });
});

describe('deriveQiblaStatus', () => {
  const BEARING = 148; // a Stockholm-ish qibla, due south-east

  it('does NOT lock onto an uncalibrated reading pointing dead at the qibla', () => {
    // THE documented "wrong at first, then right" bug: during magnetometer warm-up the heading
    // can read tens of degrees off while the OS still reports low calibration. Even when such a
    // reading happens to point EXACTLY at the bearing, accuracy below MEDIUM must surface as
    // `calibrating` — never `aligned` — or the app buzzes "du är vänd mot Mecka" at the wrong
    // orientation. This is the single most important correctness property of the screen.
    expect(deriveQiblaStatus(BEARING, 0, BEARING, false)).toEqual({ aligned: false, near: false, calibrating: true });
    expect(deriveQiblaStatus(BEARING, 1, BEARING, false)).toEqual({ aligned: false, near: false, calibrating: true });
  });

  it('locks the instant the reading is both trusted and aimed', () => {
    expect(deriveQiblaStatus(BEARING, 2, BEARING, false)).toEqual({ aligned: true, near: false, calibrating: false });
    expect(deriveQiblaStatus(BEARING, 3, BEARING, false)).toEqual({ aligned: true, near: false, calibrating: false });
  });

  it('reports "on your way" in the approach band, not a lock', () => {
    expect(deriveQiblaStatus(BEARING + 20, 3, BEARING, false)).toEqual({ aligned: false, near: true, calibrating: false });
  });

  it('carries the lock hysteresis through `wasAligned`', () => {
    // 6° off: not close enough to ACQUIRE a fresh lock (so it reads "near"), but close enough
    // to HOLD one already established — the gap that stops 4°-edge jitter from strobing it.
    expect(deriveQiblaStatus(BEARING + 6, 3, BEARING, false)).toEqual({ aligned: false, near: true, calibrating: false });
    expect(deriveQiblaStatus(BEARING + 6, 3, BEARING, true)).toEqual({ aligned: true, near: false, calibrating: false });
  });
});

describe('formatKm', () => {
  it('rounds and groups thousands in Swedish style', () => {
    // sv-SE groups with a (thin/no-break) space, not a comma.
    expect(formatKm(412.4)).toMatch(/^412 km$/);
    expect(formatKm(4102).replace(/\s/g, ' ')).toMatch(/^4 ?102 km$/);
  });
});
