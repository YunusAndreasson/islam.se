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
// `normalize`) is undefined at render → ReferenceError → the widget renders BLACK (cf.
// expo/expo#46200). Keep everything inline. Because the layout string lives in the app's
// MAIN JS bundle (written to the app group by createWidget at launch), fixes ship via EAS
// Update (OTA) — no native rebuild. Only the @expo/ui runtime is build-time, and it's
// already complete.
import { Divider, HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { containerBackground, font, foregroundStyle, padding } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { SFSymbol } from 'sf-symbols-typescript';

import type { WidgetPayload } from '../widget/payload';

function PrayerTimesWidgetLayout(rawPayload: WidgetPayload, environment: WidgetEnvironment) {
  'widget';
  // Everything below is INTENTIONALLY inline — see the file header. Do not lift any of
  // this to module scope or the widget goes black.

  // Brand palette (mirrors src/theme/tokens.ts — only the tokens this widget uses).
  const LIGHT = {
    paper: '#f6f3ed',
    ink: '#1a1712',
    inkMuted: '#6f6456',
    inkFaint: '#8c8170',
    highlight: '#b8862f',
    highlightText: '#805b1f',
  };
  const DARK = {
    paper: '#161a26',
    ink: '#e8e3d8',
    inkMuted: '#a8acba',
    inkFaint: '#7a8094',
    highlight: '#c89a48',
    highlightText: '#c89a48',
  };
  const SF: Record<string, SFSymbol> = {
    fajr: 'moon.stars.fill',
    sunrise: 'sunrise.fill',
    dhuhr: 'sun.max.fill',
    asr: 'sun.min.fill',
    maghrib: 'sunset.fill',
    isha: 'moon.fill',
  };

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
  const nextIcon: SFSymbol = nextRow ? SF[nextRow.key] : SF.fajr;
  const nextKindLabel = nextRow?.isMarker ? 'NÄSTA TID' : 'NÄSTA BÖN';

  // Shared root chrome: even padding + the iOS-17 widget background. No widgetURL —
  // a bare widget tap already foregrounds the app; an `islamse://` deep link instead
  // presented a fresh screen sliding in over the running app.
  const root = [padding({ all: 16 }), containerBackground(c.paper, 'widget')];

  // The eyebrow row: icon + "NÄSTA BÖN" / "NÄSTA TID" for sunrise. Keeping the
  // icon HERE (not beside the name) lets the name, time and countdown below all
  // share one clean leading edge.
  const eyebrow = (iconSize: number) => (
    <HStack spacing={5} alignment="center">
      {nextArabic ? <Image systemName={nextIcon} size={iconSize} color={c.highlight} /> : null}
      <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(c.inkFaint)]}>
        {nextKindLabel}
      </Text>
    </HStack>
  );

  // No schedule yet → a branded placeholder, never a black box.
  if (rows.length === 0) {
    return (
      <VStack alignment="leading" spacing={6} modifiers={root}>
        <Spacer />
        <Text modifiers={[font({ size: 19, weight: 'bold' }), foregroundStyle(c.highlightText)]}>
          Bönetider
        </Text>
        <Text modifiers={[font({ size: 13 }), foregroundStyle(c.inkMuted)]}>
          Öppna appen för att läsa in dagens bönetider.
        </Text>
        <Spacer />
      </VStack>
    );
  }

  // ── Small (2×2): one focused message — next prayer, big time, countdown ──────────
  // Eyebrow pinned top, the name/time/countdown block centred, location pinned bottom.
  if (environment.widgetFamily === 'systemSmall') {
    return (
      <VStack alignment="leading" spacing={3} modifiers={root}>
        {eyebrow(13)}
        <Spacer />
        <Text modifiers={[font({ size: 22, weight: 'bold' }), foregroundStyle(c.highlightText)]}>
          {nextArabic || 'Bönetider'}
        </Text>
        <Text modifiers={[font({ size: 38, weight: 'bold' }), foregroundStyle(c.ink)]}>
          {nextTime}
        </Text>
        {nextAtMs != null ? (
          <Text
            date={new Date(nextAtMs)}
            dateStyle="relative"
            modifiers={[font({ size: 13 }), foregroundStyle(c.inkMuted)]}
          />
        ) : null}
        <Spacer />
        {location ? (
          <Text modifiers={[font({ size: 11, weight: 'medium' }), foregroundStyle(c.inkFaint)]}>
            {location}
          </Text>
        ) : null}
      </VStack>
    );
  }

  // ── Medium (4×2): hero column │ schedule column, centred, footer pinned bottom ───
  return (
    <VStack alignment="leading" spacing={0} modifiers={root}>
      <Spacer />
      <HStack spacing={14} alignment="center">
        {/* Hero (left) — eyebrow, prayer name (brass), big time, live countdown */}
        <VStack alignment="leading" spacing={3}>
          {eyebrow(14)}
          <Text modifiers={[font({ size: 22, weight: 'bold' }), foregroundStyle(c.highlightText)]}>
            {nextArabic || 'Bönetider'}
          </Text>
          {nextSwedish ? (
            <Text modifiers={[font({ size: 12 }), foregroundStyle(c.inkMuted)]}>{nextSwedish}</Text>
          ) : null}
          <Text modifiers={[font({ size: 29, weight: 'bold' }), foregroundStyle(c.ink)]}>
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
        <Divider />
        {/* Schedule (right) — names left, times right-aligned, next prayer in brass */}
        <VStack alignment="leading" spacing={5}>
          {rows.map((row) => {
            const col = row.isNext ? c.highlightText : row.isMarker ? c.inkFaint : c.ink;
            const w: 'semibold' | 'regular' = row.isNext ? 'semibold' : 'regular';
            return (
              <HStack key={row.key} spacing={12} alignment="firstTextBaseline">
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
        <Text modifiers={[font({ size: 11, weight: 'medium' }), foregroundStyle(c.inkFaint)]}>
          {[location, hijri].filter(Boolean).join('   ·   ')}
        </Text>
      ) : null}
    </VStack>
  );
}

// Name MUST match the `widgets[].name` in app.json's expo-widgets plugin config.
const PrayerTimesWidget = createWidget<WidgetPayload>('PrayerTimesWidget', PrayerTimesWidgetLayout);

export default PrayerTimesWidget;
