import { expect, it, jest } from '@jest/globals';
import { projectedContour } from './line-geometry';
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
it('reuses the drawn contour’s vertex projections when hit-testing at different zooms', () => {
  // Opening and dismissing a prayer-line hint used to project every segment's
  // endpoints again on both taps, even though the field had already drawn them.
  const path: [number, number][] = [[18, 59.2], [18, 59.8], [18, 60.5]];
  const tangent = jest.spyOn(Math, 'tan');
  try {
    projectedContour([path]);
    const vertexAngles = new Set(tangent.mock.calls.map(([angle]) => angle));
    expect(vertexAngles.size).toBe(path.length);
    tangent.mockClear();
    for (const zoom of [3, 8, 14]) {
      // The vertical line passes through this viewport's centre at every zoom.
      const tap = { x: camera.width / 2 + 17, y: camera.height / 2 };
      expect(distanceToLine(tap, path, { ...camera, zoom })).toBeCloseTo(17);
    }
    const reprojectedVertices = tangent.mock.calls.filter(([angle]) => vertexAngles.has(angle));
    expect(reprojectedVertices).toHaveLength(0);
  } finally {
    tangent.mockRestore();
  }
});
it('does not extend a line beyond its endpoints', () => {
  expect(distanceToLine(project(18, 62, camera), line, camera)).toBeGreaterThan(22);
});
it('handles empty paths and repeated points without phantom hits', () => {
  expect(distanceToLine({ x: 0, y: 0 }, [], camera)).toBe(Infinity);
  expect(distanceToLine(project(18, 60, camera), [[18, 60], [18, 60]], camera)).toBe(0);
});
