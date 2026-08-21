// Step 1 — what the app is, in three lines.
//
// The welcome step used to be a title and one paragraph on an otherwise empty screen: the
// three steps after it each carry real controls, so this one alone left half the frame
// blank and the whole introduction read as top-heavy. Filling that space with air is the
// wrong fix and filling it with a bigger logo is the same fix wearing a hat — the space
// wants CONTENT, and the content a welcome screen owes the reader is what they are about
// to get.
//
// Three lines, no descriptions under them. Each row is one claim the rest of the app then
// keeps: the map, the reminders, and the fact that none of it leaves the phone. That last
// one used to sit in the lead paragraph, where it was the first thing a first-time user
// read about an app they had not seen yet; as a row it is a promise among promises, which
// is the right weight for it.
//
// Deliberately NOT a lesson about the map's lines. That step existed here once and was
// moved onto bönetider itself (MapLessonCard) because "kartan" means nothing to someone
// who has not seen one yet — naming the map as a feature is fine, teaching its language
// before it is on screen is not.
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/Icon';
import { type Palette, radius, space, type } from '@/theme/tokens';
import { useColors } from '@/theme/useColors';

const POINTS: readonly { icon: IconName; text: string }[] = [
  { icon: 'map', text: 'Bönetider för hela Sverige, på en karta' },
  { icon: 'notificationsOff', text: 'Påminnelser när du vill ha dem' },
  { icon: 'lock', text: 'Allt räknas ut på din enhet' },
];

export function StepWelcome() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);

  return (
    <View style={styles.card}>
      {/* One accessibility element per row, with the sentence spelled out rather than
          composed from the children: the glyph is decoration, and an icon-font Text node
          left in the tree lands a screen reader on an empty stop (or announces a
          private-use codepoint — the trap OptionGroup documents). */}
      {POINTS.map((point, i) => (
        <View
          key={point.text}
          style={[styles.row, i > 0 && styles.divider]}
          accessible
          accessibilityLabel={point.text}
        >
          <Icon
            name={point.icon}
            size={22}
            color={c.accent}
            style={styles.icon}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text style={styles.text}>{point.text}</Text>
        </View>
      ))}
    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    // A card, not three loose lines. On a screen with this much slack the middle band was
    // the weakest thing on it — bare text floating between a strong header and a strong
    // action row, so the empty space read as emptiness rather than as margin. A block with
    // edges turns the same three sentences into an object the air can sit AROUND, and it
    // speaks the card language the method step and every settings screen already use.
    card: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      overflow: 'hidden',
    },
    // `flex-start` with the icon nudged down, not `center`: a line that wraps to two rows
    // on a narrow screen would otherwise drag its glyph to the middle of the row and break
    // the column the three icons stand in.
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space.md,
      paddingVertical: space.lg,
      paddingHorizontal: space.lg,
    },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.separator },
    icon: { width: 24, textAlign: 'center', marginTop: 1 },
    text: { ...type.body, color: c.ink, flex: 1 },
  });
}
