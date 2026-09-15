export type VisibleLineRange = { start: number; end: number };

/**
 * First and last visible distances, normalized over the complete path length.
 * Each flat x/y array is a separate subpath: moveTo gaps contribute no length.
 * Offscreen gaps between visible pieces remain inside the returned trim range.
 * Invalid geometry and paths with no visible length return null.
 */
export function visibleLineRange(
  polylines: readonly (readonly number[])[],
  width: number,
  height: number,
): VisibleLineRange | null {
  'worklet';
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  let total = 0;
  let first = Infinity;
  let last = -Infinity;
  for (let lineIndex = 0; lineIndex < polylines.length; lineIndex += 1) {
    const line = polylines[lineIndex]!;
    if (line.length % 2 !== 0) return null;
    for (let point = 0; point < line.length; point += 2) {
      const x = line[point]!;
      const y = line[point + 1]!;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      if (point === 0) continue;

      const x0 = line[point - 2]!;
      const y0 = line[point - 1]!;
      const dx = x - x0;
      const dy = y - y0;
      const length = Math.sqrt(dx * dx + dy * dy);
      if (!Number.isFinite(length)) return null;
      if (length === 0) continue;

      // Liang–Barsky clips even a segment whose two endpoints are offscreen.
      // Scalar bounds avoid temporary points/arrays on the animation thread.
      let enter = 0;
      let leave = 1;
      for (let edge = 0; edge < 4; edge += 1) {
        const p = edge === 0 ? -dx : edge === 1 ? dx : edge === 2 ? -dy : dy;
        const q = edge === 0 ? x0 : edge === 1 ? width - x0 : edge === 2 ? y0 : height - y0;
        if (p === 0) {
          if (q < 0) {
            leave = -1;
            break;
          }
        } else {
          const ratio = q / p;
          if (p < 0) enter = Math.max(enter, ratio);
          else leave = Math.min(leave, ratio);
          if (enter >= leave) break;
        }
      }
      if (enter < leave) {
        first = Math.min(first, total + enter * length);
        last = Math.max(last, total + leave * length);
      }
      total += length;
      if (!Number.isFinite(total)) return null;
    }
  }
  return total > 0 && first < last ? { start: first / total, end: last / total } : null;
}
