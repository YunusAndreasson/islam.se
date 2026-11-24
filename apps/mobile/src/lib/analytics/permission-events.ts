// Permission Prompt Shown / Permission Result, in one place so every surface that asks the
// OS for something reports it the same way.
//
// `primed` is a property of the surface, not of the moment: the introduction's steps and
// the map cards provide a separate explanatory step. Settings and the compass
// request access directly from the reader’s chosen control.
import { ANALYTICS_EVENTS, analytics, type PermissionKind, type PermissionSource } from './index';

const PRIMED: Record<PermissionSource, boolean> = {
  intro: true,
  first_reading: true,
  settings_recovery: true,
  map_card: true,
  settings: false,
  qibla: false,
};

/** The OS dialog is about to appear. Call it only when it will. */
export function trackPermissionPrompt(permission: PermissionKind, source: PermissionSource): void {
  void analytics.track(ANALYTICS_EVENTS.PERMISSION_PROMPT_SHOWN, {
    permission,
    primed: PRIMED[source],
    source,
  });
}

/** The answer to an ask, whether or not a dialog appeared (`prompted`). */
export function trackPermissionResult(
  permission: PermissionKind,
  source: PermissionSource,
  granted: boolean,
  prompted: boolean,
): void {
  void analytics.track(ANALYTICS_EVENTS.PERMISSION_RESULT, {
    permission,
    granted,
    primed: PRIMED[source],
    prompted,
    source,
  });
}
