// The iOS home-screen widget (WidgetKit), built with Expo UI / SwiftUI components.
//
// PLATFORM NOTE: this file is iOS-only and CANNOT be built or run on a Linux/Android
// host — it compiles into a WidgetKit extension via `expo-widgets` during an EAS /
// macOS build. The `'widget'` directive on the layout function tells babel-preset-expo
// to bundle it separately for that extension. It runs in a restricted bundle (react /
// react-native are stubbed), so it only imports Expo UI, plain design tokens, and
// TYPES — never the app's runtime (no adhan, no React hooks, no AsyncStorage). All the
// data arrives pre-computed as a WidgetPayload pushed from the app (see ../widget/sync).
//
// TWO things are load-bearing here, both per expo issue #46200 (widgets render BLACK
// without them):
//   1. `containerBackground(color, 'widget')` on the root view — iOS 17+ requires a
//      widget to declare its container background or it renders black.
//   2. A null/undefined-props guard — WidgetKit renders a placeholder/snapshot BEFORE
//      the app has pushed any timeline, and expo-widgets passes null props for it.
//      Reading `payload.x` on null throws, the render fails, and the widget goes black.
//      So we normalise to DEFAULT_PAYLOAD and show a branded "open the app" placeholder.
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

/** SF Symbols walking the solar cycle — the visual language the whole app speaks. */
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

/** Shown when WidgetKit renders the widget before the app has pushed any data
 *  (null props on first add / placeholder). Keeps the widget branded, never black. */
const DEFAULT_PAYLOAD: WidgetPayload = {
  location: '',
  gregorian: '',
  hijri: '',
  rows: [],
  nextArabic: '',
  nextSwedish: '',
  nextTime: '—',
  nextAtMs: null,
  nextIsTomorrow: false,
  theme: 'system',
};

/** Coerce whatever WidgetKit hands us (possibly null, or a partial object) into a
 *  fully-populated, render-safe payload. This is the single guard that keeps a missing
 *  field from throwing mid-render and blacking out the whole widget. */
function normalize(raw: WidgetPayload | null | undefined): WidgetPayload {
  const p = raw ?? DEFAULT_PAYLOAD;
  return {
    location: typeof p.location === 'string' ? p.location : '',
    gregorian: typeof p.gregorian === 'string' ? p.gregorian : '',
    hijri: typeof p.hijri === 'string' ? p.hijri : '',
    rows: Array.isArray(p.rows) ? p.rows : [],
    nextArabic: typeof p.nextArabic === 'string' ? p.nextArabic : '',
    nextSwedish: typeof p.nextSwedish === 'string' ? p.nextSwedish : '',
    nextTime: typeof p.nextTime === 'string' && p.nextTime ? p.nextTime : '—',
    nextAtMs: typeof p.nextAtMs === 'number' ? p.nextAtMs : null,
    nextIsTomorrow: Boolean(p.nextIsTomorrow),
    theme: p.theme === 'light' || p.theme === 'dark' ? p.theme : 'system',
  };
}

/** Pick the palette: an explicit light/dark lock in settings wins; otherwise follow
 *  WidgetKit's environment colour scheme — same rule as the app's useActiveScheme(). */
function paletteFor(payload: WidgetPayload, environment: WidgetEnvironment): Palette {
  const scheme =
    payload.theme === 'light' || payload.theme === 'dark'
      ? payload.theme
      : (environment.colorScheme ?? 'light');
  return scheme === 'dark' ? darkPalette : lightPalette;
}

function iconForNext(p: WidgetPayload): SFSymbol {
  const next = p.rows.find((r) => r.isNext);
  return next ? PRAYER_SYMBOL[next.key] : PRAYER_SYMBOL.fajr;
}

/** The next-prayer hero: a "NÄSTA BÖN" label, the prayer name in brass, its clock
 *  time, and a live relative countdown (WidgetKit auto-updates `Text(date:)`). */
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
      <Text modifiers={[font({ size: large ? 30 : 34, weight: 'bold' }), foregroundStyle(c.ink)]}>
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

/** One line in the medium widget's day schedule: name left, time right. The next
 *  prayer is brass; the sunrise marker is quietened to the faint ink tier. */
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

/** Shown when there's no schedule yet (widget added before the app pushed data).
 *  Branded, never black — and its visibility confirms the layout itself renders. */
function PlaceholderWidget(p: WidgetPayload, c: Palette) {
  return (
    <VStack
      alignment="leading"
      spacing={6}
      modifiers={[
        padding({ all: 16 }),
        containerBackground(c.paper, 'widget'),
        widgetURL(DEEP_LINK),
      ]}
    >
      <Text modifiers={[font({ size: 18, weight: 'bold' }), foregroundStyle(c.highlight)]}>
        Bönetider
      </Text>
      <Text modifiers={[font({ size: 13 }), foregroundStyle(c.inkMuted)]}>
        Öppna appen för att läsa in dagens bönetider.
      </Text>
      <Spacer />
    </VStack>
  );
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
      {p.location ? (
        <Text modifiers={[font({ size: 11 }), foregroundStyle(c.inkFaint)]}>{p.location}</Text>
      ) : null}
    </VStack>
  );
}

/** systemMedium (4×2): hero on the left, the day's schedule on the right, date +
 *  location footer beneath. */
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
      {p.location || p.hijri ? (
        <Text modifiers={[font({ size: 11 }), foregroundStyle(c.inkFaint)]}>
          {[p.location, p.hijri].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
    </VStack>
  );
}

function PrayerTimesWidgetLayout(rawPayload: WidgetPayload, environment: WidgetEnvironment) {
  'widget';
  const payload = normalize(rawPayload);
  const c = paletteFor(payload, environment);
  // No schedule yet (null / placeholder props) → a branded card, never a black box.
  if (payload.rows.length === 0) return PlaceholderWidget(payload, c);
  return environment.widgetFamily === 'systemSmall'
    ? SmallWidget(payload, c)
    : MediumWidget(payload, c);
}

// Name MUST match the `widgets[].name` in app.json's expo-widgets plugin config.
const PrayerTimesWidget = createWidget<WidgetPayload>('PrayerTimesWidget', PrayerTimesWidgetLayout);

export default PrayerTimesWidget;
