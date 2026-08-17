// The native splash screen's lifetime.
//
// expo-splash-screen is configured in app.json but was never touched from JS, and its
// default is to hide "once the ReactNative-controlled view hierarchy is mounted… when your
// app first `render`s view component" (its own README). So the splash went away on the very
// first frame — which is app/index.tsx returning `null` while it waits to learn whether this
// launch belongs to the introduction or to the map. The user watched an empty screen while
// the app worked out where it was going, and a user with a locked Utseende override watched
// it in the OS's palette before it flipped to theirs.
//
// Now that decision happens BEHIND the splash: the gate below holds it until the two
// AsyncStorage reads that pick the screen have landed, so the first thing ever drawn is the
// real one. The handoff is seamless because app.json's splash backgrounds ARE the palette's
// `paper` on both themes (#f6f3ed / #161a26) — see theme/tokens.
//
// ── What this deliberately does NOT wait for ──────────────────────────────────────────
//
//   • The basemap. Its style is fetched over the network at runtime and can simply fail —
//     offline, captive portal, provider outage, expired key. That is why bonetider carries a
//     styleFailed notice at all, and why its own overlay is explicitly NOT gated on tiles:
//     a degraded map is still a working screen. A splash that waited for tiles would turn
//     that into a hung app.
//   • The location fix. Same reasoning, and it can involve both the OS and the user. This
//     gate is mounted OUTSIDE LocationProvider so that cannot quietly change.
//   • The solar grid (3752 adhan computations, 200–600 ms of blocked JS — see
//     lib/solar/grid-cache). Covering it would mean holding the splash until after the map
//     screen's first commit, a deeper change to a hot path; that stall stays visible as a
//     frozen first frame for now.
//
// Only local, bounded work belongs in front of this gate.
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useRef } from 'react';

import { useIntro } from '@/lib/intro-context';
import { useSettings } from '@/lib/settings/context';
import { motion } from '@/theme/tokens';

// Module scope, not an effect: the README is explicit that calling this from inside a
// component or hook "might be called too late, when the splash screen is already hidden".
// Fire-and-forget — the promise rejects only when the splash is already gone, which is
// precisely the case where there is nothing left to prevent.
void SplashScreen.preventAutoHideAsync().catch(() => {});
// `fade` is documented iOS-only; Android hides in one step either way.
SplashScreen.setOptions({ fade: true, duration: motion.base });

/**
 * The safety net, and the one thing here that must never be dropped. Both loaders resolve
 * on failure by design — loadSettings catches, and loadIntroStatus documents that it never
 * throws — but a native module whose promise never settles AT ALL is not something a catch
 * can see, and being stranded on a splash forever is the only failure on this path with no
 * way out. On timeout the app falls back to exactly the old behaviour (a blank frame for a
 * moment): worse than the gate, far better than a hang.
 */
const SPLASH_TIMEOUT_MS = 2000;

/** Renders nothing — it only decides when the splash may go. Mount inside SettingsProvider
 *  and IntroProvider, and outside LocationProvider (see the header). */
export function SplashGate() {
  const { loaded } = useSettings();
  const { status } = useIntro();
  const ready = loaded && status !== 'unknown';
  // Hiding twice is harmless, but the guard is what stops the timeout firing a second call
  // after a normal hide — and it makes "once" the readable contract.
  const hidden = useRef(false);

  const hide = useCallback(() => {
    if (hidden.current) return;
    hidden.current = true;
    SplashScreen.hide();
  }, []);

  useEffect(() => {
    if (ready) hide();
  }, [ready, hide]);

  useEffect(() => {
    const timer = setTimeout(hide, SPLASH_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [hide]);

  return null;
}
