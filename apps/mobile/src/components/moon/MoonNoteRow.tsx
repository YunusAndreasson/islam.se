// One line of the almanac, wherever it is read.
//
// The same row renders on the screen (where only `tonight` and `alert` reach it) and inside
// the almanac sheet (where the whole list does), so a note cannot look like one thing in the
// readout and another behind the door. Every row leads with a small Moon at the phase the
// line is ABOUT — a column of little moons is what an almanac page looks like — and a row
// that is a DOOR rather than a statement says so with the accent ink and a chevron that the
// statements never carry.
//
// Pressing is decided by the CALLER, not by the note. On the screen the tonight row opens
// the almanac and the drift row opens Inställningar; inside the sheet neither is a door,
// because the sheet is already where the first one led. A row that decided its own
// behaviour would have had to know which surface it was on.
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { almanacTilt, MoonDisc } from '@/components/moon/MoonDisc';
import type { MoonInk } from '@/components/moon/moonInk';
import { Icon } from '@/components/ui/Icon';
import type { MoonNote } from '@/lib/moon/readout';
import { type Palette, space, type } from '@/theme/tokens';

/** The bullet Moon. Small enough to read as a mark beside a sentence rather than as a second
 *  drawing competing with the dial's. */
const BULLET = 16;

export function MoonNoteRow({
  note,
  ink,
  c,
  onPress,
  hint,
  compactText,
}: {
  note: MoonNote;
  ink: MoonInk;
  c: Palette;
  /** Makes the row a door. Without it the row is a statement and nothing happens on touch. */
  onPress?: () => void;
  /** What that door opens, spoken after the row's own words. */
  hint?: string;
  /** Short visual copy for a surfaced alert; the full note remains the spoken label. */
  compactText?: string;
}) {
  const styles = makeStyles(c);
  const mark = <MoonDisc size={BULLET} illumination={note.moon} tilt={almanacTilt(note.waxing)} {...ink} />;
  const displayText = compactText ?? note.text;

  if (!onPress) {
    return (
      <View style={styles.row}>
        {mark}
        <Text style={styles.text}>{displayText}</Text>
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={note.text}
      accessibilityHint={hint}
      style={({ pressed }) => [styles.row, styles.rowTap, pressed && styles.pressed]}
    >
      {mark}
      <Text style={[styles.text, styles.link]}>{displayText}</Text>
      <Icon name="chevronRight" size={14} color={c.accent} />
    </Pressable>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    // minHeight keeps a one-line row and the bullet beside it on the same rhythm as a
    // wrapped two-line one, so a list of them does not breathe unevenly.
    row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 24 },
    // A door has to be reachable by a thumb; a statement only has to be read.
    rowTap: { minHeight: 44 },
    // `inkMuted`, not `inkFaint`. The readout used to carry up to five of these at once and
    // the faint tier was what kept the stack from shouting; with the reference rows moved
    // behind the almanac's door there is at most one or two here, and they can be read
    // without leaning in.
    text: { ...type.caption, color: c.inkMuted, flexShrink: 1 },
    link: { color: c.accent },
    pressed: { opacity: 0.6 },
  });
}
