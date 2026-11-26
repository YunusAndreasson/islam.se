import { usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { STARTUP_STORAGE_TIMEOUT_MS, useIntro } from '@/lib/intro-context';
import { useSettings } from '@/lib/settings/context';

// Pin the native launch surface before Router mounts its first route.
void SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ fade: true, duration: 150 });

export function SplashGate() {
  const { loaded } = useSettings();
  const { status } = useIntro();
  const pathname = usePathname();
  const hidden = useRef(false);

  function hide() {
    if (hidden.current) return;
    hidden.current = true;
    void SplashScreen.hideAsync();
  }

  useEffect(() => {
    const timer = setTimeout(hide, STARTUP_STORAGE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  // The index route is the storage gate. Wait for the destination's first layout;
  // tiles and GPS can arrive after the map's initial frame.
  if (!loaded || status === 'unknown' || pathname === '/') return null;
  return <View testID="splash-layout" style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={hide} />;
}
