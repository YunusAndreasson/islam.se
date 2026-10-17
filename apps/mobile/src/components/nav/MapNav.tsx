// The map's floating navigation, replacing the old single hamburger. Bönetider is home, so
// the things you reach for live right on it as glanceable controls: a ROW OF INSTRUMENTS on
// the left — the live Qibla compass and, beside it, the Moon at tonight's phase — and the
// settings cog on the RIGHT, pinned just below the safe-area top, with one map action
// beside it only when there is one to take (see MapAction). Each opens its
// screen as a sheet you dismiss back to the map (see the root _layout's modal
// presentation). `box-none` everywhere so the map stays draggable across the whole top
// edge — only the discs themselves intercept touches.
//
// Theming: Apple Maps-style, the discs take their light/dark axis from the OS palette
// (useColors), and that axis never follows the sun — see PrayerDock for why the sun-driven
// theme flip was retired and stays retired. What DOES follow the sun is the glass they are
// painted on: theme/skyChrome hands every card on the map one shared ground colour, so a disc
// belongs to the sky behind it at every hour. Shared, because these four discs sampling their
// own backdrops is exactly how the left and right ones came to disagree at dawn.
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, StyleSheet, View, type ViewInstance } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSettings } from '@/lib/settings/context';
import { motion, space } from '@/theme/tokens';
import { useSkyGlass } from '@/theme/skyChrome';
import { useColors } from '@/theme/useColors';
import { CompassButton } from './CompassButton';
import { GlassRoundButton } from './GlassRoundButton';
import { useNavMetrics, NAV_TOP_GAP } from './metrics';
import { MoonButton } from './MoonButton';
import { Icon } from '@/components/ui/Icon';

// The disc diameter, the mark inside it and the lane below the row all live in
// ./metrics — they scale with the reader's text size, and the map's floating cards
// measure against the same numbers.

/**
 * The one camera action the disc beside the cog offers, when there is one:
 * - `reset` — the map is off its home view: "Återställ kartan – visa hela Sverige".
 * - `locate` — the map is home, but the reader's position lies outside it (abroad), so their
 *   dot is not on screen: "Visa min position".
 * Nothing at all for a reader in Sweden looking at the home view, which already shows them.
 * One prop rather than a callback plus a flag, so the two can never disagree.
 */
export interface MapAction {
  kind: 'reset' | 'locate';
  onPress: () => void;
}

export function MapNav({ active, action }: { active: boolean; action?: MapAction }) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  // A screen reader's focus sits on "Återställ kartan" when it is activated, and the disc is
  // gone the moment the camera lands home. Left alone, focus falls to the top of the screen
  // or nowhere, so it is handed to the cog: the control that took the disc's place in the
  // row. Only after a PRESS — a disc that leaves because the reader panned home by hand had
  // no focus to lose.
  const cogRef = useRef<ViewInstance>(null);
  const resetPressed = useRef(false);
  const kind = action?.kind;
  useEffect(() => {
    if (kind === 'reset') return;
    if (kind === undefined && resetPressed.current && cogRef.current) {
      AccessibilityInfo.sendAccessibilityEvent(cogRef.current, 'focus');
    }
    // A reset that lands on 'locate' (a reader abroad) keeps the SAME disc mounted, with a
    // new label, so focus stays where it was and there is nothing to hand over.
    resetPressed.current = false;
  }, [kind]);
  const c = useColors();
  // Discs take their ground from the sky, like the dock below them (theme/skyChrome).
  const sky = useSkyGlass();
  const { settings } = useSettings();
  const { disc, glyph } = useNavMetrics();
  const top = insets.top + NAV_TOP_GAP;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={[styles.left, { top }]} pointerEvents="box-none">
        <CompassButton active={active} />
        {/* Optional, like the map's other two layers. Hiding it leaves the row one disc
            wide; nothing else measures from the row's WIDTH, so the lane below and the
            chip in it are unaffected either way. */}
        {settings.showMoon && <MoonButton active={active} />}
      </View>
      <View style={[styles.right, { top }]} pointerEvents="box-none">
        {/* Only when there is an action to take (see MapAction). This disc used to live here
            permanently as "Visa min position" with the `myLocation` glyph — which on iOS is
            an arrow in a circle, and one disc-width from the qibla arrow read as a second
            compass (2026-09-19, user feedback). For a reader in Sweden it only zoomed to a
            dot the home view already shows, which a pinch does too; with no location it sent
            the reader to "Välj plats", which the dock offers itself. For a reader ABROAD it
            is the only way to their dot short of panning across a continent, so it stays
            for them — as a map PIN (`place`), a glyph that names a spot rather than a
            direction. It sits to the LEFT of the cog, so the cog never moves.

            `accent` is the app's "this is a verb" ink (see PrayerDock's "Välj plats" rule) —
            spent here, not `highlight`, because that gold is reserved for the one "this is
            live right now" state per screen (CompassButton's lock, the dock's next prayer)
            and a second gold control would compete with it rather than read as its own
            thing. Only the reset carries the accent rim: it undoes something the reader
            did, where locate is an ordinary way in. */}
        {action && (
          <Animated.View
            entering={reduceMotion ? undefined : FadeIn.duration(motion.base)}
            exiting={reduceMotion ? undefined : FadeOut.duration(motion.fast)}
          >
            <GlassRoundButton
              tint={sky.surface}
              tintOpacity={0.86}
              rim={action.kind === 'reset' ? c.accent : c.hairline}
              size={disc}
              accessibilityLabel={
                action.kind === 'reset' ? 'Återställ kartan – visa hela Sverige' : 'Visa min position'
              }
              onPress={() => {
                resetPressed.current = action.kind === 'reset';
                action.onPress();
              }}
            >
              <Icon
                name={action.kind === 'reset' ? 'settingsRestore' : 'place'}
                size={glyph}
                color={action.kind === 'reset' ? c.accent : c.ink}
              />
            </GlassRoundButton>
          </Animated.View>
        )}
        <GlassRoundButton
          ref={cogRef}
          tint={sky.surface}
          tintOpacity={0.86}
          rim={c.hairline}
          size={disc}
          accessibilityLabel="Inställningar"
          onPress={() => router.navigate('/installningar')}
        >
          {/* Same disc and same mark as the compass opposite, at every text size. */}
          <Icon name="settings" size={glyph} color={c.ink} />
        </GlassRoundButton>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  left: { position: 'absolute', left: 12, flexDirection: 'row', gap: space.sm },
  right: { position: 'absolute', right: 12, flexDirection: 'row', gap: space.sm },
});
