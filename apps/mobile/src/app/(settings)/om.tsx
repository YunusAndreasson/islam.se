// Om appen — what this is, who built it, what data it uses, how to support it.
// Structured as four distinct blocks to match the rest of the settings page's
// visual language:
//   1. Title + one calm intro line  (what it IS)
//   2. INTEGRITET card               (the privacy promise, the headline answer)
//   3. BYGGER PÅ card                (open-source credits as tappable rows —
//      transparent about what we use, attribution where it belongs)
//   4. Quiet Betygsätt-appen + imprint colophon
//
// Earlier this page was a stack of mixed registers — display-size wordmark,
// long marketing prose, centered dense credits paragraph — that didn't read
// as anything specific. Now each block has one job, one weight, one shape.
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SettingSection } from '../../components/settings/SettingSection';
import { ModalBar } from '../../components/ui/ModalBar';
import {
  ADHAN_URL,
  APP_VERSION,
  MAPLIBRE_URL,
  openUrl,
  OSM_URL,
  rateApp,
} from '../../lib/about';
import { type Palette, space, type } from '../../theme/tokens';
import { useColors } from '../../theme/useColors';

const SOURCES = [
  { label: 'Bönetider', name: 'adhan', url: ADHAN_URL },
  { label: 'Karta', name: 'MapLibre', url: MAPLIBRE_URL },
  { label: 'Kartdata', name: 'OpenStreetMap', url: OSM_URL },
] as const;

export default function Om() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Pushed in from Settings — back returns to the Settings sheet. */}
      <ModalBar variant="back" fallback="/installningar" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.header}>Om appen</Text>

        {/* One calm line — "what is this?" answered before the user scrolls.
            Body weight + muted ink: present but not screaming. */}
        <Text style={styles.lead}>
          En karta över Sveriges bönetider, ritad med solens vandring över landet.
        </Text>

        <SettingSection title="Integritet">
          {/* Shield + paragraph reads as one block: the icon is a small leading
              visual mark that gives the privacy promise the weight it deserves,
              without making the card feel like an iOS-Settings cell. */}
          <View style={styles.integrityRow}>
            <MaterialCommunityIcons
              name="shield-check-outline"
              size={22}
              color={c.accent}
              style={styles.integrityIcon}
            />
            <Text style={styles.integrityBody}>
              Din plats lämnar aldrig enheten. Inga konton, ingen spårning, ingen reklam.
            </Text>
          </View>
        </SettingSection>

        <SettingSection
          title="Bygger på"
          footnote="Öppen källkod – tryck för att läsa mer om varje projekt."
        >
          {SOURCES.map((s, i) => (
            <Pressable
              key={s.name}
              onPress={() => openUrl(s.url)}
              accessibilityRole="link"
              accessibilityLabel={`${s.label}: ${s.name}`}
              style={({ pressed }) => [
                styles.sourceRow,
                i > 0 && styles.sourceDivider,
                pressed && styles.sourcePressed,
              ]}
            >
              <Text style={styles.sourceLabel}>{s.label}</Text>
              <View style={styles.sourceTrailing}>
                <Text style={styles.sourceName}>{s.name}</Text>
                <MaterialIcons name="open-in-new" size={16} color={c.inkMuted} />
              </View>
            </Pressable>
          ))}
        </SettingSection>

        {/* Store review as a quiet editorial footer — "if you like this, help
            others find it". Belongs here, not under Kontakt: it's a store
            affordance, not a human contact channel. */}
        <Pressable
          onPress={rateApp}
          accessibilityRole="button"
          accessibilityLabel="Betygsätt appen i butiken"
          hitSlop={8}
          style={({ pressed }) => [styles.rate, pressed && styles.ratePressed]}
        >
          <Text style={styles.rateText}>Betygsätt appen</Text>
        </Pressable>

        <Text style={styles.colophon}>
          islam.se · Version {APP_VERSION} · © 2026
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.paper },
    content: { padding: space.lg, paddingBottom: space.xxxl + space.lg },

    header: { ...type.title, color: c.ink, marginBottom: space.md, marginTop: space.xs },

    // The "what is this?" line. Calm body, muted ink — present but not
    // marketing-shouty.
    lead: { ...type.body, color: c.inkMuted, marginBottom: space.xl, lineHeight: 23 },

    // Plain paragraph inside a SettingSection card — left-aligned, body
    // weight, same horizontal padding as the section title above it so the
    // card reads as one continuous block.
    cardBody: {
      ...type.body,
      color: c.ink,
      paddingHorizontal: space.lg,
      paddingTop: space.xs,
      paddingBottom: space.md,
    },
    // Integritet block: shield + body side-by-side. The icon aligns at the
    // top so a longer paragraph would wrap below it without re-centring.
    integrityRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: space.lg,
      paddingTop: space.xs,
      paddingBottom: space.md,
      gap: space.md,
    },
    integrityIcon: { marginTop: 1 },
    integrityBody: { ...type.body, color: c.ink, flex: 1 },

    // Source rows: label on the left ("Bönetider"), project name + external-link
    // glyph on the right. Same rhythm as the Stad-row inside Plats on
    // Inställningar — the open-in-new icon signals "leaves the app" so it's
    // distinct from a chevron (which would mean "pushes another in-app screen").
    sourceRow: {
      minHeight: 48,
      paddingVertical: space.md,
      paddingHorizontal: space.lg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sourceDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.separator },
    sourcePressed: { backgroundColor: c.accentSoft },
    sourceLabel: { ...type.body, color: c.ink },
    sourceTrailing: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    sourceName: { ...type.body, color: c.accent },

    // Centred quiet accent link — visible, tappable, but caption-weight so it
    // doesn't compete with the cards above as a CTA.
    rate: {
      alignSelf: 'center',
      paddingVertical: space.sm,
      paddingHorizontal: space.md,
      marginTop: space.lg,
    },
    ratePressed: { opacity: 0.6 },
    rateText: { ...type.callout, color: c.accent, textAlign: 'center' },

    // Faintest ink, no chrome — imprint position at the paper's edge. Mirrors
    // Inställningar's colophon so the two screens share a sign-off.
    colophon: {
      ...type.micro,
      color: c.inkMuted,
      textAlign: 'center',
      opacity: 0.7,
      marginTop: space.sm,
    },
  });
}
