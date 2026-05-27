import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useLocation, LocationProvider } from '@/lib/location/context';
import { syncPrayerNotifications } from '@/lib/notifications';
import { SettingsProvider, useSettings } from '@/lib/settings/context';
import { NightProvider } from '@/lib/solar/nightContext';
import { useColors } from '@/theme/useColors';

// expo-router renders this as the app-wide crash boundary (it wraps the root
// segment in <Try> when a route exports `ErrorBoundary`). Re-exported from the
// themed screen so the fallback speaks the app's visual language.
export { ErrorScreen as ErrorBoundary } from '@/components/ui/ErrorScreen';

// Keeps the scheduled prayer notifications in step with the user's settings and
// location, and refreshes them whenever the app returns to the foreground (so the
// rolling multi-day window keeps advancing). Renders nothing — it just reacts.
function NotificationSync() {
  const { coords } = useLocation();
  const { settings, loaded } = useSettings();

  useEffect(() => {
    if (!loaded) return;
    void syncPrayerNotifications(coords, settings);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncPrayerNotifications(coords, settings);
    });
    return () => sub.remove();
  }, [loaded, coords, settings]);

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
  // Follows the OS appearance setting (theme/useColors): the Stack's anti-flash
  // ground and the status bar both flip with light/dark. The map screen ignores this
  // (it darkens by the sun), but its map fills the screen, so the ground only shows
  // during transitions into the warm light/dark non-map screens.
  const c = useColors();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SettingsProvider>
          <LocationProvider>
            <NightProvider>
              {/* Opaque paper ground so screen-to-screen transitions never flash the
                  map through an incoming page. Qibla and the Settings group present as
                  sheets over the map; everything else keeps the default card transition. */}
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.paper } }}>
                <Stack.Screen name="qibla" options={{ presentation: 'modal' }} />
                <Stack.Screen name="(settings)" options={{ presentation: 'modal', headerShown: false }} />
              </Stack>
              <NotificationSync />
              <StatusBar style="auto" />
            </NightProvider>
          </LocationProvider>
        </SettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
