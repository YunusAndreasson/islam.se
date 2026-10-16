import * as Sentry from '@sentry/react-native';
import { NavigationBar } from 'expo-navigation-bar';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useEffectEvent } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorScreen } from '@/components/ui/ErrorScreen';
import { useDisplayZone } from '@/lib/device-zone';
import { IntroProvider } from '@/lib/intro-context';
import { useLocation, LocationProvider } from '@/lib/location/context';
import { subscribeNotificationRouting } from '@/lib/notification-routing';
import { registerNotificationRefresh } from '@/lib/notification-refresh';
import { syncPrayerNotifications } from '@/lib/notifications';
import type { LatLng } from '@/lib/prayer-times';
import { notificationSignature, widgetSignature } from '@/lib/settings/compute-signature';
import { SettingsProvider, useSettings } from '@/lib/settings/context';
import type { PrayerSettings } from '@/lib/settings/types';
// Imported for its module-scope side effect as well as the component: the splash must be
// pinned before the first render, so this import has to land before RootLayout runs. See
// @/lib/splash for what the gate waits for and, more importantly, what it refuses to.
import { SplashGate } from '@/lib/splash';
import { syncPrayerLiveActivity } from '@/widget/live-activity';
import { reloadPrayerWidget, syncPrayerWidget } from '@/widget/sync';
import { useActiveScheme, useColors } from '@/theme/useColors';

// expo-router renders this as the app-wide crash boundary (it wraps the root
// segment in <Try> when a route exports `ErrorBoundary`), with the themed screen as
// the fallback so it speaks the app's visual language.
//
// ⚠️ AN ERROR A BOUNDARY CATCHES NEVER REACHES SENTRY ON ITS OWN — catching it is the
// boundary's whole job, so the global handler never sees it. Sentry's wrapper reports it,
// once per error object. Route params and the concrete path ride along only with
// sendDefaultPii, which @/lib/sentry keeps off: a route here can carry coordinates.
export const ErrorBoundary = Sentry.wrapExpoRouterErrorBoundary(ErrorScreen);

// Both system bars, and the window behind them, follow the APP's active scheme rather than
// the OS's. Mounted inside the SettingsProvider so the user's Utseende override
// (Inställningar → Visning) is honoured: locking the app to "Mörkt" while the phone is in
// light mode also flips the status bar to light glyphs, so they read over the dark basemap.
// The Bönetider screen mounts its own <StatusBar> on top — this is the fallback for every
// other screen.
//
// ⚠️ THE NAVIGATION BAR WAS THE HALF THAT WAS MISSING. Android is edge-to-edge (see
// android/app/src/main/res/values/styles.xml, which makes both bars transparent), so the
// map is drawn UNDER the gesture bar and the three-button row. Their tint was left to the
// OS, which knows only the phone's theme — so the exact case the status bar was already
// handling, an app locked to a scheme the phone is not in, left dark buttons sitting on the
// dark basemap.
//
// ⚠️ `style` NAMES THE CONTENT, NOT THE BAR — the same convention as <StatusBar> one line
// below, and the opposite of what the prop name suggests. NavigationBarModule.kt is explicit
// about it: `val hasLightBackground = style == "dark" // dark content -> light background`.
// So the two lines below are deliberately the SAME expression; passing `scheme` straight
// through reads correct and inverts the thing this whole block exists to fix — dark glyphs
// on the dark basemap, which is exactly the state the app is locked into on a light phone.
//
// This cannot be checked on the Android 15 emulator: expo-navigation-bar's own docs note the
// call has no effect there, so the emulator shows Android's default and an inverted value
// looks perfectly fine. It needs a physical device.
//
// The declarative form is used rather than the imperative setter because it is a no-op
// component on iOS, so there is no platform branch to keep in step. It needs the plugin's
// `enforceContrast: false` (app.json) to have any effect — with contrast enforcement on,
// Android paints its own scrim behind the buttons and ignores the style.
function AppSystemBars() {
  const scheme = useActiveScheme();
  const c = useColors();

  // The window's own ground, below every React view, kept on the app's active palette so a
  // screen transition never reveals the OS default (white on Android) behind an incoming
  // page — and so it follows the reader's Utseende override rather than the phone's theme.
  //
  // ⚠️ THIS CANNOT COVER THE COLD-LAUNCH FRAME, whatever it looks like. An effect runs after
  // the first commit, so the window background is still the OS default for exactly the
  // frames before React paints. Nothing here can fix that — the mechanism for the launch
  // frame is the native splash, which app.json already themes on both schemes, and which
  // lib/splash holds up until the real screen is ready to draw. If a launch flash ever does
  // appear, it is a splash problem, not this one.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(c.paper).catch(() => undefined);
  }, [c.paper]);

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} animated />
      <NavigationBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </>
  );
}

/**
 * The shape both background syncs below share: run once settings have hydrated, then
 * again on every return to the foreground — the notification window and the widget
 * timeline are both rolling and need re-seeding, and iOS only lets the app start a Live
 * Activity while foregrounded.
 *
 * `sync` is invoked through a React 19.2 Effect Event, so this re-registers only when
 * `key` changes. `key` is a SIGNATURE of the inputs this particular consumer cares about,
 * so a cosmetic settings change can't trigger a cancel-and-reschedule of 180 notifications,
 * while the Effect Event always sees the latest committed settings and callback.
 */
function useForegroundSync(key: string, sync: (settings: PrayerSettings) => void): void {
  const { settings, loaded } = useSettings();
  // Folded in for every consumer rather than left to each caller: both the notification
  // window and the widget timeline are cut into DAYS, and which instants those days start
  // at is the zone's answer. A reader who lands in another country has a stale schedule
  // for the same reason a reader who changes calculation method does.
  const zone = useDisplayZone();
  const runSync = useEffectEvent(() => {
    sync(settings);
  });

  useEffect(() => {
    if (!loaded) return;
    runSync();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') runSync();
    });
    return () => sub.remove();
    // `key` is not read in the body — it IS the dependency, standing in for the
    // settings and coordinates the caller folded into it. Effect Events are deliberately
    // non-reactive and must not be listed as dependencies.
  }, [loaded, key, zone]);
}

/** A coordinate as a signature fragment. Full precision: any real move should re-sync,
 *  and the sync's own stamp (see syncPrayerNotifications) does the coarse debouncing. */
const coordKey = (c: LatLng): string => `${c.latitude},${c.longitude}`;

// Keeps the scheduled prayer notifications in step with the user's settings and
// location, and refreshes them whenever the app returns to the foreground (so the
// rolling multi-day window keeps advancing). Renders nothing — it just reacts.
function NotificationSync() {
  const { coords } = useLocation();
  const { settings } = useSettings();
  useForegroundSync(`${notificationSignature(settings)}|${coordKey(coords)}`, (s) => {
    void syncPrayerNotifications(coords, s);
  });
  // And once, the standing request for the OS to do the same while the app is closed —
  // without which the rolling window stops advancing for anyone who does not open the app
  // (see @/lib/notification-refresh). Registration is idempotent and unconditional: the
  // task itself checks whether reminders are on, so switching them on later needs no
  // second registration, and switching them off leaves a task that correctly does nothing.
  useEffect(() => {
    void registerNotificationRefresh();
  }, []);
  return null;
}

// Sends a tapped prayer alert to Bönetider rather than to whichever sheet happened to be
// open (see @/lib/notification-routing). Mounted at the root, outside the syncs, because
// it is about arrival, not data. Renders nothing.
function NotificationRouting() {
  useEffect(() => subscribeNotificationRouting(), []);
  return null;
}

// Keeps the iOS home-screen widget's prayer timeline in step with the user's settings
// and location, refreshing on every foreground (WidgetKit advances the pushed entries
// itself, but the ~36 h window needs re-seeding so it never runs dry). Also reconciles
// the prayer-countdown Live Activity — iOS only lets the app start one while
// foregrounded, so this is exactly the right hook. iOS-only and best-effort — a no-op
// on Android (see syncPrayerWidget / syncPrayerLiveActivity). Renders nothing.
function WidgetSync() {
  const { coords, label } = useLocation();
  const { settings } = useSettings();
  useForegroundSync(`${widgetSignature(settings)}|${coordKey(coords)}|${label}`, (s) => {
    void syncPrayerWidget(coords, s, label);
    void syncPrayerLiveActivity(coords, s, label);
  });
  // Android's widget is a static render between refreshes (see widget/android-snapshot).
  // Leaving the app is the moment the reader is most likely to look at it, so re-render it
  // then from the snapshot it already holds. A no-op on iOS.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') void reloadPrayerWidget();
    });
    return () => sub.remove();
  }, []);
  return null;
}

// Root layout: a header-less stack, hub-and-spoke. Bönetider (the map) is home; its two
// floating controls open Qibla and the Settings sheet (which in turn pushes Om) as
// MODALS over the map, so dismissing any of them returns to the map. Navigation lives on
// the map itself now (components/nav/MapNav) — there is no global menu overlay.
// GestureHandlerRootView is required at the very top for the dock's gestures (expo-router
// does not provide one). SettingsProvider hydrates persisted prayer settings;
// LocationProvider (nested, since it reads settings) resolves the coordinate to compute for.
export default function RootLayout() {
  // Apple Maps-style ONE OS theme axis: the Stack's anti-flash ground, the map
  // basemap, the dock and the screens all flip with light/dark. The map screen
  // fills the viewport, so the contentStyle ground only shows during transitions
  // into the (also-themed) Settings / Qibla sheets.
  const c = useColors();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SettingsProvider>
          <IntroProvider>
            {/* Outside LocationProvider on purpose — the splash waits for the two storage
                reads that decide WHICH screen this launch is, never for a location fix or
                for basemap tiles. See @/lib/splash. */}
            <SplashGate />
            <LocationProvider>
              {/* Opaque paper ground so screen-to-screen transitions never flash the
                  map through an incoming page. Qibla and the Settings group present as
                  sheets over the map; everything else keeps the default card transition. */}
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.paper } }}>
                {/* Home. Reached two ways — index.tsx's cold-launch redirect, and
                    valkommen's router.replace() on finish — and both are "the app
                    appearing", not one screen sliding over another, so no animation:
                    the default native-stack push (slide in from the right on iOS) read
                    as the app visibly opening a second screen on its own first frame. */}
                <Stack.Screen name="bonetider" options={{ animation: 'none' }} />
                <Stack.Screen name="qibla" options={{ presentation: 'modal' }} />
                {/* The map's other instrument. Same presentation as Qibla, from the disc
                    directly under it — the two are a pair and must behave as one. */}
                <Stack.Screen name="manen" options={{ presentation: 'modal' }} />
                <Stack.Screen name="(settings)" options={{ presentation: 'modal', headerShown: false }} />
                {/* Opened from the mosque detail card on the map, so it presents as a sheet
                    over it and dismissing returns to the map — same as Qibla and Settings. */}
                <Stack.Screen name="moske-rattelse" options={{ presentation: 'modal' }} />
                {/* The introduction covers the app rather than sitting beside it: it runs
                    before the map has ever been seen, so a card transition revealing the
                    map underneath would give away the thing it is about to explain. No
                    swipe-back either — "Hoppa över" is the way out, and a half-dismissed
                    wizard behind the map is a state nothing else in the app can recover. */}
                <Stack.Screen
                  name="valkommen"
                  options={{
                    presentation: 'fullScreenModal',
                    gestureEnabled: false,
                    animation: 'fade',
                  }}
                />
              </Stack>
              <NotificationSync />
              <NotificationRouting />
              <WidgetSync />
              <AppSystemBars />
            </LocationProvider>
          </IntroProvider>
        </SettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
