// Handles a development session can call on the running map — from Metro's runtime
// (`npx @expo/agent-cli runtime:eval "__islamMap.jumpTo(17, 62, 4)"`) or a debugger — to put
// the screen into a repeatable state for profiling, screenshot diffs and recordings.
//
// Registered only when `__DEV__`: a release bundle never sets the global, and the
// minifier drops the registration with the dead branch.
import type { Camera } from './projection';

export interface MapDevHooks {
  /** View the Stockholm day containing `ms`. A second call to `showInstant` then lands on it. */
  goToDay: (ms: number) => void;
  /** Preview an exact instant (ms epoch) within the viewed day; enters scrub mode. */
  showInstant: (ms: number) => void;
  /** Preview a fraction (0–1) of the viewed day, as the scrubber would. */
  setFraction: (fraction: number) => void;
  /** Back to the live clock. */
  live: () => void;
  /** Move the camera at once, with this viewport centre and zoom. */
  jumpTo: (lon: number, lat: number, zoom: number) => void;
  /** The overlays' camera mirror as it stands. */
  camera: () => Camera;
}

declare global {
  var __islamMap: MapDevHooks | undefined;
}

/** Publishes `hooks` as `globalThis.__islamMap` in development; returns the unregister. */
export function exposeMapDevHooks(hooks: MapDevHooks): () => void {
  if (!__DEV__) return () => undefined;
  globalThis.__islamMap = hooks;
  return () => {
    if (globalThis.__islamMap === hooks) globalThis.__islamMap = undefined;
  };
}
