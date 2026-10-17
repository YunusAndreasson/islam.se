/** Skia stores path vertices and matrices as float32. Keep native transforms only
 * where a conservative rounding bound stays below 0.05 screen pixels. The original
 * Float64 projection remains available for close zooms and distant geometry. */
export function canTransformSolarPath(
  zoom: number,
  scale: number,
  radius: number,
  translateX: number,
  translateY: number,
): boolean {
  'worklet';
  const unitRoundoff = 2 ** -24;
  const error = unitRoundoff * (8 * scale * radius + 4 * Math.hypot(translateX, translateY));
  return zoom <= 11 && error < 0.05;
}
