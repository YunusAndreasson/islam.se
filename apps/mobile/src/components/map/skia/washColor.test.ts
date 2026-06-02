// Tests for washColorAt — the CPU twin of washShader.ts's twilight() compositing. This is
// the ONLY automated coverage of the fade's colour logic (the SkSL shader itself can't run
// under Jest), so these pin the physical contract the shader must honour rather than any
// hardcoded numbers: they read channel relations and alpha thresholds that a sign-flip,
// dropped term, or ramp regression would visibly break on the map.
import { describe, expect, it } from '@jest/globals';
import * as fc from 'fast-check';

import { washStopsLight } from '../../../lib/solar/palette';
import { washColorAt } from './washColor';

const NIGHT_A = washStopsLight.NIGHT[3];

describe('washColorAt — the depression-based twilight wash', () => {
  it('is fully transparent while the sun is up (incl. midnight sun), at any hour angle', () => {
    for (const ha of [-179, -90, 0, 90, 179]) {
      expect(washColorAt(0.5, ha)[3]).toBe(0); // a hair above the horizon → clear
      expect(washColorAt(10, ha)).toEqual(washStopsLight.DAY); // well up → untouched basemap
    }
  });

  it('saturates to the deep NIGHT veil by astronomical depth, never blacker', () => {
    // The headline the whole solar model exists for: a place that only reaches ~13° (Malmö,
    // late May) is already a deep luminous indigo but NOT maxed; by 14°+ the veil is the full
    // NIGHT alpha and the hue is clean indigo (blue dominant) — never pure black.
    const deep = washColorAt(-20, 175); // well past 14°, near solar midnight
    expect(deep[3]).toBeCloseTo(NIGHT_A, 5);

    const malmo = washColorAt(-13, 178);
    expect(malmo[3]).toBeGreaterThan(0.6); // clearly night-ish
    expect(malmo[3]).toBeLessThanOrEqual(NIGHT_A + 1e-9); // but never past the deep-night veil
    expect(malmo[2]).toBeGreaterThan(malmo[0]); // indigo, not black/grey: blue leads red
  });

  it('darkens monotonically as the sun sinks (more depression never lightens the veil)', () => {
    // Beyond the glow band (d ≥ 10) the alpha is purely NIGHT.a·smoothstep(1,14,d), which is
    // non-decreasing — a regression that inverted the ramp would surface here.
    let prev = -1;
    for (let d = 10; d <= 18; d += 0.5) {
      const a = washColorAt(-d, 175)[3];
      expect(a).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = a;
    }
  });

  it('is WARM at dusk and COOL at dawn for the same civil-twilight depression', () => {
    // ~3° down. Evening (ha > 0 → sun in the west) → terracotta, red leads blue. Morning
    // (ha < 0 → sun in the east) → cornflower, blue leads red. The handover is sin(ha): a
    // sign error on the longitude/hour-angle term would swap these.
    const dusk = washColorAt(-3, 140);
    const dawn = washColorAt(-3, -140);
    expect(dusk[0]).toBeGreaterThan(dusk[2]); // warm
    expect(dawn[2]).toBeGreaterThan(dawn[0]); // cool
  });

  it('blooms a warm golden kiss right at the sunrise horizon, morning-side only', () => {
    // On the morning side the gold kiss warms the lowest few degrees, so the dawn just above
    // the horizon reads warmer (higher red−blue) than the dawn deeper in civil twilight.
    const dawnNear = washColorAt(-1, -150);
    const dawnMid = washColorAt(-3, -150);
    expect(dawnNear[0] - dawnNear[2]).toBeGreaterThan(dawnMid[0] - dawnMid[2]);

    // The kiss is morning-gated: the evening at the same low depression is NOT pulled toward
    // dawn-gold — it warms with depth (rising glow over DUSK_WARM) instead, the opposite trend.
    const duskNear = washColorAt(-1, 150);
    const duskMid = washColorAt(-3, 150);
    expect(duskMid[0] - duskMid[2]).toBeGreaterThan(duskNear[0] - duskNear[2]);
  });
});

describe('washColorAt — bounded and finite (property)', () => {
  const alt = fc.double({ min: -40, max: 40, noNaN: true });
  const ha = fc.double({ min: -180, max: 180, noNaN: true });

  it('returns finite rgb in [0,255] and alpha in [0,1] for any sun position', () => {
    fc.assert(
      fc.property(alt, ha, (a, h) => {
        const c = washColorAt(a, h);
        for (const ch of [c[0], c[1], c[2]]) {
          expect(Number.isFinite(ch)).toBe(true);
          expect(ch).toBeGreaterThanOrEqual(0);
          expect(ch).toBeLessThanOrEqual(255);
        }
        expect(c[3]).toBeGreaterThanOrEqual(0);
        expect(c[3]).toBeLessThanOrEqual(1);
      }),
    );
  });

  it('is clear (alpha 0) for any hour angle whenever the sun is at or above the horizon', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 40, noNaN: true }), ha, (a, h) => {
        expect(washColorAt(a, h)[3]).toBe(0);
      }),
    );
  });
});
