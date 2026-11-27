import { Image, Text, View } from 'react-native';
import { space, type } from '@/theme/tokens';
import { useColors } from '@/theme/useColors';

export function FirstMapTitle({ top, onBottom }: { top: number; onBottom: (bottom: number) => void }) {
  const c = useColors();
  return <View pointerEvents="none" onLayout={({ nativeEvent: { layout } }) => onBottom(layout.y + layout.height)}
    // `space.xl` is the opening sheet's own gutter, so the title and the reading under it
    // share one left edge (it sat 2 dp to the right of it).
    style={{ position: 'absolute', left: space.xl, top, maxWidth: '65%' }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <Image source={require('../../../assets/images/icon.png')} style={{ width: 18, height: 18, borderRadius: 5 }} />
      <Text style={[type.footnote, { color: c.ink, fontWeight: '600' }]}>islam.se</Text>
    </View>
    {/* Literata is embedded at build time (the expo-font plugin in app.json), so it is
        there on the first frame. Loaded at runtime it arrived a beat late, and the first
        words a new reader sees were set in the platform serif and then re-set. */}
    <Text accessibilityRole="header" style={{ color: c.ink, fontFamily: 'Literata',
      fontSize: 32, lineHeight: 38, marginTop: space.md }}>{'Bönetider\ni Sverige'}</Text>
  </View>;
}
