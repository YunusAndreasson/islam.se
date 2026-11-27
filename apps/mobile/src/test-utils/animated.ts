// Reading what an Animated element is actually wearing.
//
// Reanimated runs its own JS implementation under test (jest.resolver.js,
// jest.setup-after-env.js), so a `useAnimatedStyle` worklet really runs and its result is
// held by the library, not written into `props.style`. Tests used to get at it by replacing
// `useAnimatedStyle` with a function that called the worklet inline — a mock of the library
// standing in for the library. This asks Reanimated instead, through the hook it ships for
// exactly this: the element's static style with its animated style laid over it.
import { jest } from '@jest/globals';
import { act } from '@testing-library/react-native';
import { getAnimatedStyle } from 'react-native-reanimated';
import type { TestInstance } from 'test-renderer';

//
// The cast is for the package's TYPES, which describe its web build — there this function is
// an empty stub taking nothing. Under Jest the native build is the one loaded, and it takes
// the element and returns its style (the same read `toHaveAnimatedStyle` is built on; that
// matcher only compares for equality, and placement tests need the numbers).
const readStyle = getAnimatedStyle as unknown as (element: TestInstance) => Record<string, any>;

export function animatedStyle(node: TestInstance): Record<string, any> {
  return readStyle(node);
}

/** One frame at the 60 fps Reanimated's test setup runs its clock at, rounded up. */
const FRAME_MS = 17;

/**
 * One frame of Reanimated's clock. A shared value written outside a render (an onLayout
 * that calls `size.set(...)`) reaches the styles that read it on the NEXT frame, as on a
 * device. Needs Jest's fake timers — the frame is stepped, never waited for.
 */
export async function nextFrame(): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(FRAME_MS);
  });
}

/**
 * Let calls that crossed from a worklet to the JS thread arrive. `scheduleOnRN` is a hop,
 * not a call — the library's own mock delivers it on a microtask, as the real bridge
 * delivers it on a later turn of the JS thread — so an assertion about what JS received
 * comes after this, never on the line after the gesture.
 */
export async function crossToJs(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}
