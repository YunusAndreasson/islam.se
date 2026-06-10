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

  // Brand palette (mirrors src/theme/tokens.ts). The banner follows the system colour
  // scheme; the Dynamic Island is always black, so island sections use the DARK tones.
  const LIGHT = {
    ink: '#1a1712',
    inkMuted: '#6f6456',
    inkFaint: '#8c8170',
    highlight: '#b8862f',
    highlightText: '#805b1f',
  };
  const DARK = {
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

  // Null/partial-safe, like the widget: never throw inside the extension.
  const p = (rawProps ?? {}) as Partial<PrayerActivityProps>;
  const c = environment.colorScheme === 'dark' ? DARK : LIGHT;
  const d = DARK; // island sections — always on black

  const icon: SFSymbol = (typeof p.nextKey === 'string' && SF[p.nextKey]) || SF.fajr;
  const name = typeof p.nextArabic === 'string' && p.nextArabic ? p.nextArabic : 'Bönetider';
  const swedish = typeof p.nextSwedish === 'string' ? p.nextSwedish : '';
  const time = typeof p.nextTime === 'string' && p.nextTime ? p.nextTime : '—';
  const nextAtMs = typeof p.nextAtMs === 'number' ? p.nextAtMs : null;
  const startedAtMs = typeof p.startedAtMs === 'number' ? p.startedAtMs : null;
  const kindLabel = p.isMarker === true ? 'NÄSTA TID' : 'NÄSTA BÖN';

  const tabular = monospacedDigit();
  const tracked = kerning(0.5);

  // The live countdown — system-rendered, ticks on its own, stops at 00:00.
  const countdown = (size: number, color: string) =>
    nextAtMs != null && startedAtMs != null ? (
      <Text
        timerInterval={{ lower: new Date(startedAtMs), upper: new Date(nextAtMs) }}
        countsDown
        modifiers={[font({ size, weight: 'semibold' }), tabular, foregroundStyle(color)]}
      />
    ) : (
      <Text modifiers={[font({ size, weight: 'semibold' }), foregroundStyle(color)]}>—</Text>
    );

  return {
    // Lock Screen / notification banner — system supplies the material background.
    banner: (
      <HStack spacing={12} alignment="center" modifiers={[padding({ all: 16 })]}>
        <Image systemName={icon} size={26} color={c.highlight} />
        <VStack alignment="leading" spacing={2}>
          <Text
            modifiers={[font({ size: 11, weight: 'semibold' }), tracked, foregroundStyle(c.inkFaint)]}>
            {kindLabel}
          </Text>
          <Text modifiers={[font({ size: 19, weight: 'bold' }), foregroundStyle(c.highlightText)]}>
            {name}
          </Text>
          {swedish ? (
            <Text modifiers={[font({ size: 12 }), foregroundStyle(c.inkMuted)]}>{swedish}</Text>
          ) : null}
        </VStack>
        <Spacer />
        <VStack alignment="trailing" spacing={2}>
          <Text modifiers={[font({ size: 22, weight: 'bold' }), tabular, foregroundStyle(c.ink)]}>
            {time}
          </Text>
          {countdown(14, c.inkMuted)}
        </VStack>
      </HStack>
    ),
    // Dynamic Island — compact: icon ↔ ticking countdown around the camera.
    compactLeading: <Image systemName={icon} size={14} color={d.highlight} />,
    compactTrailing: countdown(13, d.ink),
    minimal: <Image systemName={icon} size={13} color={d.highlight} />,
    // Dynamic Island — expanded (long-press).
    expandedLeading: (
      <HStack spacing={6} alignment="center">
        <Image systemName={icon} size={16} color={d.highlight} />
        <Text modifiers={[font({ size: 16, weight: 'bold' }), foregroundStyle(d.highlightText)]}>
          {name}
        </Text>
      </HStack>
    ),
    expandedTrailing: (
      <Text modifiers={[font({ size: 16, weight: 'bold' }), tabular, foregroundStyle(d.ink)]}>
        {time}
      </Text>
    ),
    expandedBottom: (
      <HStack spacing={6} alignment="firstTextBaseline">
        <Text modifiers={[font({ size: 12 }), foregroundStyle(d.inkFaint)]}>om</Text>
        {countdown(26, d.ink)}
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
