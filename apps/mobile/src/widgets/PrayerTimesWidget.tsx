// The iOS home-screen widget (WidgetKit), built with Expo UI / SwiftUI components.
//
// ⚠️ CRITICAL ARCHITECTURE CONSTRAINT — the `'widget'` layout MUST be self-contained.
// babel-preset-expo's widgets-plugin serialises ONLY this function's own source to a
// string (generator.generate(fn).code). At render time the iOS extension evaluates
// that string STANDALONE — `evaluateScript("(" + layout + ")")` in WidgetsJSRuntime.swift
// — in a JSContext whose globalThis holds only the @expo/ui components + modifiers + the
// jsx runtime. Nothing from THIS module's scope is in that bundle. So the layout may
// reference ONLY: its params, @expo/ui imports (VStack/Text/font/… — provided on
// globalThis), and identifiers it defines INSIDE its own body. Any reference to a
// module-level helper, constant, or imported value (palettes, an SF-symbol map, a shared
// `normalize`) is undefined at render → ReferenceError → the widget renders BLACK. This
// is the bug that made earlier versions black (cf. expo/expo#46200). Keep everything
// inline. Because the layout string lives in the app's MAIN JS bundle (written to the
// app group by createWidget at launch), fixes to it ship via EAS Update (OTA) — no
// native rebuild. Only the @expo/ui runtime is build-time, and it's already complete.
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
import type { WidgetPayload } from '../widget/payload';

function PrayerTimesWidgetLayout(rawPayload: WidgetPayload, environment: WidgetEnvironment) {
  'widget';
  // Everything below is INTENTIONALLY inline — see the file header. Do not lift any of
  // this to module scope or the widget goes black.

  // Brand palette (mirrors src/theme/tokens.ts — only the tokens this widget uses).
  const LIGHT = {
    paper: '#f4f0e8',
    ink: '#1a1712',
    inkMuted: '#6f6456',
    inkFaint: '#978c7b',
    highlight: '#b8862f',
  };
  const DARK = {
    paper: '#161a26',
    ink: '#e8e3d8',
    inkMuted: '#a8acba',
    inkFaint: '#7a8094',
    highlight: '#c89a48',
  };
  const SF: Record<string, SFSymbol> = {
    fajr: 'moon.stars.fill',
    sunrise: 'sunrise.fill',
    dhuhr: 'sun.max.fill',
    asr: 'sun.min.fill',
    maghrib: 'sunset.fill',
    isha: 'moon.fill',
  };
  const LINK = 'islamse://';

  // Null/partial-safe: WidgetKit renders a placeholder with null props before the app
  // pushes data; reading fields off null would throw → black.
  const p = (rawPayload ?? {}) as Partial<WidgetPayload>;
  const theme =
    p.theme === 'light' || p.theme === 'dark' ? p.theme : (environment.colorScheme ?? 'light');
  const c = theme === 'dark' ? DARK : LIGHT;

  const rows = Array.isArray(p.rows) ? p.rows : [];
  const location = typeof p.location === 'string' ? p.location : '';
  const hijri = typeof p.hijri === 'string' ? p.hijri : '';
  const nextArabic = typeof p.nextArabic === 'string' ? p.nextArabic : '';
  const nextSwedish = typeof p.nextSwedish === 'string' ? p.nextSwedish : '';
  const nextTime = typeof p.nextTime === 'string' && p.nextTime ? p.nextTime : '—';
  const nextAtMs = typeof p.nextAtMs === 'number' ? p.nextAtMs : null;
  const nextRow = rows.find((r) => r.isNext);
  const nextIcon: SFSymbol = nextRow ? SF[nextRow.key as PrayerKey] : SF.fajr;

  // No schedule yet → a branded placeholder, never a black box.
  if (rows.length === 0) {
    return (
      <VStack
        alignment="leading"
        spacing={6}
        modifiers={[
          padding({ all: 16 }),
          containerBackground(c.paper, 'widget'),
          widgetURL(LINK),
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

  // Next-prayer hero (inline local builder — defined inside the layout on purpose).
  const hero = (large: boolean) => (
    <VStack alignment="leading" spacing={large ? 4 : 3}>
      <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(c.inkFaint)]}>
        NÄSTA BÖN
      </Text>
      <HStack spacing={6} alignment="center">
        {nextArabic ? <Image systemName={nextIcon} size={large ? 17 : 15} color={c.highlight} /> : null}
        <Text
          modifiers={[font({ size: large ? 21 : 18, weight: 'bold' }), foregroundStyle(c.highlight)]}
        >
          {nextArabic || 'Bönetider'}
        </Text>
      </HStack>
      {nextSwedish ? (
        <Text modifiers={[font({ size: 12 }), foregroundStyle(c.inkMuted)]}>{nextSwedish}</Text>
      ) : null}
      <Text modifiers={[font({ size: large ? 30 : 34, weight: 'bold' }), foregroundStyle(c.ink)]}>
        {nextTime}
      </Text>
      {nextAtMs != null ? (
        <Text
          date={new Date(nextAtMs)}
          dateStyle="relative"
          modifiers={[font({ size: 12 }), foregroundStyle(c.inkMuted)]}
        />
      ) : null}
    </VStack>
  );

  if (environment.widgetFamily === 'systemSmall') {
    return (
      <VStack
        alignment="leading"
        spacing={5}
        modifiers={[
          padding({ all: 16 }),
          containerBackground(c.paper, 'widget'),
          widgetURL(LINK),
        ]}
      >
        {hero(false)}
        <Spacer />
        {location ? (
          <Text modifiers={[font({ size: 11 }), foregroundStyle(c.inkFaint)]}>{location}</Text>
        ) : null}
      </VStack>
    );
  }

  return (
    <VStack
      alignment="leading"
      spacing={8}
      modifiers={[padding({ all: 16 }), containerBackground(c.paper, 'widget'), widgetURL(LINK)]}
    >
      <HStack spacing={16} alignment="top">
        {hero(true)}
        <Spacer />
        <VStack alignment="leading" spacing={3}>
          {rows.map((row) => {
            const col = row.isNext ? c.highlight : row.isMarker ? c.inkFaint : c.ink;
            const w: 'semibold' | 'regular' = row.isNext ? 'semibold' : 'regular';
            return (
              <HStack key={row.key} spacing={8} alignment="firstTextBaseline">
                <Text modifiers={[font({ size: 13, weight: w }), foregroundStyle(col)]}>
                  {row.arabic}
                </Text>
                <Spacer />
                <Text modifiers={[font({ size: 13, weight: w }), foregroundStyle(col)]}>
                  {row.time}
                </Text>
              </HStack>
            );
          })}
        </VStack>
      </HStack>
      <Spacer />
      {location || hijri ? (
        <Text modifiers={[font({ size: 11 }), foregroundStyle(c.inkFaint)]}>
          {[location, hijri].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
    </VStack>
  );
}

// Name MUST match the `widgets[].name` in app.json's expo-widgets plugin config.
const PrayerTimesWidget = createWidget<WidgetPayload>('PrayerTimesWidget', PrayerTimesWidgetLayout);

export default PrayerTimesWidget;
