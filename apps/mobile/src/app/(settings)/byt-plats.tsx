// "Välj stad" — the manual-location route. Pushed inside the Settings sheet; the back
// arrow returns. Tapping a place writes settings.manualLocation, flips
// settings.locationMode to 'manual' (so the user doesn't have to flip it separately on
// the previous screen), and goes back.
//
// The list, search and sorting live in components/settings/PlacePicker — the
// introduction offers the same picker inline on its location step, and one copy of the
// 2,100-place list behaviour is the point. This route is the wiring: chrome, the write,
// and the pop.
import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlacePicker } from '@/components/settings/PlacePicker';
import { useSettingsColors, type SettingsColors } from '@/components/settings/theme';
import { ModalBar } from '@/components/ui/ModalBar';
import type { SwedishPlace } from '@/lib/places/data';
import { useSettings } from '@/lib/settings/context';
import { space, type } from '@/theme/tokens';

export default function BytPlats() {
  const { settings, update } = useSettings();
  const colors = useSettingsColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const handlePick = (p: SwedishPlace): void => {
    update({
      locationMode: 'manual',
      manualLocation: { name: p.name, latitude: p.lat, longitude: p.lon },
    });
    if (router.canGoBack()) router.back();
    else router.replace('/(settings)/installningar');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ModalBar variant="back" fallback="/(settings)/installningar" />
      <View style={styles.content}>
        <Text style={styles.header}>Välj stad</Text>
        <PlacePicker selected={settings.manualLocation} onPick={handlePick} />
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
