import { useFonts } from 'expo-font';
import { Image, Text, View } from 'react-native';
import { useColors } from '@/theme/useColors';

export function FirstMapTitle({ top, onBottom }: { top: number; onBottom: (bottom: number) => void }) {
  const c = useColors();
  const [loaded] = useFonts({ Literata: require('../../../assets/first-run/Literata-Regular.ttf') });
  return <View pointerEvents="none" onLayout={({ nativeEvent: { layout } }) => onBottom(layout.y + layout.height)}
    style={{ position: 'absolute', left: 22, top, maxWidth: '65%' }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Image source={require('../../../assets/images/icon.png')} style={{ width: 18, height: 18, borderRadius: 5 }} />
      <Text style={{ color: c.ink, fontWeight: '600' }}>islam.se</Text>
    </View>
    <Text accessibilityRole="header" style={{ color: c.ink, fontFamily: loaded ? 'Literata' : 'serif',
      fontSize: 32, lineHeight: 38, marginTop: 12 }}>{'Bönetider\ni Sverige'}</Text>
  </View>;
}
