import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppMenu } from '@/components/nav/AppMenu';
import { useLocation, LocationProvider } from '@/lib/location/context';
import { syncPrayerNotifications } from '@/lib/notifications';
import { SettingsProvider, useSettings } from '@/lib/settings/context';
import { NightProvider } from '@/lib/solar/nightContext';
import { palette } from '@/theme/tokens';

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

// Root layout: a header-less, tab-less stack. The three screens (bonetider,
// installningar, om) live under it directly — navigation is the floating glass
// <AppMenu>, mounted once here as a sibling of the Stack so it overlays every
// screen. GestureHandlerRootView is required at the very top for the dock's and
// menu's gestures (expo-router does not provide one). SettingsProvider hydrates
// persisted prayer settings; LocationProvider (nested, since it reads settings)
// resolves the coordinate to compute for.
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SettingsProvider>
          <LocationProvider>
            <NightProvider>
              {/* Opaque paper ground so screen-to-screen transitions never flash the
                  map through an incoming page. */}
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.paper } }} />
              <AppMenu />
              <NotificationSync />
              <StatusBar style="auto" />
            </NightProvider>
          </LocationProvider>
        </SettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
