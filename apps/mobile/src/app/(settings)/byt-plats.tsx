// "Välj stad" — the manual-location route. Pushed inside the Settings sheet; the back
// arrow returns. Tapping a place writes settings.manualLocation, flips
// settings.locationMode to 'manual' (so the user doesn't have to flip it separately on
// the previous screen), and goes back.
//
// The list, search and sorting live in components/settings/PlacePicker — the
// introduction offers the same picker inline on its location step, and one copy of the
// 2,100-place list behaviour is the point. This route is the wiring: chrome, the write,
// and the pop.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlacePicker } from '@/components/settings/PlacePicker';
import { useSettingsColors, type SettingsColors } from '@/components/settings/theme';
import { ModalBar } from '@/components/ui/ModalBar';
import { ANALYTICS_EVENTS, analytics, type LocationContext } from '@/lib/analytics';
import { namedPlace, nearestPlace } from '@/lib/places/nearest';
import type { SwedishPlace } from '@/lib/places/data';
import { useSettings } from '@/lib/settings/context';
import { DEFAULT_COORDS } from '@/lib/settings/types';
import { space, type } from '@/theme/tokens';

// Manual mode has an honest fallback: Stockholm is already the coordinate used for
// prayer times when no city has been persisted yet. Pass its canonical dataset point to
// the picker as the effective selection so the screen does not claim that nothing is
// selected while the rest of the app is visibly using Stockholm. The introduction still
// passes `null` directly and therefore keeps its genuine first-choice state.
const defaultPlace = nearestPlace(DEFAULT_COORDS.latitude, DEFAULT_COORDS.longitude).place;
const DEFAULT_PICKER_LOCATION = {
  name: defaultPlace.name,
  latitude: defaultPlace.lat,
  longitude: defaultPlace.lon,
};

/** Which surface sent the reader here, for Location Set: the map's location card and the
 *  dock's "Välj plats" say so in `?from=`, Inställningar is the default. */
function contextFrom(from: string | undefined): LocationContext {
  return from === 'map_card' || from === 'dock' ? from : 'settings';
}

export default function BytPlats() {
  const router = useRouter();
  const { settings, update } = useSettings();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const colors = useSettingsColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const picked = useRef(false);
  const selected =
    settings.manualLocation ??
    (settings.locationMode === 'manual' ? DEFAULT_PICKER_LOCATION : null);

  const handlePick = (p: SwedishPlace): void => {
    if (picked.current) return;
    picked.current = true;
    update({
      locationMode: 'manual',
      manualLocation: namedPlace(p),
    });
    // How, and from where. Never which place.
    void analytics.track(ANALYTICS_EVENTS.LOCATION_SET, { source: 'manual', context: contextFrom(from) });
    router.dismissTo(contextFrom(from) === 'settings' ? '/(settings)/installningar' : '/bonetider');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ModalBar variant="back" fallback="/(settings)/installningar" />
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.header}>Välj stad</Text>
        <PlacePicker selected={selected} onPick={handlePick} />
      </View>
    </SafeAreaView>
  );
}

function makeStyles(colors: SettingsColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    content: { flex: 1, paddingHorizontal: space.lg },
    header: { ...type.title, color: colors.text, marginBottom: space.md, marginTop: space.xs },
  });
}
