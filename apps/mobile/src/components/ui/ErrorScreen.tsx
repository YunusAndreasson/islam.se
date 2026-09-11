import * as Sentry from '@sentry/react-native';
import type { ErrorBoundaryProps } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type Palette, radius, shadow, space, type } from '@/theme/tokens';
import { useColors } from '@/theme/useColors';

// App-wide crash safety net. expo-router wraps the root segment in its <Try>
// boundary whenever a route module exports `ErrorBoundary` — so a thrown render
// error (a null deref, a bad map style, an exception in the solar math) lands
// here as a calm, recoverable screen instead of a white-screen crash. `retry`
// clears the boundary's error state and re-renders the route.
//
// Styled to match the app's Nordic paper/indigo language (see theme/tokens). The
// raw error text is shown only in development; users get a plain Swedish message.
export function ErrorScreen({ error, retry }: ErrorBoundaryProps) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);

  // ⚠️ AN ERROR THIS BOUNDARY CATCHES NEVER REACHES SENTRY ON ITS OWN. Catching it is the
  // boundary's whole job, so Sentry's global handler never sees it — every render crash
  // would show the reader this screen and leave the Sentry project silent. It is reported
  // here by hand, once per error object. What a report may carry is decided in @/lib/sentry.
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <SafeAreaView style={styles.fill}>
      <View style={styles.center}>
        <Text style={styles.title}>Något gick fel</Text>
        <Text style={styles.body}>
          Appen stötte på ett oväntat fel. Försök igen – dina inställningar är kvar.
        </Text>

        {__DEV__ ? <Text style={styles.detail}>{error.message}</Text> : null}

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void retry();
          }}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonLabel}>Försök igen</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    fill: { flex: 1, backgroundColor: c.paper },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: space.xxxl,
      gap: space.md,
    },
    title: { ...type.title, color: c.ink, textAlign: 'center' },
    body: { ...type.body, color: c.inkMuted, textAlign: 'center' },
    detail: {
      ...type.caption,
      color: c.inkFaint,
      textAlign: 'center',
      marginTop: space.xs,
    },
    button: {
      marginTop: space.lg,
      paddingHorizontal: space.xxl,
      paddingVertical: space.md,
      borderRadius: radius.round,
      backgroundColor: c.accent,
      ...shadow.button,
    },
    buttonPressed: { backgroundColor: c.accentDeep },
    // onAccent, not white — legible on the light periwinkle accent in dark mode.
    buttonLabel: { ...type.bodyStrong, color: c.onAccent },
  });
}
