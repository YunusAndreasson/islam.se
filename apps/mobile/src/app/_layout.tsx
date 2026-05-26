import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppMenu } from '@/components/nav/AppMenu';
import { LocationProvider } from '@/lib/location/context';
import { SettingsProvider } from '@/lib/settings/context';

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
            <Stack screenOptions={{ headerShown: false }} />
            <AppMenu />
            <StatusBar style="auto" />
          </LocationProvider>
        </SettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
