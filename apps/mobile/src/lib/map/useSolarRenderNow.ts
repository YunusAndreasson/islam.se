// The instant the map's lines are DRAWN for, on the UI thread: the displayed clock
// (nowFraction of the viewed day), sampled by solarRenderInstant. The Skia lines and the
// pills riding them both read this one value, so a pill drifts with its line frame for
// frame instead of each layer keeping its own clock.
import { type SharedValue, useDerivedValue } from 'react-native-reanimated';

import type { Camera } from './projection';
import { solarRenderInstant } from './solar-render-clock';

export function useSolarRenderNow(
  nowFraction: SharedValue<number>,
  dayStart: number,
  dayLength: number,
  camera: SharedValue<Camera>,
  preview: boolean,
): SharedValue<number> {
  return useDerivedValue(() =>
    solarRenderInstant(dayStart + nowFraction.get() * dayLength, dayStart, camera.get().zoom, preview),
  );
}
