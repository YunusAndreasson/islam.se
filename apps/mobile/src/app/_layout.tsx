import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useLocation, LocationProvider } from '@/lib/location/context';
import { syncPrayerNotifications } from '@/lib/notifications';
import { notificationSignature, widgetSignature } from '@/lib/settings/compute-signature';
import { SettingsProvider, useSettings } from '@/lib/settings/context';
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

// Keeps the scheduled prayer notifications in step with the user's settings and
// location, and refreshes them whenever the app returns to the foreground (so the
// rolling multi-day window keeps advancing). Renders nothing — it just reacts.
function NotificationSync() {
  const { coords } = useLocation();
  const { settings, loaded } = useSettings();
  const latestSettings = useRef(settings);
  const signature = notificationSignature(settings);

  useEffect(() => {
    latestSettings.current = settings;
  }, [settings]);

  useEffect(() => {
    if (!loaded) return;
    void syncPrayerNotifications(coords, latestSettings.current);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncPrayerNotifications(coords, latestSettings.current);
    });
    return () => sub.remove();
  }, [loaded, coords, signature]);

  return null;
}

// Keeps the iOS home-screen widget's prayer timeline in step with the user's settings
// and location, refreshing on every foreground (WidgetKit advances the pushed entries
// itself, but the ~36 h window needs re-seeding so it never runs dry). iOS-only and
// best-effort — a no-op on Android (see syncPrayerWidget). Renders nothing.
function WidgetSync() {
  const { coords, label } = useLocation();
  const { settings, loaded } = useSettings();
  const latestSettings = useRef(settings);
  const signature = widgetSignature(settings);

  useEffect(() => {
    latestSettings.current = settings;
  }, [settings]);

  useEffect(() => {
    if (!loaded) return;
    void syncPrayerWidget(coords, latestSettings.current, label);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncPrayerWidget(coords, latestSettings.current, label);
    });
    return () => sub.remove();
  }, [loaded, coords, signature, label]);

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
          <LocationProvider>
            {/* Opaque paper ground so screen-to-screen transitions never flash the
                map through an incoming page. Qibla and the Settings group present as
                sheets over the map; everything else keeps the default card transition. */}
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.paper } }}>
              <Stack.Screen name="qibla" options={{ presentation: 'modal' }} />
              <Stack.Screen name="(settings)" options={{ presentation: 'modal', headerShown: false }} />
            </Stack>
            <NotificationSync />
            <WidgetSync />
            <AppStatusBar />
          </LocationProvider>
        </SettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
