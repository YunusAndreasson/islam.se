// The Android home-screen widget (expo-widgets 58: Glance, laid out with Expo UI's Jetpack
// Compose components). The iOS widget is ./PrayerTimesWidget.tsx; this is its Android twin.
//
// ⚠️ NEVER IMPORT THIS FILE ON iOS. Both files register a widget named 'PrayerTimesWidget' —
// the name app.json's plugin config knows — and createWidget writes the layout under that
// name. Loaded on iOS, this one would overwrite the SwiftUI layout. widget/sync.ts imports it
// only behind a Platform check.
//
// ⚠️ SAME SELF-CONTAINED RULE AS THE iOS LAYOUT. The `'widget'` function is serialised on its
// own and evaluated in a bare JS runtime on every render, where only the Compose components,
// their modifiers and the JSX runtime exist. A module-level constant or an imported helper is
// undefined there. The build-time copy (app.json → android.initialLayout, bundled by the
// layout registry) stubs every non-relative import as well. Keep everything inline.
//
// ⚠️ WHAT GLANCE DOES NOT DO, so nothing below relies on it: `weight` and `clip` are ignored,
// arrangement is start/center/end only (no spaceBetween or spacedBy), a font weight is bold or
// normal, there is no Divider and no ticking timer text. Anything outside Box, Row, Column,
// Spacer, Text, Image and the controls renders "View not found". android-layout.test.ts fails
// on any other component before a device ever sees it.
//
// HOW IT CHOOSES WHAT TO SHOW: see widget/android-snapshot. It is handed the iOS timeline and
// picks the entry in force at render time; past the horizon it says so instead of guessing.
import { Column, Row, Spacer, Text } from '@expo/ui/jetpack-compose';
import {
  background,
  cornerRadius,
  fillMaxSize,
  height,
  padding,
  paddingAll,
  width,
} from '@expo/ui/jetpack-compose/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { AndroidWidgetSnapshot } from '@/widget/android-snapshot';
import type { WidgetPayload } from '@/widget/payload';

function PrayerTimesWidgetAndroidLayout(
  rawSnapshot: AndroidWidgetSnapshot,
  environment: WidgetEnvironment & {
    timeZone?: string;
    fontScale?: number;
    widthDp?: number;
    heightDp?: number;
  },
) {
  'widget';
  // Everything below is INTENTIONALLY inline — see the file header.

  // Widget runtimes evaluate this function in isolation. Mirror the app's paper,
  // ink and highlight tokens here, with an opaque dark equivalent of highlightSoft.
  const LIGHT = {
    paper: '#f6f3ed',
    ink: '#1a1712',
    inkMuted: '#6f6456',
    highlightText: '#805b1f',
    highlightSoft: '#f1e7d0',
  };
  const DARK = {
    paper: '#161a26',
    ink: '#e8e3d8',
    inkMuted: '#c1c6d4',
    highlightText: '#fad486',
    highlightSoft: '#332e2b',
  };

  // The entry in force right now — the same loop as selectEntry in widget/android-snapshot.
  // Null-safe throughout: before the app has pushed anything the props are absent, and a
  // throw here renders an error box on the home screen.
  const snapshot = (rawSnapshot ?? {}) as Partial<AndroidWidgetSnapshot>;
  const entries = Array.isArray(snapshot.entries) ? snapshot.entries : [];
  const validUntil = typeof snapshot.validUntilMs === 'number' ? snapshot.validUntilMs : 0;
  const now = Date.now();
  let payload: Partial<WidgetPayload> = {};
  const zoneChanged = !!snapshot.timeZone && !!environment?.timeZone &&
    snapshot.timeZone !== environment.timeZone;
  if (!zoneChanged && now < validUntil) {
    let current: AndroidWidgetSnapshot['entries'][number] | undefined;
    for (const entry of entries) {
      if (!entry || !Number.isFinite(entry.fromMs)) continue;
      if (entry.fromMs > now) break;
      current = entry;
    }
    payload = current?.payload ?? {};
  }

  const preference = snapshot.theme ?? payload.theme ?? entries[0]?.payload?.theme;
  const theme =
    preference === 'light' || preference === 'dark'
      ? preference
      : environment?.colorScheme === 'dark'
        ? 'dark'
        : 'light';
  const c = theme === 'dark' ? DARK : LIGHT;
  const root = [fillMaxSize(), background(c.paper), cornerRadius(16), paddingAll(12)];

  const rows = Array.isArray(payload.rows)
    ? payload.rows.filter((row) => row && typeof row.arabic === 'string' && typeof row.time === 'string')
    : [];

  // Nothing to show yet, or the snapshot has run past its horizon: a calm placeholder rather
  // than a prayer that may already have passed.
  if (rows.length === 0) {
    return (
      <Column modifiers={root} verticalArrangement="center">
        <Text style={{ fontSize: 20, fontWeight: 'bold' }} color={c.ink}>
          Bönetider
        </Text>
        <Spacer modifiers={[height(4)]} />
        <Text style={{ fontSize: 13 }} color={c.inkMuted}>
          Öppna appen för att läsa in dagens bönetider.
        </Text>
      </Column>
    );
  }

  const nextArabic = typeof payload.nextArabic === 'string' ? payload.nextArabic : '';
  const nextTime = typeof payload.nextTime === 'string' && payload.nextTime ? payload.nextTime : '–';
  const nextRow = rows.find((row) => row.isNext);
  const kind = nextRow?.isMarker ? 'Nästa tid' : 'Nästa bön';
  // Post-ʿIshāʾ the hero is tomorrow's Fajr — said the way the iOS medium widget says it.
  const eyebrow = !nextArabic ? 'Bönetider' : payload.nextIsTomorrow === true ? 'I morgon' : kind;
  const location = typeof payload.location === 'string' ? payload.location : '';
  const hijri = typeof payload.hijri === 'string' ? payload.hijri : '';
  // A single context line, as on iOS. Readability wins over fitting two labels
  // into the narrow hero; the Hijri date is a fallback when no location is known.
  const footer = location || hijri;

  const scale = Math.max(1, environment?.fontScale ?? 1);
  const nameWidth = Math.ceil(64 * scale);
  const timeWidth = Math.ceil(48 * scale);
  const scheduleWidth = nameWidth + timeWidth + 12;
  const heroWidth = scale > 1 ? 124 : 120;
  const compact = heroWidth + 12 + scheduleWidth + 24 > (environment?.widthDp ?? 280) ||
    6 * 17 * scale + 24 > (environment?.heightDp ?? 128);
  const hero = (
      <Column modifiers={compact ? [] : [width(heroWidth)]}>
        <Text style={{ fontSize: 12 }} color={c.highlightText} maxLines={1}>
          {eyebrow}
        </Text>
        {nextArabic ? (
          <>
            <Text style={{ fontSize: 18, fontWeight: 'bold' }} color={c.ink} maxLines={1}>
              {nextArabic}
            </Text>
            <Text style={{ fontSize: 34, fontWeight: 'bold' }} color={c.ink} maxLines={1}>
              {nextTime}
            </Text>
          </>
        ) : (
          <Text style={{ fontSize: 13 }} color={c.ink}>Ingen kommande tid</Text>
        )}
        {footer ? (
          <Column modifiers={[padding(0, 4, 0, 0)]}>
            <Text style={{ fontSize: 12 }} color={c.inkMuted} maxLines={1}>
              {footer}
            </Text>
          </Column>
        ) : null}
      </Column>
  );
  if (compact) return <Column modifiers={root} verticalArrangement="center">{hero}</Column>;

  return (
    <Row modifiers={root} verticalAlignment="center" horizontalArrangement="center">
      {hero}
      <Spacer modifiers={[width(12)]} />
      <Column verticalArrangement="center">
        {rows.map((row) => {
          const color = row.isNext ? c.highlightText : row.isMarker ? c.inkMuted : c.ink;
          const weight = row.isNext ? ('bold' as const) : ('normal' as const);
          return (
            <Row
              key={row.key}
              // The launcher can reuse a row across updates. Always set its background
              // so a previously highlighted prayer returns to the paper color.
              modifiers={[background(row.isNext ? c.highlightSoft : c.paper), cornerRadius(6), width(scheduleWidth), padding(6, 0, 6, 0)]}
              verticalAlignment="center"
            >
              <Text
                style={{ fontSize: 13, fontWeight: weight }}
                modifiers={[width(nameWidth)]}
                color={color}
                maxLines={1}
              >
                {row.arabic}
              </Text>
              <Text
                style={{ fontSize: 13, fontWeight: weight, textAlign: 'end' }}
                modifiers={[width(timeWidth)]}
                color={color}
                maxLines={1}
              >
                {row.time}
              </Text>
            </Row>
          );
        })}
      </Column>
    </Row>
  );
}

// Name MUST match the `widgets[].name` in app.json's expo-widgets plugin config.
const PrayerTimesWidgetAndroid = createWidget<AndroidWidgetSnapshot>(
  'PrayerTimesWidget',
  PrayerTimesWidgetAndroidLayout,
);

export default PrayerTimesWidgetAndroid;
