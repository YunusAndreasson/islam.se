// The app's one small status chip: brass-on-tint (well, accent-on-accentSoft) 11/700 on a
// radius.sm ground. The dock's "Nu" / "I dag" badge and OptionGroup's "Standard" tag are
// both this chip, and used to be two hand-copies of it that had already drifted apart (one
// picked up type.micro's letter-spacing). One definition, so they cannot drift again.
//
// A style factory rather than a component: the dock's badge is a Pressable with an icon
// in it and the settings tag is a plain label, so the two share a look, not a structure.
// Each caller spreads these into its own StyleSheet and adds its layout on top.
import type { TextStyle, ViewStyle } from 'react-native';

import { radius, space } from '@/theme/tokens';

export function chipStyles(colors: { accent: string; accentSoft: string }) {
  return {
    box: {
      borderRadius: radius.sm,
      paddingHorizontal: space.sm,
      paddingVertical: 3,
      backgroundColor: colors.accentSoft,
    } satisfies ViewStyle,
    // 11/700: a deliberate compact chip label, below the type scale on purpose.
    text: { fontSize: 11, fontWeight: '700', color: colors.accent } satisfies TextStyle,
  };
}
