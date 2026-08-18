// Indexed reads for tests, with a failure message worth reading.
//
// Under `noUncheckedIndexedAccess` every `arr[i]` is `T | undefined`. In app code that
// is a bounds check. In a TEST it is something more valuable: it catches assertions
// that never actually ran.
//
//   expect(rows[3].time).toBe('05:12')     // 3-row array → "cannot read 'time' of
//                                          // undefined". Loud, but says nothing.
//   expect(rows[3]?.time).toBeUndefined()  // 3-row array → PASSES. Green, and the
//                                          // thing it was written to check never
//                                          // happened.
//
// The second shape is the dangerous one, and optional chaining is exactly what a
// well-meaning fix for the first one reaches for. These helpers narrow the type the
// other way: they fail at the read, and name which index of what was short and how
// long the array really was — so the next session reads a diagnosis instead of a stack.

/** `arr[index]`, or a test failure naming what was short. `what` labels the subject. */
export function at<T>(arr: ArrayLike<T> | undefined, index: number, what = 'array'): T {
  if (arr === undefined) {
    throw new Error(`${what} is undefined — expected an array with an index ${index}.`);
  }
  const value = arr[index];
  if (value === undefined) {
    throw new Error(
      `${what}[${index}] is missing — ${what} has length ${arr.length}. The subject ` +
        `produced fewer elements than this assertion assumes, so the assertion never ` +
        `ran against real data.`,
    );
  }
  return value;
}

/** The first element, or a test failure. The common case, named. */
export function first<T>(arr: ArrayLike<T> | undefined, what = 'array'): T {
  return at(arr, 0, what);
}

/** The last element, or a test failure. */
export function last<T>(arr: ArrayLike<T> | undefined, what = 'array'): T {
  return at(arr, (arr?.length ?? 0) - 1, what);
}
