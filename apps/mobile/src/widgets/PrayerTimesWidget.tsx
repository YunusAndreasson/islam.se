// The iOS home-screen + lock-screen widget (WidgetKit), built with Expo UI / SwiftUI
// components.
//
// ⚠️ CRITICAL ARCHITECTURE CONSTRAINT — the `'widget'` layout MUST be self-contained.
// babel-preset-expo's widgets-plugin serialises ONLY this function's own source to a
// string (generator.generate(fn).code). At render time the iOS extension evaluates
// that string STANDALONE — `evaluateScript("(" + layout + ")")` in WidgetsJSRuntime.swift
// — in a JSContext whose globalThis holds only the @expo/ui components + modifiers + the
// jsx runtime. Nothing from THIS module's scope is in that bundle. So the layout may
// reference ONLY: its params, @expo/ui imports (VStack/Text/font/… — provided on
// globalThis), and identifiers it defines INSIDE its own body. Any reference to a
// module-level helper, constant, or imported value (a palette, a shared `normalize`) is
// undefined at render → ReferenceError → the widget renders BLACK (cf. expo/expo#46200). Keep everything inline. Because the layout string lives in the app's
// MAIN JS bundle (written to the app group by createWidget at launch), fixes ship via EAS
// Update (OTA) — no native rebuild. Only the @expo/ui runtime is build-time, and it's
// already complete.
import {
  AccessoryWidgetBackground,
  Divider,
  HStack,
  Spacer,
  Text,
  VStack,
  ZStack,
} from '@expo/ui/swift-ui';
import {
  containerBackground,
  environment,
  font,
  foregroundStyle,
  lineLimit,
  minimumScaleFactor,
  monospacedDigit,
  truncationMode,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { WidgetPayload } from '@/widget/payload';

function PrayerTimesWidgetLayout(rawPayload: WidgetPayload, widgetEnvironment: WidgetEnvironment) {
  'widget';
  // Everything below is INTENTIONALLY inline — see the file header. Do not lift any of
  // this to module scope or the widget goes black.

  // Brand palette (mirrors src/theme/tokens.ts — only the tokens this widget uses).
  const LIGHT = {
    paper: '#f6f3ed',
    ink: '#1a1712',
    inkMuted: '#6f6456',
    inkFaint: '#8c8170',
    highlightText: '#805b1f',
  };
  // Kept byte-for-byte in step with darkPalette — see the APCA note there for why these
  // three moved (a widget on a dark home screen is exactly where thin tiers show).
  const DARK = {
    paper: '#161a26',
    ink: '#e8e3d8',
    inkMuted: '#c1c6d4',
    inkFaint: '#b1b8cd',
    highlightText: '#fad486',
  };
  // iOS 18 tinted home screens ('accented') and the Lock Screen ('vibrant') desaturate
  // the widget — the brass-vs-ink hue hierarchy collapses, so it rides on white opacity
  // + weight instead. The system supplies/replaces the background in both modes.
  const MONO = {
    paper: '#00000000',
    ink: '#ffffff',
    inkMuted: '#ffffffbf',
    inkFaint: '#ffffff8c',
    highlightText: '#ffffff',
  };
  // Null/partial-safe: WidgetKit renders a placeholder with null props before the app
  // pushes data; reading fields off null would throw → black.
  const p = (rawPayload ?? {}) as Partial<WidgetPayload>;
  const mode = widgetEnvironment.widgetRenderingMode;
  const desaturated = mode === 'accented' || mode === 'vibrant';
  const theme =
    p.theme === 'light' || p.theme === 'dark' ? p.theme : (widgetEnvironment.colorScheme ?? 'light');
  const c = desaturated ? MONO : theme === 'dark' ? DARK : LIGHT;

  const rows = Array.isArray(p.rows) ? p.rows : [];
  const location = typeof p.location === 'string' ? p.location : '';
  const hijri = typeof p.hijri === 'string' ? p.hijri : '';
  const nextArabic = typeof p.nextArabic === 'string' ? p.nextArabic : '';
  const nextTime = typeof p.nextTime === 'string' && p.nextTime ? p.nextTime : '–';
  const nextAtMs = typeof p.nextAtMs === 'number' ? p.nextAtMs : null;
  const nextRow = rows.find((r) => r.isNext);
  const nextKindLabel = nextRow?.isMarker ? 'Nästa tid' : 'Nästa bön';
  // Post-Isha the hero shows tomorrow's Fajr — say so (app convention: "i morgon").
  const tomorrow = p.nextIsTomorrow === true;
  const eyebrowLabel = tomorrow ? 'I morgon' : nextKindLabel;

  // Tabular figures for every clock/countdown — the widget twin of the app's `mono`
  // token (tabular-nums): schedule times column-align, the countdown doesn't jitter.
  const tabular = monospacedDigit();
  // Shared root chrome: the iOS-17 widget background. The system's own content margins
  // (~16pt, adaptive per device/family) provide the inset — no manual padding on top,
  // which would double it. +native-intent consumes this link and dismisses to the
  // existing map on warm opens, avoiding a second copy of Bönetider in the stack.
  const destination = widgetURL('islamse:///widget/prayer-times');
  const root = [containerBackground(c.paper, 'widget'), destination];

  // Sentence case follows the app's quiet section headings. Prayers carry no
  // glyph anywhere in the app (see components/ui/Icon), so the name below is what says
  // which prayer it is, and the eyebrow, name, time and countdown share one leading edge.
  const eyebrow = (label: string) => (
    <Text modifiers={[font({ size: 12, weight: 'medium' }), foregroundStyle(c.inkMuted), lineLimit(1)]}>
      {label}
    </Text>
  );
  // Keep names and clock values on one line; allow a little fitting on narrow layouts.
  const fit = [lineLimit(1), minimumScaleFactor(0.75)];
  // Location gives the times their context. Keep one readable line, without a
  // competing calendar date; if location is unavailable, the Hijri date can fill it.
  const footer = location || hijri;
  const footerStyle = [font({ size: 12 }), foregroundStyle(c.inkMuted), lineLimit(1), truncationMode('tail')];

  // ── Lock screen (vibrant): one glanceable line/card per accessory family ─────────
  if (widgetEnvironment.widgetFamily === 'accessoryInline') {
    // A single system-styled line next to the clock — keep it terse.
    return (
      <Text modifiers={[font({ size: 13, weight: 'semibold' }), tabular, destination]}>
        {(nextArabic || 'Bönetider') + (nextTime !== '–' ? ` ${nextTime}` : '')}
      </Text>
    );
  }
  if (widgetEnvironment.widgetFamily === 'accessoryCircular') {
    // The time is the reason to glance here, so it takes the circle: big and bold, with the
    // prayer's name as a small label over it (a glyph used to sit there, and a glyph could
    // not tell Fajr from ʿIshāʾ at 14 pt anyway).
    return (
      <ZStack modifiers={[containerBackground('#00000000', 'widget'), destination]}>
        <AccessoryWidgetBackground />
        <VStack alignment="center" spacing={0}>
          {nextArabic ? (
            <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(c.inkMuted), ...fit]}>
              {nextArabic}
            </Text>
          ) : null}
          <Text modifiers={[font({ size: 17, weight: 'bold' }), tabular, foregroundStyle(c.ink), ...fit]}>
            {nextTime}
          </Text>
        </VStack>
      </ZStack>
    );
  }
  if (widgetEnvironment.widgetFamily === 'accessoryRectangular') {
    return (
      <VStack alignment="leading" spacing={1} modifiers={[containerBackground('#00000000', 'widget'), destination]}>
        {eyebrow(eyebrowLabel)}
        <HStack spacing={6} alignment="firstTextBaseline">
          <Text modifiers={[font({ size: 15, weight: 'semibold' }), foregroundStyle(c.ink), ...fit]}>
            {nextArabic || 'Bönetider'}
          </Text>
          <Text modifiers={[font({ size: 15, weight: 'semibold' }), tabular, foregroundStyle(c.ink), ...fit]}>
            {nextTime}
          </Text>
        </HStack>
        {nextAtMs != null ? (
          <Text
            date={new Date(nextAtMs)}
            dateStyle="relative"
            modifiers={[environment('locale', 'sv_SE'), font({ size: 12 }), tabular, foregroundStyle(c.inkMuted), lineLimit(1)]}
          />
        ) : null}
      </VStack>
    );
  }

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

  // iOS 26 can request a distance-readable presentation. Keep the next prayer and
  // its time, without the schedule, subtitle or small footer competing with them.
  if (widgetEnvironment.levelOfDetail === 'simplified') {
    return (
      <VStack alignment="leading" spacing={6} modifiers={root}>
        {eyebrow(eyebrowLabel)}
        <Spacer />
        <Text modifiers={[font({ size: 26, weight: 'bold' }), foregroundStyle(c.highlightText), ...fit]}>
          {nextArabic || 'Bönetider'}
        </Text>
        <Text modifiers={[font({ size: 42, weight: 'bold' }), tabular, foregroundStyle(c.ink), ...fit]}>
          {nextTime}
        </Text>
        <Spacer />
      </VStack>
    );
  }

  // ── Small (2×2): one focused message — next prayer, big time, countdown ──────────
  // Eyebrow pinned top, the name/time/countdown block centred, location pinned bottom.
  if (widgetEnvironment.widgetFamily === 'systemSmall') {
    return (
      <VStack alignment="leading" spacing={3} modifiers={root}>
        {eyebrow(eyebrowLabel)}
        <Spacer />
        <Text modifiers={[font({ size: 22, weight: 'semibold' }), foregroundStyle(c.highlightText), ...fit]}>
          {nextArabic || 'Bönetider'}
        </Text>
        <Text modifiers={[font({ size: 38, weight: 'medium' }), tabular, foregroundStyle(c.ink), ...fit]}>
          {nextTime}
        </Text>
        {nextAtMs != null ? (
          <Text
            date={new Date(nextAtMs)}
            dateStyle="relative"
            modifiers={[environment('locale', 'sv_SE'), font({ size: 13 }), tabular, foregroundStyle(c.inkMuted), lineLimit(1)]}
          />
        ) : null}
        <Spacer />
        {footer ? <Text modifiers={footerStyle}>{footer}</Text> : null}
      </VStack>
    );
  }

  // ── Medium (4×2): hero column │ schedule column, centred, footer pinned bottom ───
  return (
    <VStack alignment="leading" spacing={0} modifiers={root}>
      <Spacer />
      <HStack spacing={14} alignment="center">
        {/* Hero (left) — eyebrow, prayer name (brass), big time, live countdown */}
        <VStack alignment="leading" spacing={4}>
          {eyebrow(eyebrowLabel)}
          <Text modifiers={[font({ size: 22, weight: 'semibold' }), foregroundStyle(c.highlightText), ...fit]}>
            {nextArabic || 'Bönetider'}
          </Text>
          <Text modifiers={[font({ size: 36, weight: 'medium' }), tabular, foregroundStyle(c.ink), ...fit]}>
            {nextTime}
          </Text>
          {nextAtMs != null ? (
            <Text
              date={new Date(nextAtMs)}
              dateStyle="relative"
              modifiers={[environment('locale', 'sv_SE'), font({ size: 13 }), tabular, foregroundStyle(c.inkMuted), lineLimit(1)]}
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
                <Text modifiers={[font({ size: 13, weight: w }), foregroundStyle(col), ...fit]}>
                  {row.arabic}
                </Text>
                <Spacer />
                <Text modifiers={[font({ size: 13, weight: w }), tabular, foregroundStyle(col), ...fit]}>
                  {row.time}
                </Text>
              </HStack>
            );
          })}
        </VStack>
      </HStack>
      <Spacer />
      {footer ? <Text modifiers={footerStyle}>{footer}</Text> : null}
    </VStack>
  );
}

// Name MUST match the `widgets[].name` in app.json's expo-widgets plugin config.
const PrayerTimesWidget = createWidget<WidgetPayload>('PrayerTimesWidget', PrayerTimesWidgetLayout);

export default PrayerTimesWidget;
