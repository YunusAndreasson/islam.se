// The geometry of a drawn Moon: where the terminator goes for a given illuminated fraction.
//
// Pure, and separate from the component that draws it, because this is the part that can be
// WRONG rather than merely ugly. A phase drawing that is a plausible crescent but the wrong
// SIZE of crescent is the exact failure lib/night-times went round the loop over — a moon in
// this app has to be the real moon for the day, and "real" here means the lit area on screen
// is the lit area in the sky.
//
// The construction, drawn lit-side-UP so the tilt is a single rotation applied afterwards:
//
//   • the limb — the top half of the disc's own circle;
//   • the terminator — half of an ellipse sharing the disc's horizontal semi-axis `r`, with
//     a vertical semi-axis of r·|1 − 2f|, bulging UP into the lit side while less than half
//     is lit and DOWN into the dark side once more than half is.
//
// That single parameter is exact, not an approximation: the lit region is a half-disc plus
// or minus a half-ellipse, so its area works out to exactly f·πr² at every f. The three
// fixed points fall out of it — f = 0 puts the ellipse on the circle (no light), f = 0.5
// flattens it to the diameter (a clean half), f = 1 mirrors it onto the bottom half (a full
// disc) — and shape.test.ts pins the area across the whole range rather than at those three.

export interface CrescentGeometry {
  /** Vertical semi-axis of the terminator ellipse, in the same units as the radius. */
  terminatorHalfHeight: number;
  /** Sweep angle for the terminator arc, degrees, in Skia's clockwise/y-down convention.
   *  Negative takes the ellipse's TOP half (cutting into the lit side — a crescent);
   *  positive takes its bottom half (adding to it — gibbous). */
  sweep: number;
  /** Less than half lit. The callers use it for nothing but a name; it is here because the
   *  sign of `sweep` is otherwise the only record of which side the bulge went, and a sign
   *  is a poor thing to read a semantic off. */
  crescent: boolean;
}

export function crescentGeometry(radius: number, illumination: number): CrescentGeometry {
  const f = Math.min(1, Math.max(0, illumination));
  // 1 at new, 0 at half, −1 at full. Its magnitude is how far the terminator bulges; its
  // sign is which way.
  const k = 1 - 2 * f;
  return {
    terminatorHalfHeight: Math.abs(k) * radius,
    sweep: k >= 0 ? -180 : 180,
    crescent: k >= 0,
  };
}

/** Where the Moon sits on the sky dial, as a fraction of the dial's radius from its centre.
 *
 *  The dial in sky mode is a dome seen from underneath: azimuth runs round the rim and
 *  ALTITUDE runs inward, so low is out near the edge and high is near the middle.
 *
 *  ⚠️ THE SCALE RUNS OVER 0–60°, NOT 0–90°, AND THAT IS THE WHOLE POINT. Clamping a plain
 *  `1 − altitude/90` into the same output band looks equivalent and is not: it saturates at
 *  the outer bound for everything below 40.5°, so a Moon five degrees up, twenty up, forty up
 *  and one under the horizon all drew at the same radius — the cue dead across the entire
 *  range this app is read in. At 59°N the Moon clears 60° only around its highest passages.
 *
 *  The bounds are not free either. OUTER is set by the cardinal letters, which ride the same
 *  rotating rose and whose glyphs sit from about 0.69 r out; past ~0.55 r plus the Moon's own
 *  radius the disc walks through the "O". INNER keeps it off the hub.
 */
export const SKY_REACH_OUTER = 0.55;
export const SKY_REACH_INNER = 0.24;
export const SKY_SCALE_TOP_DEG = 60;

export function skyReach(altitudeDeg: number): number {
  const climbed = Math.min(1, Math.max(0, altitudeDeg) / SKY_SCALE_TOP_DEG);
  return SKY_REACH_OUTER - (SKY_REACH_OUTER - SKY_REACH_INNER) * climbed;
}
