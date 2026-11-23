import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useReadingColumn } from '@/theme/window-layout';
import { PlacePicker } from '@/components/settings/PlacePicker';
import { Icon } from '@/components/ui/Icon';
import type { SwedishPlace } from '@/lib/places/data';
import { space, type } from '@/theme/tokens';
import { useColors } from '@/theme/useColors';

export function PrayerPlaceSearch({ onPick, onClose }: {
  onPick: (place: SwedishPlace) => void;
  onClose: () => void;
}) {
  const column = useReadingColumn();
  const colors = useColors();
  return (
    <Modal
      visible
      testID="prayer-place-search"
      allowSwipeDismissal
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={[styles.sheet, { backgroundColor: colors.paper }]}>
        <View testID="prayer-place-search-content" style={[styles.content, column]} onAccessibilityEscape={onClose}>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={[type.title, styles.title, { color: colors.ink }]}>
              Bönetider på annan plats
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Stäng" onPress={onClose} style={styles.close}>
              <Icon name="close" size={22} color={colors.ink} />
            </Pressable>
          </View>
          <PlacePicker selected={null} onPick={onPick} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1 },
  sheet: { flex: 1, paddingHorizontal: space.lg },
  header: { flexDirection: 'row', alignItems: 'center', marginVertical: space.sm },
  title: { flex: 1 },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
