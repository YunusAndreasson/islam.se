// The prayer-countdown Live Activity (Lock Screen banner + Dynamic Island), built with
// Expo UI / SwiftUI components via expo-widgets' ActivityKit bridge.
//
// ⚠️ SAME ARCHITECTURE CONSTRAINT AS PrayerTimesWidget.tsx — the `'widget'` layout is
// serialised standalone and evaluated in a bare JSContext inside the widget extension.
// Every palette and helper must live INSIDE the layout function body; a module-scope
// reference is undefined at render and the activity renders blank/black.
//
// The countdown itself is `Text timerInterval … countsDown` — rendered live BY THE SYSTEM,
// so it ticks every second with zero JS execution, no pushes and no background tasks.
//
// AT THE PRAYER. Every activity carries a `staleDate` at its prayer (see
// widget/live-activity), and ActivityKit marks the content stale at that instant with the
// app closed. `environment.isStale` (expo-widgets ≥ 57.0.12) is what this layout reads to
// replace the finished countdown with »Dags för X« and the prayer after it — the same words
// as the lead-0 alert — until the app or the background task rolls the activity over to the
// next prayer or ends it. Before that existed the countdown sat at 0:00 until the app was
// next opened, and the workaround (ending every activity at start with a dismissal date)
// cost the whole Dynamic Island presentation below; activities now stay active.
import { HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  font,
  foregroundStyle,
  kerning,
  lineLimit,
  minimumScaleFactor,
  monospacedDigit,
  multilineTextAlignment,
  padding,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

import type { PrayerKey } from '@/lib/prayer-times';

/** Plain-JSON props for one activity — set at start and on each roll-over to the next
 *  prayer; the countdown, and the flip to the stale view, need no updates in between. */
export interface PrayerActivityProps {
  /** Prayer slot key. Not drawn — it is part of the activity's content identity (see
   *  activityContentKey in widget/live-activity). */
  nextKey: PrayerKey;
  /** Transliterated name, e.g. "Maghrib". */
  nextArabic: string;
  /** Swedish name, e.g. "Solnedgångsbönen". */
  nextSwedish: string;
  /** 24-hour Europe/Stockholm clock time. */
  nextTime: string;
  /** The prayer's epoch ms — upper bound of the live countdown. */
  nextAtMs: number;
  /** Lower bound of the countdown; any instant already past renders identically, so
   *  this is the moment the prayer entered the live-activity window rather than the
   *  moment we started the activity (see buildPrayerActivityProps). */
  startedAtMs: number;
  /** True when the slot is a time marker (sunrise), not an obligatory prayer. */
  isMarker: boolean;
  /** Shown once the prayer has arrived (stale): the lead-0 alert's title, »Dags för ʿAṣr«
   *  or »Fajr-tiden är slut«. Absent on activities started by an older build. */
  arrivedTitle?: string;
  /** The slot after this one, named by the stale view; '' when it could not be resolved. */
  followingArabic?: string;
  followingTime?: string;
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
  //
  // WHY THIS IS A THIRD PALETTE and not a drift. tokens.ts holds the app's two schemes
  // and `brand` holds the mark's; this is a third set because the substrate is neither —
  // a translucent vibrant material whose backdrop is the user's wallpaper, which no
  // measurement here can pin. The golds stay in the app's brass hue family (H≈78 vs the
  // token's 79.6) on purpose. Do NOT "unify" these onto darkPalette or brand.gold: the
  // dimmed set in particular measures Lc 28–35 BY DESIGN — that is the HIG asking for a
  // dim always-on render, not a contrast bug, and the APCA floors that govern
  // theme/tokens.ts deliberately do not reach here.
  const dimmed = environment?.isLuminanceReduced === true;
  const C = dimmed
    ? {
        ink: '#b8b2a6', // dimmed cream — primary numerals (the big target time)
        inkMuted: '#928a7c', // dimmed countdown + Swedish subtitle
        inkFaint: '#7c7466', // dimmed section label ("NÄSTA BÖN")
        highlightText: '#a47d3a', // dimmed gold — the prayer name
      }
    : {
        ink: '#f0ebe0', // bright cream — primary numerals (the big target time)
        inkMuted: '#c2b8a6', // warm light grey — countdown + Swedish subtitle
        inkFaint: '#a79d8b', // warm muted — the small section label ("NÄSTA BÖN")
        highlightText: '#d8a44c', // bright gold — the prayer name
      };
  // Null/partial-safe, like the widget: never throw inside the extension.
  const p = (rawProps ?? {}) as Partial<PrayerActivityProps>;

  const name = typeof p.nextArabic === 'string' && p.nextArabic ? p.nextArabic : 'Bönetider';
  const swedish = typeof p.nextSwedish === 'string' ? p.nextSwedish : '';
  const time = typeof p.nextTime === 'string' && p.nextTime ? p.nextTime : '–';
  const nextAtMs = typeof p.nextAtMs === 'number' ? p.nextAtMs : null;
  const startedAtMs = typeof p.startedAtMs === 'number' ? p.startedAtMs : null;
  const kindLabel = p.isMarker === true ? 'NÄSTA TID' : 'NÄSTA BÖN';
  // The prayer has arrived (ActivityKit passed the staleDate): the countdown would only say
  // 0:00, so the views below say what has happened and what comes after it instead.
  const stale = environment?.isStale === true;
  const arrived = typeof p.arrivedTitle === 'string' && p.arrivedTitle ? p.arrivedTitle : name;
  const followingName = typeof p.followingArabic === 'string' ? p.followingArabic : '';
  const followingTime = typeof p.followingTime === 'string' ? p.followingTime : '';
  // »Därefter Maghrib« — the one new fact the stale banner can give. Without it the line
  // falls back to the Swedish name rather than repeat the headline.
  const thenLine = followingName ? `Därefter ${followingName}` : swedish;

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
      <Text modifiers={[font({ size, weight: 'semibold' }), foregroundStyle(color)]}>–</Text>
    );

  return {
    // Lock Screen / notification banner — system supplies the material background.
    // Laid out as aligned ROWS, not two free-floating columns: the target time rides
    // the prayer name's baseline and the countdown rides the Swedish subtitle's, so
    // every right-hand value lines up with its left-hand label instead of the right
    // column floating at the HStack's vertical centre against a taller left column.
    //
    // No leading glyph: the name says which prayer it is, and without the icon column the
    // label, name and subtitle start on the banner's own inset — the same single leading
    // edge the app's dock and the home-screen widget use.
    banner: environment?.levelOfDetail === 'simplified' ? (
      <HStack alignment="firstTextBaseline" spacing={12} modifiers={[padding({ all: 16 })]}>
        <Text modifiers={[font({ size: 24, weight: 'bold' }), foregroundStyle(C.highlightText), lineLimit(1), minimumScaleFactor(0.7)]}>
          {stale ? arrived : name}
        </Text>
        <Spacer />
        <Text modifiers={[font({ size: 28, weight: 'bold' }), tabular, foregroundStyle(C.ink)]}>
          {time}
        </Text>
      </HStack>
    ) : stale ? (
      <VStack alignment="leading" spacing={3} modifiers={[padding({ all: 16 })]}>
        <HStack alignment="firstTextBaseline" spacing={10}>
          <Text modifiers={[font({ size: 20, weight: 'bold' }), foregroundStyle(C.highlightText)]}>
            {arrived}
          </Text>
          <Spacer />
          <Text modifiers={[font({ size: 22, weight: 'bold' }), tabular, foregroundStyle(C.ink)]}>
            {time}
          </Text>
        </HStack>
        <HStack alignment="firstTextBaseline" spacing={10}>
          {thenLine ? (
            <Text modifiers={[font({ size: 13 }), foregroundStyle(C.inkMuted)]}>{thenLine}</Text>
          ) : null}
          <Spacer />
          {followingName && followingTime ? (
            <Text modifiers={[font({ size: 15, weight: 'semibold' }), tabular, foregroundStyle(C.inkMuted)]}>
              {followingTime}
            </Text>
          ) : null}
        </HStack>
      </VStack>
    ) : (
      <VStack alignment="leading" spacing={3} modifiers={[padding({ all: 16 })]}>
        <Text
          modifiers={[font({ size: 11, weight: 'semibold' }), tracked, foregroundStyle(C.inkFaint)]}>
          {kindLabel}
        </Text>
        <HStack alignment="firstTextBaseline" spacing={10}>
          <Text modifiers={[font({ size: 20, weight: 'bold' }), foregroundStyle(C.highlightText)]}>
            {name}
          </Text>
          <Spacer />
          <Text modifiers={[font({ size: 22, weight: 'bold' }), tabular, foregroundStyle(C.ink)]}>
            {time}
          </Text>
        </HStack>
        <HStack alignment="firstTextBaseline" spacing={10}>
          {swedish ? (
            <Text modifiers={[font({ size: 13 }), foregroundStyle(C.inkMuted)]}>{swedish}</Text>
          ) : null}
          <Spacer />
          {countdown(15, C.inkMuted)}
        </HStack>
      </VStack>
    ),
    // The `small` activity family — CarPlay and the Apple Watch Smart Stack, which
    // render an activity started on the phone in a much narrower box. Without this the
    // system falls back to `banner`, whose three stacked rows and 16pt inset truncate
    // there. One row: what, and how long. (LiveActivityEnvironment.activityFamily
    // reports which family is being rendered, but the layout is chosen by the system —
    // supplying bannerSmall is the supported way to serve it.)
    bannerSmall: (
      <HStack spacing={8} alignment="center" modifiers={[padding({ all: 10 })]}>
        <Text modifiers={[font({ size: 15, weight: 'bold' }), foregroundStyle(C.highlightText)]}>
          {stale ? arrived : name}
        </Text>
        <Spacer />
        {stale ? (
          <Text modifiers={[font({ size: 15, weight: 'semibold' }), tabular, foregroundStyle(C.ink)]}>
            {time}
          </Text>
        ) : (
          countdown(15, C.ink)
        )}
      </HStack>
    ),
    // Dynamic Island — compact: prayer name ↔ ticking countdown around the camera. The
    // name rides in the leading slot so the next prayer is identifiable at a glance
    // without long-pressing to expand.
    compactLeading: (
      <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(C.highlightText)]}>
        {name}
      </Text>
    ),
    // Once the prayer has arrived, its clock time: a finished countdown reads 0:00.
    compactTrailing: stale ? (
      <Text modifiers={[font({ size: 13, weight: 'semibold' }), tabular, foregroundStyle(C.ink)]}>
        {time}
      </Text>
    ) : (
      countdown(13, C.ink)
    ),
    // Minimal (another app's activity shares the island): the prayer's clock time, in
    // brass. A glyph used to sit here, and it could not say WHICH prayer; the countdown
    // cannot fit, since a timer Text reserves its widest value ("1:00:00") and the slot is
    // barely wider than "21:04".
    minimal: (
      <Text
        modifiers={[
          font({ size: 12, weight: 'bold' }),
          tabular,
          foregroundStyle(C.highlightText),
          lineLimit(1),
          minimumScaleFactor(0.7),
        ]}>
        {time}
      </Text>
    ),
    // Dynamic Island — expanded (long-press).
    expandedLeading: (
      <Text modifiers={[font({ size: 16, weight: 'bold' }), foregroundStyle(C.highlightText)]}>
        {stale ? arrived : name}
      </Text>
    ),
    expandedTrailing: (
      <Text modifiers={[font({ size: 16, weight: 'bold' }), tabular, foregroundStyle(C.ink)]}>
        {time}
      </Text>
    ),
    expandedBottom: stale ? (
      <HStack spacing={6} alignment="firstTextBaseline">
        {thenLine ? (
          <Text modifiers={[font({ size: 14 }), foregroundStyle(C.inkMuted)]}>{thenLine}</Text>
        ) : null}
        {followingName && followingTime ? (
          <Text modifiers={[font({ size: 14, weight: 'semibold' }), tabular, foregroundStyle(C.ink)]}>
            {followingTime}
          </Text>
        ) : null}
      </HStack>
    ) : (
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
