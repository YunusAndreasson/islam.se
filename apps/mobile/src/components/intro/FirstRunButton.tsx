import { type LayoutChangeEvent, Platform, Pressable, Text } from 'react-native';
import { Icon, type IconName } from '@/components/ui/Icon';
import { radius, space, type } from '@/theme/tokens';
import { useColors } from '@/theme/useColors';

export function FirstRunButton({ label, onPress, filled, disabled, outline, icon, onLayout }: {
  icon?: IconName; onLayout?: (event: LayoutChangeEvent) => void;
  label: string; onPress: () => void; filled?: boolean; disabled?: boolean; outline?: boolean;
}) {
  const c = useColors();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onLayout={onLayout} disabled={disabled} accessibilityState={{ disabled: !!disabled }}
    onPress={onPress} style={({ pressed }) => ({
      flexDirection: 'row', gap: space.xs, minHeight: Platform.OS === 'android' ? 48 : 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: filled || outline ? space.lg : 2,
      borderRadius: radius.round, borderWidth: outline ? 1 : 0, borderColor: c.highlightText,
      backgroundColor: filled ? c.accent : 'transparent', opacity: disabled || pressed ? 0.65 : 1,
    })}>
    {icon && <Icon name={icon} size={15} color={c.accent} />}
    <Text style={[type.bodyStrong, { color: filled ? c.onAccent : outline ? c.ink : c.accent, textAlign: 'center' }]}>{label}</Text>
  </Pressable>;
}
