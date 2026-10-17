import { describe, expect, it } from '@jest/globals';

import { canTransformSolarPath } from './path-precision';
import { worldSize } from './projection';

describe('native solar path precision', () => {
  it('keeps accepted float32 transforms within 0.05 screen pixels', () => {
    let accepted = 0;
    for (const zoom of [3, 4.37, 7, 9, 11, 14, 18, 22]) {
      const scale = worldSize(zoom);
      for (const radius of [0.00001, 0.001, 0.1, 0.5]) {
        for (const tx of [0, 205.7, -7_000, 1_000_000]) {
          const ty = -tx / 3;
          if (!canTransformSolarPath(zoom, scale, radius, tx, ty)) continue;
          accepted++;
          for (let i = -20; i <= 20; i++) {
            const x = radius * i / 20;
            const y = Math.sqrt(Math.max(0, radius ** 2 - x ** 2));
            const projectedX = Math.fround(Math.fround(Math.fround(x) * Math.fround(scale)) + Math.fround(tx));
            const projectedY = Math.fround(Math.fround(Math.fround(y) * Math.fround(scale)) + Math.fround(ty));
            expect(Math.hypot(projectedX - (x * scale + tx), projectedY - (y * scale + ty)))
              .toBeLessThan(0.05);
          }
        }
      }
    }
    expect(accepted).toBeGreaterThan(20);
  });

  it('uses the original double precision projection at close zooms and for distant geometry', () => {
    expect(canTransformSolarPath(14, worldSize(14), 0.1, 200, 400)).toBe(false);
    expect(canTransformSolarPath(4, worldSize(4), 0.1, 1e9, 1e9)).toBe(false);
    expect(canTransformSolarPath(4, worldSize(4), 0.1, 200, 400)).toBe(true);
  });
});
