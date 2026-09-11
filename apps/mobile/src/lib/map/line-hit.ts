import { type Camera, project, type ScreenPoint } from './projection';

/** Distance in screen points, so the touch allowance stays usable at every zoom. */
export function distanceToLine(point: ScreenPoint, line: readonly (readonly [number, number])[], camera: Camera): number {
  let nearest = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const start = project(a[0], a[1], camera);
    const end = project(b[0], b[1], camera);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = dx * dx + dy * dy;
    const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / length));
    nearest = Math.min(nearest, Math.hypot(point.x - start.x - t * dx, point.y - start.y - t * dy));
  }
  return nearest;
}
