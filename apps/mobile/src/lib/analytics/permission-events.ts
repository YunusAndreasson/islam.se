// Permission Prompt Shown / Permission Result, in one place so every surface that asks the
// OS for something reports it the same way.
//
// `primed` is a property of the surface, not of the moment: the introduction's steps and
// the map's soft-ask cards put a sentence in front of the OS dialog, the Inställningar rows
// and Qibla (which asks the moment it opens, with no soft ask) do not.
import { ANALYTICS_EVENTS, analytics, type PermissionKind, type PermissionSource } from './index';

const PRIMED: Record<PermissionSource, boolean> = {
  intro: true,
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
