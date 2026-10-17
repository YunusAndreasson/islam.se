import { worldSize } from './projection';

const SOLAR_DAY_MS = 86_400_000;
const MAX_LAG_MS = 500;
const MAX_DRIFT_PX = 0.05;
const FRAME_MS = 16;

/** Sample the live drawing clock, without changing prayer times or the actual clock.
 *
 * A stationary national map moves much less than one pixel per second. Sending its
 * shader and paths a new instant every frame spends GPU work on invisible changes.
 * This primitive stays equal between samples, letting Reanimated skip those updates.
 * At closer zooms the cadence rises; once sampling would exceed frame rate, use the
 * exact instant. Direct manipulation always uses the exact instant too.
 */
export function solarRenderInstant(
  nowMs: number,
  dayStart: number,
  zoom: number,
  preview: boolean,
): number {
  'worklet';
  if (preview || nowMs <= dayStart) return nowMs;
  const interval = Math.min(MAX_LAG_MS, MAX_DRIFT_PX * SOLAR_DAY_MS / worldSize(zoom));
  if (interval < FRAME_MS) return nowMs;
  // An epoch-aligned bucket can precede midnight, especially on a DST day. Never
  // let the new day's drawing sample use the previous day's solar parameters.
  return Math.max(dayStart, Math.floor(nowMs / interval) * interval);
}
