import { projectedPolyline } from './line-geometry';
import { type Camera, mercX, mercY, type ScreenPoint, worldSize } from './projection';

/** Distance in screen points, so the touch allowance stays usable at every zoom. */
export function distanceToLine(point: ScreenPoint, line: readonly (readonly [number, number])[], camera: Camera): number {
  if (line.length < 2) return Infinity;
  // The screen is a uniform scale and translation of Mercator. Transform the tap
  // once, then compare it to the same vertices the field and its pill already drew.
  const scale = worldSize(camera.zoom);
  const x = mercX(camera.lon) + (point.x - camera.width / 2) / scale;
  const y = mercY(camera.lat) + (point.y - camera.height / 2) / scale;
  const path = projectedPolyline(line);
  let nearestSquared = Infinity;
  for (let i = 2; i < path.length; i += 2) {
    const fromX = path[i - 2]!;
    const fromY = path[i - 1]!;
    const dx = path[i]! - fromX;
    const dy = path[i + 1]! - fromY;
    const length = dx * dx + dy * dy;
    const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - fromX) * dx + (y - fromY) * dy) / length));
    const offsetX = x - fromX - t * dx;
    const offsetY = y - fromY - t * dy;
    nearestSquared = Math.min(nearestSquared, offsetX * offsetX + offsetY * offsetY);
  }
  return Math.sqrt(nearestSquared) * scale;
}
