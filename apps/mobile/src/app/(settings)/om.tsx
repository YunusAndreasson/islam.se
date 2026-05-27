// Om — what the app is, how its numbers come about, and how to reach us. Built like
// a modern About page: a clean editorial masthead, a one-line overview, then
// everything explanatory folded into a "Vanliga frågor" accordion (progressive
// disclosure) so a first-time reader scans the page rather than wades through it.
// The answers are deliberately honest about the sources: islam.se computes nothing of
// its own — it uses the established `adhan` methods and an arithmetic Hijri calendar,
// and points to official institutions for the start of ramadan and the great feasts.
// The Kontakt section wires up the native rating sheet, mail composer and in-app browser.
import { MaterialIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as MailComposer from 'expo-mail-composer';
import { router } from 'expo-router';
import * as StoreReview from 'expo-store-review';
import * as WebBrowser from 'expo-web-browser';
import { useMemo } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FaqItem } from '../../components/about/FaqItem';
import { SettingSection } from '../../components/settings/SettingSection';
import { hapticSelection } from '../../lib/haptics';
import { type Palette, radius, space, type } from '../../theme/tokens';
import { useColors } from '../../theme/useColors';

const SITE_URL = 'https://islam.se';
const SUPPORT_EMAIL = 'support@islam.se';
// The open-source projects the app is built on — linked from the credits so each name
// is plainly a real project, not a stray word.
const ADHAN_URL = 'https://github.com/batoulapps/adhan-js';
const MAPLIBRE_URL = 'https://maplibre.org';
const OSM_URL = 'https://www.openstreetmap.org/copyright';
const version = Constants.expoConfig?.version ?? '1.0.0';

// The questions a reader actually has, answered truthfully. Kept as data so the copy
// lives in one place and the screen just maps over it.
const FAQ: readonly { question: string; answer: string }[] = [
  {
    question: 'Hur räknas bönetiderna ut?',
    answer:
      'Tiderna beräknas med det öppna biblioteket adhan, som bygger på vedertagna astronomiska metoder. islam.se har inget eget uträkningssystem utan använder dessa etablerade metoder. Du väljer själv beräkningsmetod (Muslim World League är standard), madhhab och hur höga breddgrader hanteras under Inställningar.',
  },
  {
    question: 'Stämmer det islamiska datumet?',
    answer:
      'Datumet följer den aritmetiska Hijri-kalendern, som räknas ut i förväg och alltid ger ett bestämt datum. Det kan därför skilja en dag från officiella besked. Stämmer det inte med din lokala kalender kan du justera det med Hijri-justeringen under Inställningar.',
  },
  {
    question: 'När börjar ramadan och de stora högtiderna?',
    answer:
      'Starten på ramadan och högtider som Eid fastställs av officiella islamiska institutioner genom månsiktning, inte av appens beräknade kalender. Datumet i appen är vägledande – följ din lokala moské eller en officiell institution för det slutgiltiga beskedet.',
  },
  {
    question: 'Hur fungerar qibla?',
    answer:
      'Qibla-vyn visar riktningen till Kaba i Mecka från din plats, beräknad som den kortaste vägen längs jordens yta, och anger fågelvägen dit i kilometer. Saknar enheten kompass visas riktningen räknad från norr.',
  },
  {
    question: 'Använder appen min plats?',
    answer:
      'Platsen används bara i din enhet för att räkna ut bönetider och qibla. Appen har inga konton och samlar inte in någon uppgift om dig. Du kan också ange en plats för hand under Inställningar.',
  },
  {
    question: 'Var kommer kartan ifrån?',
    answer:
      'Kartan visas med MapLibre. Kartdatan kommer från OpenFreeMap, OpenMapTiles och OpenStreetMap-bidragsgivare.',
  },
];

// Open a URL in an in-app browser (stays inside the app, themable). Never throws.
function openUrl(url: string) {
  void WebBrowser.openBrowserAsync(url).catch(() => {});
}

// Ask for a store rating in-place when the platform offers it (the native review
// sheet); otherwise fall back to the store listing. Silent on devices/emulators
// without either, never throws.
function rateApp() {
  void (async () => {
    try {
      if (await StoreReview.hasAction()) {
        await StoreReview.requestReview();
        return;
      }
      const url = StoreReview.storeUrl();
      if (url) await Linking.openURL(url);
    } catch {
      // Rating is a nicety — a failed prompt must never disrupt the screen.
    }
  })();
}

// Prefer the native mail composer; fall back to a mailto: link on devices without one
// (most emulators). Wrapped so a tap can never reject into an unhandled rejection.
function emailSupport() {
  void (async () => {
    try {
      if (await MailComposer.isAvailableAsync()) {
        await MailComposer.composeAsync({ recipients: [SUPPORT_EMAIL] });
      } else {
        await Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
      }
    } catch {
      // A contact tap should never crash the screen.
    }
  })();
}

type OmStyles = ReturnType<typeof makeStyles>;

function ContactRow({
  icon,
  label,
  detail,
  onPress,
  styles,
  colors,
  divider = false,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  detail: string;
  onPress: () => void;
  styles: OmStyles;
  colors: Palette;
  divider?: boolean;
}) {
  return (
    <Pressable
      onPress={() => {
        hapticSelection();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, divider && styles.rowDivider, pressed && styles.rowPressed]}
    >
      <View style={styles.rowIcon}>
        <MaterialIcons name={icon} size={18} color={colors.accent} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowDetail}>{detail}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={22} color={colors.inkFaint} />
    </Pressable>
  );
}

export default function Om() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Pushed in from Settings — a back arrow returns to the Settings sheet. */}
      <View style={styles.modalBar}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Tillbaka"
          hitSlop={10}
          style={styles.back}
        >
          <MaterialIcons name="arrow-back" size={24} color={c.inkMuted} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.masthead}>
          <Text style={styles.brand}>islam.se</Text>
          <Text style={styles.tagline}>Bönetider för hela Sverige, ritade som en levande karta.</Text>
        </View>

        <Text style={styles.lead}>
          Ljuset och bönernas stunder sveper över Sverige i takt med dygnet. Dra i tidslinjen för
          att följa dem timme för timme, vänd dig mot qibla och låt appen påminna dig när det är
          dags för bön.
        </Text>

        <SettingSection title="Vanliga frågor">
          {FAQ.map((item, i) => (
            <FaqItem key={item.question} question={item.question} answer={item.answer} divider={i > 0} />
          ))}
        </SettingSection>

        <SettingSection title="Kontakt">
          <ContactRow
            icon="star-outline"
            label="Betygsätt appen"
            detail="Lämna ett omdöme"
            onPress={rateApp}
            styles={styles}
            colors={c}
          />
          <ContactRow
            icon="mail-outline"
            label="Mejla oss"
            detail={SUPPORT_EMAIL}
            onPress={emailSupport}
            styles={styles}
            colors={c}
            divider
          />
          <ContactRow
            icon="open-in-new"
            label="Läs mer på islam.se"
            detail="islam.se"
            onPress={() => openUrl(SITE_URL)}
            styles={styles}
            colors={c}
            divider
          />
        </SettingSection>

        <Text style={styles.privacy}>Inga konton, ingen spårning. Din plats lämnar aldrig enheten.</Text>
        <Text style={styles.credits}>
          Öppen källkod:{' '}
          <Text style={styles.link} accessibilityRole="link" onPress={() => openUrl(ADHAN_URL)}>
            adhan
          </Text>{' '}
          beräknar bönetiderna,{' '}
          <Text style={styles.link} accessibilityRole="link" onPress={() => openUrl(MAPLIBRE_URL)}>
            MapLibre
          </Text>{' '}
          ritar kartan, och kartdatan kommer från OpenFreeMap, OpenMapTiles och{' '}
          <Text style={styles.link} accessibilityRole="link" onPress={() => openUrl(OSM_URL)}>
            OpenStreetMap
          </Text>
          -bidragsgivare.
        </Text>
        <Text style={styles.version}>Version {version}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.paper },
    modalBar: { height: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md },
    back: { padding: 4 },
    content: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.xxxl + space.lg },

    // A clean editorial masthead — the wordmark sits directly on the paper, no card or
    // gradient box, left-aligned.
    masthead: { paddingTop: space.lg, paddingBottom: space.lg },
    brand: { ...type.display, color: c.ink },
    tagline: { ...type.body, color: c.inkMuted, marginTop: space.sm },

    lead: { ...type.body, color: c.inkMuted, marginBottom: space.xl },

    // Contact rows — share the settings-row rhythm (leading icon chip, title + detail,
    // trailing chevron) so the Kontakt card feels native to the rest of the app.
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      minHeight: 56,
      paddingHorizontal: space.lg,
      paddingVertical: space.md,
    },
    rowPressed: { backgroundColor: c.accentSoft },
    rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.separator },
    rowIcon: {
      width: 32,
      height: 32,
      borderRadius: radius.sm,
      backgroundColor: c.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowText: { flex: 1 },
    rowLabel: { ...type.bodyStrong, color: c.ink },
    rowDetail: { ...type.caption, color: c.inkMuted, marginTop: 1 },

    privacy: { ...type.caption, color: c.inkMuted, textAlign: 'center', marginTop: space.xs },
    credits: {
      ...type.caption,
      color: c.inkFaint,
      textAlign: 'center',
      lineHeight: 18,
      marginTop: space.lg,
      paddingHorizontal: space.sm,
    },
    // Linked project names pop out of the faint credits so each reads as a real,
    // tappable project rather than a stray word.
    link: { color: c.accent, textDecorationLine: 'underline' },
    version: { ...type.caption, color: c.inkFaint, textAlign: 'center', marginTop: space.lg },
  });
}
