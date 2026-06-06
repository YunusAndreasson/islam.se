/** Milliseconds in a day. */
export const MS_PER_DAY = 86_400_000;

/** Deterministic day-based index into a rotation of `length` items. Advances once
 *  per UTC day, so the daily verse / daily quote / märkesdagar all turn over in
 *  lockstep, and is stable within a single build (the value is fixed at build time
 *  and only changes on the next deploy). Returns 0 for an empty rotation. */
export function dayIndex(length: number): number {
	if (length <= 0) return 0;
	return Math.floor(Date.now() / MS_PER_DAY) % length;
}
