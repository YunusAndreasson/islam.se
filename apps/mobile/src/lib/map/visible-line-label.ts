import { type Camera, mercX, mercY, type ScreenPoint, worldSize } from './projection';

/** Keep a displaced label on its actual line, in the map area clear of controls. */
export function visibleLineLabel(
  anchor: ScreenPoint,
  mercLines: readonly Float64Array[],
  camera: Camera,
  top: number,
  bottom: number,
): ScreenPoint {
  'worklet';
  const left = 32;
  const right = camera.width - 32;
  const lower = camera.height - bottom;
  if (right < left || lower < top) return anchor;
  if (anchor.x >= left && anchor.x <= right && anchor.y >= top && anchor.y <= lower) {
    return anchor;
  }

  const scale = worldSize(camera.zoom);
  const ox = camera.width / 2 - mercX(camera.lon) * scale;
  const oy = camera.height / 2 - mercY(camera.lat) * scale;
  let bestDistance = Infinity;
  let bestX = anchor.x;
  let bestY = anchor.y;
  for (const line of mercLines) {
    for (let i = 2; i + 1 < line.length; i += 2) {
      const ax = line[i - 2];
      const ay = line[i - 1];
      const bx = line[i];
      const by = line[i + 1];
      if (ax === undefined || ay === undefined || bx === undefined || by === undefined) continue;
      const x = ax * scale + ox;
      const y = ay * scale + oy;
      const dx = (bx - ax) * scale;
      const dy = (by - ay) * scale;
      if (!Number.isFinite(x + y + dx + dy)) continue;

      // Clip the segment's parameter interval against each rectangle axis. Both
      // endpoints may be offscreen while the segment between them remains visible.
      let enter = 0;
      let leave = 1;
      if (dx === 0) {
        if (x < left || x > right) continue;
      } else {
        const a = (left - x) / dx;
        const b = (right - x) / dx;
        enter = Math.max(enter, Math.min(a, b));
        leave = Math.min(leave, Math.max(a, b));
      }
      if (dy === 0) {
        if (y < top || y > lower) continue;
      } else {
        const a = (top - y) / dy;
        const b = (lower - y) / dy;
        enter = Math.max(enter, Math.min(a, b));
        leave = Math.min(leave, Math.max(a, b));
      }
      if (enter > leave) continue;

      const lengthSquared = dx * dx + dy * dy;
      const closest = lengthSquared === 0
        ? enter
        : ((anchor.x - x) * dx + (anchor.y - y) * dy) / lengthSquared;
      const t = Math.max(enter, Math.min(leave, closest));
      const px = x + t * dx;
      const py = y + t * dy;
      const distance = (px - anchor.x) ** 2 + (py - anchor.y) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestX = px;
        bestY = py;
      }
    }
  }
  // No visible segment: retain the offscreen anchor instead of inventing a label
  // at an unrelated edge of the map.
  return bestDistance === Infinity ? anchor : { x: bestX, y: bestY };
}
