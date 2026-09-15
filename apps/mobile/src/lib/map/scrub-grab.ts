/** Preserve the finger-to-thumb offset inside a 48 dp grab target.
 * Outside it, the rail still supports directly selecting a time. */
export function scrubGrabOffset(touchX: number, thumbX: number): number {
  'worklet';
  return Math.abs(touchX - thumbX) <= 24 ? thumbX - touchX : 0;
}
