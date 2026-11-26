import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Keyboard, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
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
  const [visible, setVisible] = useState(true);
  const pending = useRef<SwedishPlace | null>(null);
  const opening = useRef(true);
  const closeAfterKeyboard = useRef<(() => void) | null>(null);

  function deliver() {
    const place = pending.current;
    if (!place) return;
    pending.current = null;
    onPick(place);
  }

  const deliverOnAndroid = useEffectEvent(deliver);
  useEffect(() => {
    if (visible || Platform.OS === 'ios') return;
    // Android's Modal has no onDismiss. Its non-animated Dialog is removed
    // in this commit, so let the native window present the map before moving it.
    let nextFrame: number;
    const frame = requestAnimationFrame(() => {
      nextFrame = requestAnimationFrame(deliverOnAndroid);
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(nextFrame);
    };
  }, [visible]);

  useEffect(() => () => closeAfterKeyboard.current?.(), []);

  function pick(place: SwedishPlace) {
    if (!opening.current) return;
    opening.current = false;
    pending.current = place;
    if (!Keyboard.isVisible()) {
      setVisible(false);
      return;
    }
    const hide = () => {
      closeAfterKeyboard.current?.();
      setVisible(false);
    };
    const listener = Keyboard.addListener('keyboardDidHide', hide);
    // Some keyboards omit the event when their window loses focus.
    const timer = setTimeout(hide, 450);
    closeAfterKeyboard.current = () => {
      listener.remove();
      clearTimeout(timer);
      closeAfterKeyboard.current = null;
    };
    Keyboard.dismiss();
  }

  return (
    <Modal
      visible={visible}
      animationType="none"
      testID="prayer-place-search"
      allowSwipeDismissal
      onRequestClose={onClose}
      onDismiss={deliver}
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
          <PlacePicker selected={null} onPick={pick} />
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
