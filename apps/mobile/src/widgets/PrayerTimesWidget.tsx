// The iOS home-screen widget (WidgetKit), built with Expo UI / SwiftUI components.
//
// PLATFORM NOTE: this file is iOS-only and CANNOT be built or run on a Linux/Android
// host — it compiles into a WidgetKit extension via `expo-widgets` during an EAS /
// macOS build. The `'widget'` directive on the layout function tells babel-preset-expo
// to bundle it separately for that extension. It runs in a restricted bundle (react /
// react-native are stubbed), so it only imports Expo UI, plain design tokens, and
// TYPES — never the app's runtime (no adhan, no React hooks, no AsyncStorage). All the
// data arrives pre-computed as a WidgetPayload pushed from the app (see ../widget/sync).
import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  containerBackground,
  font,
  foregroundStyle,
  padding,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { SFSymbol } from 'sf-symbols-typescript';

import type { PrayerKey } from '../lib/prayer-times';
import { darkPalette, lightPalette, type Palette } from '../theme/tokens';
import type { WidgetPayload, WidgetPrayerRow } from '../widget/payload';

/** SF Symbols walking the solar cycle — the visual language the whole app speaks.
 *  (The app's MaterialCommunityIcons names don't apply to SwiftUI, so this is a
 *  parallel mapping in SF Symbol space.) */
const PRAYER_SYMBOL: Record<PrayerKey, SFSymbol> = {
  fajr: 'moon.stars.fill',
  sunrise: 'sunrise.fill',
  dhuhr: 'sun.max.fill',
  asr: 'sun.min.fill',
  maghrib: 'sunset.fill',
  isha: 'moon.fill',
};

/** Opening the app from the widget lands on the map (Bönetider is the root route). */
const DEEP_LINK = 'islamse://';

/** Pick the palette: an explicit light/dark lock in settings wins; otherwise follow
 *  WidgetKit's environment colour scheme — same rule as the app's useActiveScheme(). */
function paletteFor(payload: WidgetPayload, environment: WidgetEnvironment): Palette {
  const scheme =
    payload.theme === 'light' || payload.theme === 'dark'
      ? payload.theme
      : (environment.colorScheme ?? 'light');
  return scheme === 'dark' ? darkPalette : lightPalette;
}

/** The next-prayer hero: a small "NÄSTA BÖN" label, the prayer name in brass, its
 *  clock time, and a live relative countdown (WidgetKit auto-updates `Text(date:)`). */
function NextHero({ p, c, large }: { p: WidgetPayload; c: Palette; large: boolean }) {
  return (
    <VStack alignment="leading" spacing={large ? 4 : 3}>
      <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(c.inkFaint)]}>
        NÄSTA BÖN
      </Text>
      <HStack spacing={6} alignment="center">
        {p.nextArabic ? (
          <Image systemName={iconForNext(p)} size={large ? 17 : 15} color={c.highlight} />
        ) : null}
        <Text
          modifiers={[font({ size: large ? 21 : 18, weight: 'bold' }), foregroundStyle(c.highlight)]}
        >
          {p.nextArabic || 'Bönetider'}
        </Text>
      </HStack>
      {p.nextSwedish ? (
        <Text modifiers={[font({ size: 12 }), foregroundStyle(c.inkMuted)]}>{p.nextSwedish}</Text>
      ) : null}
      <Text
        modifiers={[font({ size: large ? 30 : 34, weight: 'bold' }), foregroundStyle(c.ink)]}
      >
        {p.nextTime}
      </Text>
      {p.nextAtMs != null ? (
        <Text
          date={new Date(p.nextAtMs)}
          dateStyle="relative"
          modifiers={[font({ size: 12 }), foregroundStyle(c.inkMuted)]}
        />
      ) : null}
    </VStack>
  );
}

/** One line in the medium widget's day schedule: name on the left, time on the right.
 *  The next prayer is brass; the sunrise marker is quietened to the faint ink tier. */
function ScheduleRow({ row, c }: { row: WidgetPrayerRow; c: Palette }) {
  const color = row.isNext ? c.highlight : row.isMarker ? c.inkFaint : c.ink;
  const weight = row.isNext ? 'semibold' : 'regular';
  return (
    <HStack spacing={8} alignment="firstTextBaseline">
      <Text modifiers={[font({ size: 13, weight }), foregroundStyle(color)]}>{row.arabic}</Text>
      <Spacer />
      <Text modifiers={[font({ size: 13, weight }), foregroundStyle(color)]}>{row.time}</Text>
    </HStack>
  );
}

function iconForNext(p: WidgetPayload): SFSymbol {
  const next = p.rows.find((r) => r.isNext);
  if (next) return PRAYER_SYMBOL[next.key];
  // Tomorrow's Fajr (rolled over) or nothing resolved → the dawn glyph is a safe default.
  return PRAYER_SYMBOL.fajr;
}

/** systemSmall (2×2): just the hero — next prayer, time, live countdown, location. */
function SmallWidget(p: WidgetPayload, c: Palette) {
  return (
    <VStack
      alignment="leading"
      spacing={5}
      modifiers={[
        padding({ all: 16 }),
        containerBackground(c.paper, 'widget'),
        widgetURL(DEEP_LINK),
      ]}
    >
      <NextHero p={p} c={c} large={false} />
      <Spacer />
      <Text modifiers={[font({ size: 11 }), foregroundStyle(c.inkFaint)]}>{p.location}</Text>
    </VStack>
  );
}

/** systemMedium (4×2): hero on the left, the full day's schedule on the right, with a
 *  date + location footer beneath. */
function MediumWidget(p: WidgetPayload, c: Palette) {
  return (
    <VStack
      alignment="leading"
      spacing={8}
      modifiers={[
        padding({ all: 16 }),
        containerBackground(c.paper, 'widget'),
        widgetURL(DEEP_LINK),
      ]}
    >
      <HStack spacing={16} alignment="top">
        <NextHero p={p} c={c} large />
        <Spacer />
        <VStack alignment="leading" spacing={3}>
          {p.rows.map((row) => (
            <ScheduleRow key={row.key} row={row} c={c} />
          ))}
        </VStack>
      </HStack>
      <Spacer />
      <Text modifiers={[font({ size: 11 }), foregroundStyle(c.inkFaint)]}>
        {p.location} · {p.hijri}
      </Text>
    </VStack>
  );
}

function PrayerTimesWidgetLayout(payload: WidgetPayload, environment: WidgetEnvironment) {
  'widget';
  const c = paletteFor(payload, environment);
  return environment.widgetFamily === 'systemSmall'
    ? SmallWidget(payload, c)
    : MediumWidget(payload, c);
}

// Name MUST match the `widgets[].name` in app.json's expo-widgets plugin config.
const PrayerTimesWidget = createWidget<WidgetPayload>('PrayerTimesWidget', PrayerTimesWidgetLayout);

export default PrayerTimesWidget;
