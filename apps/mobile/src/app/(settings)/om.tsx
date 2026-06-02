// Om appen — the app's identity page. Composed as a whole, not a list of facts:
//   1. MASTHEAD          — app icon + "islam.se" wordmark + the one poetic line that
//                          says what this is. Centred, editorial, no decorative box
//                          (a boxed/gradient hero was tried and rejected as un-modern).
//   2. INTEGRITET card   — the privacy promise, the one thing users genuinely care about.
//   3. Stöd card         — outward links a real user might want: the islam.se site, and
//                          a store rating. Tidy rows, the app's card language.
//   4. Imprint + credits — version colophon, then the legally-required map attribution
//                          (MapTiler TOS + OpenStreetMap ODbL) as quiet fine print.
//
// Deliberately NOT here: the old "Bygger på" card listing every open-source dependency
// (adhan / MapLibre / MapTiler / OpenStreetMap) as prominent rows. That read like a
// developer's manifest — no real user recognises those names. The attribution that's
// actually required now lives as one muted footnote at the very bottom, where map
// credits belong; everything above it is human-facing.
import { MaterialIcons } from '@expo/vector-icons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMemo } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SettingSection } from '../../components/settings/SettingSection';
import { ModalBar } from '../../components/ui/ModalBar';
import {
  ADHAN_URL,
  APP_VERSION,
  ISLAMSE_URL,
  MAPLIBRE_URL,
  MAPTILER_URL,
  OPENFREEMAP_URL,
  openUrl,
  OSM_URL,
  rateApp,
} from '../../lib/about';
import { TILES_PROVIDER } from '../../lib/map/nordicStyle';
import { type Palette, radius, space, type } from '../../theme/tokens';
import { useColors } from '../../theme/useColors';

const ICON = require('../../../assets/images/icon.png');

export default function Om() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  // The active tile provider is credited explicitly — MapTiler's TOS requires it when
  // their tiles are bundled; OpenFreeMap is credited when it's the fallback. OSM is
  // always credited (both providers ship OpenStreetMap data, ODbL requires it).
  const tile =
    TILES_PROVIDER === 'maptiler'
      ? { name: 'MapTiler', url: MAPTILER_URL }
      : { name: 'OpenFreeMap', url: OPENFREEMAP_URL };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Pushed in from Settings — back returns to the Settings sheet. */}
      <ModalBar variant="back" fallback="/installningar" />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Masthead: the app's mark + name, then the one line that says what it is.
            This is the page's identity and its title in one — no separate "Om appen"
            heading, which would only echo it. */}
        <View style={styles.masthead}>
          <Image source={ICON} style={styles.icon} accessibilityIgnoresInvertColors />
          <Text style={styles.wordmark}>islam.se</Text>
          <Text style={styles.tagline}>
            En karta över Sveriges bönetider, ritad med solens vandring över landet.
          </Text>
        </View>

        <SettingSection title="Integritet">
          {/* Shield + paragraph reads as one block: the icon is a small leading
              visual mark that gives the privacy promise the weight it deserves. */}
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

        {/* Stöd: the two outward actions a reader might want — visit the project's site,
            or rate the app. Rows, not floating links, so they read as one tidy shelf in
            the app's card language. */}
        <SettingSection title="Stöd">
          <LinkRow colors={c} styles={styles} label="Besök islam.se" external onPress={() => openUrl(ISLAMSE_URL)} />
          <LinkRow colors={c} styles={styles} label="Betygsätt appen" onPress={rateApp} divider />
        </SettingSection>

        <Text style={styles.colophon}>islam.se · Version {APP_VERSION} · © 2026</Text>

        {/* The required map attribution, as quiet fine print (where map credits belong).
            The provider names link out for anyone curious, but they read as a footnote,
            not a feature. */}
        <Text style={styles.credits}>
          Kartdata{' '}
          <Text style={styles.creditsLink} accessibilityRole="link" onPress={() => openUrl(OSM_URL)}>
            © OpenStreetMaps bidragsgivare
          </Text>
          , kartbilder från{' '}
          <Text style={styles.creditsLink} accessibilityRole="link" onPress={() => openUrl(tile.url)}>
            {tile.name}
          </Text>
          . Bönetider med{' '}
          <Text style={styles.creditsLink} accessibilityRole="link" onPress={() => openUrl(ADHAN_URL)}>
            adhan
          </Text>
          , karta med{' '}
          <Text style={styles.creditsLink} accessibilityRole="link" onPress={() => openUrl(MAPLIBRE_URL)}>
            MapLibre
          </Text>
          .
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// One outward row inside the Stöd card: a label and a trailing glyph. `external` rows
// (a website) get an open-in-new arrow signalling "leaves the app"; the rest get a
// chevron. Mirrors the LinkRow rhythm used in Inställningar so the rows read alike.
function LinkRow({
  colors,
  styles,
  label,
  onPress,
  external = false,
  divider = false,
}: {
  colors: Palette;
  styles: ReturnType<typeof makeStyles>;
  label: string;
  onPress: () => void;
  external?: boolean;
  divider?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={external ? 'link' : 'button'}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, divider && styles.rowDivider, pressed && styles.rowPressed]}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      <MaterialIcons
        name={external ? 'open-in-new' : 'chevron-right'}
        size={external ? 18 : 22}
        color={colors.inkMuted}
      />
    </Pressable>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.paper },
    content: { padding: space.lg, paddingBottom: space.xxxl + space.lg },

    // --- Masthead -------------------------------------------------------
    masthead: { alignItems: 'center', paddingTop: space.lg, paddingBottom: space.xl },
    // The app icon as a rounded chip — the recognisable identity mark. A hairline
    // ring tidies its edge against the warm paper.
    icon: {
      width: 72,
      height: 72,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
    },
    wordmark: { ...type.title, color: c.ink, marginTop: space.md },
    // The poetic one-liner — what it is. Centred, muted, held to a comfortable measure
    // so it reads as a subtitle under the wordmark rather than running edge to edge.
    tagline: {
      ...type.callout,
      color: c.inkMuted,
      textAlign: 'center',
      lineHeight: 22,
      marginTop: space.sm,
      maxWidth: 320,
    },

    // --- Integritet -----------------------------------------------------
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

    // --- Stöd rows ------------------------------------------------------
    row: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      paddingHorizontal: space.lg,
      paddingVertical: space.md,
    },
    rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.separator },
    rowPressed: { backgroundColor: c.accentSoft },
    rowLabel: { ...type.body, color: c.ink, flex: 1 },

    // --- Imprint + credits ----------------------------------------------
    // Faintest ink, no chrome — imprint position at the paper's edge. Mirrors
    // Inställningar's colophon so the two screens share a sign-off.
    colophon: {
      ...type.micro,
      color: c.inkMuted,
      textAlign: 'center',
      opacity: 0.7,
      marginTop: space.md,
    },
    // Required map attribution as fine print: smaller + fainter than the colophon, so it
    // reads as a legal footnote rather than content. Links are muted ink (not accent) so
    // they stay quiet.
    credits: {
      ...type.micro,
      color: c.inkFaint,
      textAlign: 'center',
      lineHeight: 17,
      marginTop: space.sm,
      paddingHorizontal: space.md,
    },
    creditsLink: { color: c.inkMuted },
  });
}
