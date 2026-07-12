// The prayer-countdown Live Activity (Lock Screen banner + Dynamic Island), built with
// Expo UI / SwiftUI components via expo-widgets' ActivityKit bridge.
//
// ⚠️ SAME ARCHITECTURE CONSTRAINT AS PrayerTimesWidget.tsx — the `'widget'` layout is
// serialised standalone and evaluated in a bare JSContext inside the widget extension.
// Every palette, map and helper must live INSIDE the layout function body; a module-scope
// reference is undefined at render and the activity renders blank/black.
//
// The countdown itself is `Text timerInterval … countsDown` — rendered live BY THE SYSTEM,
// so it ticks every second with zero JS execution, no pushes and no background tasks.
// Known limitation (no push infra, no background JS): when the countdown reaches 00:00 at
// prayer time the activity lingers until the next app foreground ends/replaces it — see
// src/widget/live-activity.ts. Push-to-start / APNs updates are a future follow-up.
import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  font,
  foregroundStyle,
  kerning,
  monospacedDigit,
  multilineTextAlignment,
  padding,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';
import type { SFSymbol } from 'sf-symbols-typescript';

import type { PrayerKey } from '../lib/prayer-times';

/** Plain-JSON props for one activity — set once at start (or via update on foreground);
 *  the countdown needs no further updates because the system renders it. */
export interface PrayerActivityProps {
  /** Prayer slot key, for the SF-symbol icon. */
  nextKey: PrayerKey;
  /** Transliterated name, e.g. "Maghrib". */
  nextArabic: string;
  /** Swedish name, e.g. "Solnedgångsbönen". */
  nextSwedish: string;
  /** 24-hour Europe/Stockholm clock time. */
  nextTime: string;
  /** The prayer's epoch ms — upper bound of the live countdown. */
  nextAtMs: number;
  /** When the activity was started/refreshed — lower bound of the countdown. */
  startedAtMs: number;
  /** True when the slot is a time marker (sunrise), not an obligatory prayer. */
  isMarker: boolean;
}

function PrayerLiveActivityLayout(
  rawProps: PrayerActivityProps,
  environment: LiveActivityEnvironment,
) {
  'widget';
  // Everything below is INTENTIONALLY inline — see the file header.

  // Brand palette (mirrors src/theme/tokens.ts), tuned for a DARK backdrop. Both the
  // Lock Screen banner AND the Dynamic Island render on a dark vibrant material — the
  // banner's background is the system material, NOT the wallpaper, and does NOT follow
  // the device's Light/Dark appearance. An earlier version branched on
  // `environment.colorScheme` and, in Light appearance, painted near-black "light"
  // inks (#1a1712 / #6f6456) onto that dark material — the prayer name, target time and
  // countdown came out near-invisible. So we use ONE bright, warm palette everywhere.
  //
  // Always-On Display (iPhone 14 Pro and later): iOS sets `isLuminanceReduced` while the
  // Lock Screen is in its dimmed always-on state, and Apple's HIG asks the activity to
  // pull its OWN luminance back there (OLED power + burn-in) rather than blaze at full
  // brightness. We keep the exact same warm hue hierarchy but at a lower key; the live,
  // interactive Lock Screen and the Dynamic Island keep the full-brightness palette.
  // (colorScheme is still ignored on purpose — the material is dark in both appearances.)
  const dimmed = environment?.isLuminanceReduced === true;
  const C = dimmed
    ? {
        ink: '#b8b2a6', // dimmed cream — primary numerals (the big target time)
        inkMuted: '#928a7c', // dimmed countdown + Swedish subtitle
        inkFaint: '#7c7466', // dimmed section label ("NÄSTA BÖN")
        highlight: '#a07a39', // dimmed gold — the prayer icon
        highlightText: '#a47d3a', // dimmed gold — the prayer name
      }
    : {
        ink: '#f0ebe0', // bright cream — primary numerals (the big target time)
        inkMuted: '#c2b8a6', // warm light grey — countdown + Swedish subtitle
        inkFaint: '#a79d8b', // warm muted — the small section label ("NÄSTA BÖN")
        highlight: '#d2a04c', // bright gold — the prayer icon
        highlightText: '#d8a44c', // bright gold — the prayer name
      };
  const SF: Record<string, SFSymbol> = {
    fajr: 'moon.stars.fill',
    sunrise: 'sunrise.fill',
    dhuhr: 'sun.max.fill',
    asr: 'sun.min.fill',
    maghrib: 'sunset.fill',
    isha: 'moon.fill',
  };

  // Null/partial-safe, like the widget: never throw inside the extension.
  const p = (rawProps ?? {}) as Partial<PrayerActivityProps>;

  const icon: SFSymbol = (typeof p.nextKey === 'string' && SF[p.nextKey]) || SF.fajr;
  const name = typeof p.nextArabic === 'string' && p.nextArabic ? p.nextArabic : 'Bönetider';
  const swedish = typeof p.nextSwedish === 'string' ? p.nextSwedish : '';
  const time = typeof p.nextTime === 'string' && p.nextTime ? p.nextTime : '—';
  const nextAtMs = typeof p.nextAtMs === 'number' ? p.nextAtMs : null;
  const startedAtMs = typeof p.startedAtMs === 'number' ? p.startedAtMs : null;
  const kindLabel = p.isMarker === true ? 'NÄSTA TID' : 'NÄSTA BÖN';

  const tabular = monospacedDigit();
  const tracked = kerning(0.5);
  // A self-updating timer Text reserves the width of its WIDEST value over the whole
  // interval but renders leading-aligned inside that box — so once it ticks under
  // 10 min ("9:59" is a glyph narrower than "25:07") a gap opens on the trailing edge.
  // Right-align it so the digits always hug the right edge (matters most in the
  // Dynamic Island, where that gap reads as stray right padding around the camera).
  const trailingText = multilineTextAlignment('trailing');

  // The live countdown — system-rendered, ticks on its own, stops at 00:00.
  const countdown = (size: number, color: string) =>
    nextAtMs != null && startedAtMs != null ? (
      <Text
        timerInterval={{ lower: new Date(startedAtMs), upper: new Date(nextAtMs) }}
        countsDown
        modifiers={[
          font({ size, weight: 'semibold' }),
          tabular,
          trailingText,
          foregroundStyle(color),
        ]}
      />
    ) : (
      <Text modifiers={[font({ size, weight: 'semibold' }), foregroundStyle(color)]}>—</Text>
    );

  return {
    // Lock Screen / notification banner — system supplies the material background.
    // Laid out as aligned ROWS, not two free-floating columns: the target time rides
    // the prayer name's baseline and the countdown rides the Swedish subtitle's, so
    // every right-hand value lines up with its left-hand label instead of the right
    // column floating at the HStack's vertical centre against a taller left column.
    banner: (
      <HStack spacing={14} alignment="center" modifiers={[padding({ all: 16 })]}>
        <Image systemName={icon} size={26} color={C.highlight} />
        <VStack alignment="leading" spacing={3}>
          <Text
            modifiers={[font({ size: 11, weight: 'semibold' }), tracked, foregroundStyle(C.inkFaint)]}>
            {kindLabel}
          </Text>
          <HStack alignment="firstTextBaseline" spacing={10}>
            <Text modifiers={[font({ size: 19, weight: 'bold' }), foregroundStyle(C.highlightText)]}>
              {name}
            </Text>
            <Spacer />
            <Text modifiers={[font({ size: 22, weight: 'bold' }), tabular, foregroundStyle(C.ink)]}>
              {time}
            </Text>
          </HStack>
          <HStack alignment="firstTextBaseline" spacing={10}>
            {swedish ? (
              <Text modifiers={[font({ size: 12 }), foregroundStyle(C.inkMuted)]}>{swedish}</Text>
            ) : null}
            <Spacer />
            {countdown(14, C.inkMuted)}
          </HStack>
        </VStack>
      </HStack>
    ),
    // Dynamic Island — compact: icon + prayer name ↔ ticking countdown around the
    // camera. The name rides in the leading slot so the next prayer is identifiable
    // at a glance without long-pressing to expand.
    compactLeading: (
      <HStack spacing={4} alignment="center">
        <Image systemName={icon} size={14} color={C.highlight} />
        <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(C.highlightText)]}>
          {name}
        </Text>
      </HStack>
    ),
    compactTrailing: countdown(13, C.ink),
    minimal: <Image systemName={icon} size={13} color={C.highlight} />,
    // Dynamic Island — expanded (long-press).
    expandedLeading: (
      <HStack spacing={6} alignment="center">
        <Image systemName={icon} size={16} color={C.highlight} />
        <Text modifiers={[font({ size: 16, weight: 'bold' }), foregroundStyle(C.highlightText)]}>
          {name}
        </Text>
      </HStack>
    ),
    expandedTrailing: (
      <Text modifiers={[font({ size: 16, weight: 'bold' }), tabular, foregroundStyle(C.ink)]}>
        {time}
      </Text>
    ),
    expandedBottom: (
      <HStack spacing={6} alignment="firstTextBaseline">
        <Text modifiers={[font({ size: 12 }), foregroundStyle(C.inkFaint)]}>om</Text>
        {countdown(26, C.ink)}
      </HStack>
    ),
  };
}

// Name MUST stay stable — it identifies this activity type's instances across launches.
const PrayerLiveActivity = createLiveActivity<PrayerActivityProps>(
  'PrayerLiveActivity',
  PrayerLiveActivityLayout,
);

export default PrayerLiveActivity;
