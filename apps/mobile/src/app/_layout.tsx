import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useEffectEvent } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { IntroProvider } from '@/lib/intro-context';
import { useLocation, LocationProvider } from '@/lib/location/context';
import { subscribeNotificationRouting } from '@/lib/notification-routing';
import { syncPrayerNotifications } from '@/lib/notifications';
import type { LatLng } from '@/lib/prayer-times';
import { notificationSignature, widgetSignature } from '@/lib/settings/compute-signature';
import { SettingsProvider, useSettings } from '@/lib/settings/context';
import type { PrayerSettings } from '@/lib/settings/types';
import { syncPrayerLiveActivity } from '@/widget/live-activity';
import { syncPrayerWidget } from '@/widget/sync';
import { useActiveScheme, useColors } from '@/theme/useColors';

// expo-router renders this as the app-wide crash boundary (it wraps the root
// segment in <Try> when a route exports `ErrorBoundary`). Re-exported from the
// themed screen so the fallback speaks the app's visual language.
export { ErrorScreen as ErrorBoundary } from '@/components/ui/ErrorScreen';

// Status-bar glyphs follow the APP's active scheme, not the OS. Mounted inside
// the SettingsProvider so the user's Utseende override (Inställningar → Visning)
// is honoured: locking the app to "Mörkt" while the phone is in light mode also
// flips the status bar to light glyphs, so they read over the dark basemap. The
// Bönetider screen mounts its own <StatusBar> on top — this is the fallback for
// every other screen.
function AppStatusBar() {
  const scheme = useActiveScheme();
  return <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} animated />;
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
  }, [loaded, key]);
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
              <AppStatusBar />
            </LocationProvider>
          </IntroProvider>
        </SettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
