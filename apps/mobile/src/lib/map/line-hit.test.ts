import { expect, it } from '@jest/globals';
import { distanceToLine } from './line-hit';
import { project, type Camera } from './projection';

const camera: Camera = { lon: 18, lat: 60, zoom: 5, width: 400, height: 800 };
const line: [number, number][] = [[18, 59], [18, 61]];
it('hits along the segment with a screen-sized allowance at different zooms', () => {
  for (const zoom of [3, 8, 14]) {
    const view = { ...camera, zoom };
    const p = project(18, 60, view);
    expect(distanceToLine({ x: p.x + 18, y: p.y }, line, view)).toBeCloseTo(18);
    expect(distanceToLine({ x: p.x + 30, y: p.y }, line, view)).toBeCloseTo(30);
  }
});
it('does not extend a line beyond its endpoints', () => {
  expect(distanceToLine(project(18, 62, camera), line, camera)).toBeGreaterThan(22);
});
it('handles empty paths and repeated points without phantom hits', () => {
  expect(distanceToLine({ x: 0, y: 0 }, [], camera)).toBe(Infinity);
  expect(distanceToLine(project(18, 60, camera), [[18, 60], [18, 60]], camera)).toBe(0);
});
