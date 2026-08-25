// The one icon primitive. Every glyph in the app's chrome comes through here, named for
// what it MEANS ('chevronRight', 'notificationsOn') rather than for a glyph in some
// vendor's set — because the glyph is now different per platform and the call site has no
// business knowing which one it got.
//
// expo-symbols resolves the pair natively: SF Symbols on iOS (drawn by the OS, nothing
// bundled) and Material Symbols on Android (a variable font, ~990 KB, bundled locally so
// it works offline — this app is used on aeroplanes and in basements). That is the whole
// point of the move off @expo/vector-icons: its Material Icons set rendered the SAME 2014
// Google glyph on both platforms, so an iOS user got a stubby Material chevron everywhere
// the OS had spent a decade teaching them to expect a thin SF one.
//
// ── Three things worth knowing before you touch this file ─────────────────────────────
//
// 1. Both names are REQUIRED. expo-symbols' Android path (SymbolView.js) reads
//    `name.android`; a bare string is treated as iOS-only and renders `fallback` — i.e.
//    nothing — on Android. A one-sided entry is therefore a silently blank icon on half
//    the install base, which is why ICONS is typed to demand the pair rather than allowing
//    a partial. The names are not interchangeable: SF uses dotted paths
//    ('chevron.right'), Material Symbols uses snake_case ('chevron_right').
//
// 2. `ink` is why iOS icons are not twice too big. The two libraries disagree about what
//    `size` MEANS, and the disagreement is not subtle:
//
//      • A Material Icons glyph is drawn INSET in its em square. Measured off
//        MaterialIcons.ttf, `chevron_right`'s outline spans 0.50 of the em and `check`
//        spans 0.73 — so at size 22 the old chevron inked 11 pt, not 22.
//      • expo-symbols builds its image at a FIXED `UIImage.SymbolConfiguration(pointSize:
//        UIFont.systemFontSize)` — 17 pt, ignoring `size` entirely — and then hands it to a
//        UIImageView whose frame is size × size with `.scaleAspectFit` (SymbolView.swift,
//        `layoutSubviews` + `getSymbolConfig`). Aspect-fit means the glyph's LONG axis is
//        stretched to exactly `size`. Nothing is inset. A chevron therefore inked the full
//        22 pt — double its predecessor, which is exactly what the first TestFlight build
//        of this looked like.
//
//    So `ink` is the measured long-axis fraction of the em box that the MaterialIcons (or
//    MaterialCommunityIcons) glyph this entry replaced actually covered. On iOS the symbol
//    is rendered into a `size * ink` box centred inside a full `size` footprint, which
//    reproduces the previous optical weight without moving any layout. Android needs none
//    of this: its SymbolView path is a <Text> at fontSize `size`, so the glyph is inset in
//    the em box exactly as Material Icons was, and applying `ink` there would shrink icons
//    that are already correct.
//
//    To re-derive a number, measure the glyph, do not guess:
//      fontTools → BoundsPen over MaterialIcons.ttf, max(width, height) / unitsPerEm.
//
// 3. What is deliberately NOT here, and why neither case is a matter of taste:
//      • The dock's semantic glyphs — the prayer rows (PRAYER_ICONS in lib/prayer-times)
//        and the night landmarks (NIGHT_ICONS in lib/night-times). MATERIAL SYMBOLS HAS NO
//        SUNRISE OR SUNSET GLYPH — not one, in 4055 names; its whole vocabulary for the
//        sun crossing the horizon is the single `wb_twilight`. SF Symbols has the clean
//        `sunrise.fill`/`sunset.fill` pair, so moving this set would buy a nicer iOS at the
//        cost of collapsing Shurūq and Maghrib into ONE glyph on Android — two rows of the
//        dock that must never look alike. MaterialCommunityIcons can say it; the native
//        libraries between them cannot. The night pair moves with them: those rows sit in
//        the same list, and a half-migrated list would mix filled Material Icons with
//        outlined Material Symbols in adjacent rows.
//      • The mosque map pin (components/map/MosqueLayer). It rasterises a glyph to a
//        bitmap for MapLibre via getImageSource; expo-symbols' equivalent
//        (unstable_getMaterialSymbolSourceAsync) is a literal `return null` on iOS, and SF
//        Symbols has no mosque glyph at all — only moon phases. It cannot move until the
//        pin becomes a bundled asset.
//    Those two are the whole remaining reason @expo/vector-icons is a dependency. Nothing
//    else in the app should reach for it: if a new icon is needed, it belongs in ICONS.
import { loadAsync } from 'expo-font';
import { SymbolView, type AndroidSymbol } from 'expo-symbols';
import materialSymbolsRegular from 'expo-symbols/androidWeights/regular';
import type { SFSymbol } from 'sf-symbols-typescript';
import {
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
  type ColorValue,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';

const IOS = Platform.OS === 'ios';

// Android renders the symbol as a glyph in a font that has to load before it can draw
// anything — SymbolView shows an empty box until then, so without this the chrome pops in
// a frame or two after the first screen. Kicking the load off at MODULE scope means it
// starts when this file is first imported, which is well before the splash gate lets the
// real screen through (lib/splash). expo-font dedupes by family name and shares the
// in-flight promise, so SymbolView's own load resolves against this one rather than
// racing it. Fire-and-forget: a failed icon font is a blank glyph, never a blank app.
if (!IOS) {
  void loadAsync({ [materialSymbolsRegular.name]: materialSymbolsRegular.font }).catch(() => {});
}

/**
 * Semantic name → the platform pair. Every entry is validated against both vendor sets
 * (sf-symbols-typescript's union and expo-symbols' android/symbols.json) by the type
 * annotation below, so a typo is a build error rather than an invisible glyph.
 */
const ICONS = {
  // Navigation and dismissal
  close: { ios: 'xmark', android: 'close', ink: 0.58 },
  back: { ios: 'chevron.backward', android: 'arrow_back', ink: 0.67 },
  chevronRight: { ios: 'chevron.right', android: 'chevron_right', ink: 0.5 },
  chevronLeft: { ios: 'chevron.left', android: 'chevron_left', ink: 0.5 },
  chevronDown: { ios: 'chevron.down', android: 'expand_more', ink: 0.5 },
  // Affirmation and arithmetic
  check: { ios: 'checkmark', android: 'check', ink: 0.73 },
  checkCircle: { ios: 'checkmark.circle.fill', android: 'check_circle', ink: 0.83 },
  add: { ios: 'plus', android: 'add', ink: 0.58 },
  remove: { ios: 'minus', android: 'remove', ink: 0.58 },
  // Chrome
  search: { ios: 'magnifyingglass', android: 'search', ink: 0.73 },
  externalLink: { ios: 'arrow.up.forward.square', android: 'open_in_new', ink: 0.75 },
  settings: { ios: 'gearshape', android: 'settings', ink: 0.83 },
  settingsRestore: { ios: 'arrow.counterclockwise', android: 'settings_backup_restore', ink: 0.88 },
  recenter: { ios: 'scope', android: 'center_focus_strong', ink: 0.75 },
  errorOutline: { ios: 'exclamationmark.circle', android: 'error_outline', ink: 0.83 },
  lock: { ios: 'lock', android: 'lock', ink: 0.88 },
  shieldCheck: { ios: 'checkmark.shield', android: 'verified_user', ink: 0.92 },
  // Dates
  calendar: { ios: 'calendar', android: 'event', ink: 0.83 },
  today: { ios: 'calendar.badge.clock', android: 'today', ink: 0.83 },
  restore: { ios: 'clock.arrow.circlepath', android: 'restore', ink: 0.88 },
  // Place and direction
  map: { ios: 'map', android: 'map', ink: 0.75 },
  place: { ios: 'mappin.and.ellipse', android: 'place', ink: 0.83 },
  directions: { ios: 'arrow.triangle.turn.up.right.diamond.fill', android: 'directions', ink: 0.83 },
  locationOn: { ios: 'location.fill', android: 'location_on', ink: 0.83 },
  locationOff: { ios: 'location.slash', android: 'location_off', ink: 0.83 },
  myLocation: { ios: 'location.circle', android: 'my_location', ink: 0.92 },
  // The two Plats modes in Inställningar (lib/settings/options).
  gps: { ios: 'location.circle.fill', android: 'gps_fixed', ink: 0.92 },
  city: { ios: 'building.2.fill', android: 'location_city', ink: 0.79 },
  // The qibla compass. `compassRose` is the no-heading state — a rose claims no direction,
  // which an arrow always would; see components/nav/CompassButton for why that matters.
  compassRose: { ios: 'safari', android: 'explore', ink: 0.83 },
  navigationArrow: { ios: 'location.north.fill', android: 'navigation', ink: 0.79 },
  compassCalibration: { ios: 'arrow.triangle.2.circlepath', android: 'compass_calibration', ink: 0.83 },
  // Which way to turn to reach the qibla — or, on Månen's sky dial, the Moon. A ROTATION
  // glyph, not a chevron: a chevron
  // says "go that way" (translate), and what the reader has to do is pivot in place.
  // `turnAround` is deliberately side-less — it belongs to the state past
  // AIM_TURN_AROUND, where left and right are the same journey, so a handed glyph
  // would silently name a side the words refuse to.
  // ink measured per note 2 (BoundsPen over MaterialIcons.ttf): rotate-right/left 0.789,
  // u-turn-left 0.750. The method reproduces the existing entries exactly (explore 0.832,
  // navigation 0.791, map 0.750), so these are on the same footing, not eyeballed.
  rotateRight: { ios: 'arrow.clockwise', android: 'rotate_right', ink: 0.79 },
  rotateLeft: { ios: 'arrow.counterclockwise', android: 'rotate_left', ink: 0.79 },
  turnAround: { ios: 'arrow.uturn.left', android: 'u_turn_left', ink: 0.75 },
  // Alerts
  notificationsOff: { ios: 'bell', android: 'notifications', ink: 0.81 },
  notificationsOn: { ios: 'bell.badge.fill', android: 'notifications_active', ink: 0.83 },
  // The adhan preview in Påminnelser (lib/adhan-audio). No MaterialIcons predecessor to
  // inherit from, so `ink` was MEASURED off the glyphs these would have replaced —
  // play-arrow 0.58, stop 0.50, by the BoundsPen recipe in note 2 above. Do not guess these.
  play: { ios: 'play.fill', android: 'play_arrow', ink: 0.58 },
  stop: { ios: 'stop.fill', android: 'stop', ink: 0.5 },
  // Degraded-network notices on the map
  wifiOff: { ios: 'wifi.slash', android: 'wifi_off', ink: 0.92 },
  cloudOff: { ios: 'icloud.slash', android: 'cloud_off', ink: 1.0 },
} as const satisfies Record<string, { ios: SFSymbol; android: AndroidSymbol; ink: number }>;

export type IconName = keyof typeof ICONS;

type IconProps = {
  name: IconName;
  /** Point size of the containing square. Defaults to 24, matching SymbolView. */
  size?: number;
  /** Named `color` rather than SymbolView's `tintColor` so call sites read like the rest
   *  of the app's props (and like the MaterialIcons they replaced). */
  color?: ColorValue;
  style?: StyleProp<ViewStyle>;
} & Omit<ViewProps, 'style'>;

/**
 * The size to ASK expo-symbols for on Android, so that what the OS finally draws is `size` dp.
 *
 * Exported for the test rather than for any call site: the branch that uses it is chosen by a
 * module-scope `Platform.OS` read, which a test running under the preset's iOS platform cannot
 * reach, and the arithmetic is the part worth pinning. `|| 1` covers a platform reporting 0 or
 * NaN — an icon at its plain requested size is a far better failure than one of size Infinity.
 */
export function androidGlyphSize(size: number, fontScale: number): number {
  // Every rejected value falls back to 1, i.e. to the plain requested size. Infinity matters as
  // much as 0 here and is the easier one to miss: `size / Infinity` is 0, an invisible glyph in
  // a correctly-sized box, which is a worse failure than the clipping this exists to prevent
  // and far harder to spot in a screenshot.
  const usable = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  return size / usable;
}

/**
 * A single glyph from the app's chrome set. Accessibility props pass straight through —
 * most call sites are decoration beside a label and mark themselves hidden, which matters
 * more on Android (still a Text node holding a private-use codepoint) than on iOS, where
 * the symbol is a native view with no text for a screen reader to stumble into.
 */
export function Icon({ name, size = 24, color, style, ...rest }: IconProps) {
  const icon = ICONS[name];
  // Read reactively, not as a snapshot via PixelRatio.getFontScale(): nav/metrics.ts learns the
  // same number from the same hook, and two mechanisms on one screen disagreeing about when
  // they notice a change is how the pre-divide below silently goes stale. Android currently
  // recreates the activity on a text-size change (its manifest does not list fontScale in
  // configChanges), which would remount everything anyway — but that is a manifest edit away
  // from being false, and a stale scale here draws the glyph at size × (new/old) inside a
  // `size` box: exactly the clipping this arithmetic removes.
  const { fontScale } = useWindowDimensions();

  // Both platforms end up the same shape — the symbol centred inside a FULL `size` box that
  // carries the caller's style and props. The footprint is what every row was laid out
  // against, so only the ink ever moves. What differs is the number SymbolView has to be
  // ASKED for in order to ink `size`, and the two reasons are unrelated:
  //
  //  • iOS shrinks to the measured `ink` (note 2). Without the wrapper, `ink` would drag the
  //    layout in with it and every icon+label pair would retighten by a few points.
  //  • Android has to UNDO the OS's font scaling. SymbolView draws the glyph there as a
  //    <Text fontSize={size} lineHeight={size}>, and a React Native <Text> font-scales while
  //    the <View> around it does not — so at the reader's text size the glyph was drawn at
  //    size × fontScale inside a box still measuring size, and the box won. At Android's 1.6×
  //    the date crown's 18 pt calendar came out as the top-left corner of a 29 pt glyph and
  //    nothing else (seen on an emulator, 2026-08-25, and reported by a reader on that
  //    screen). Dividing first means the OS multiplication lands back on exactly `size` —
  //    what the prop has always claimed to mean, and what iOS, whose SymbolView is a native
  //    image view that never font-scales, has always done. lineHeight rides the same factor.
  //
  //    Icons that SHOULD follow the reader's text size say so at the call site, where the
  //    amount can be judged and capped: see nav/metrics.ts, which grows the map's discs and
  //    their marks together. That mechanism was silently doubling up against this one, so at
  //    1.6× the cog inked at 62 dp inside a 69 dp disc rather than the 39 dp it documents.
  //
  // ⚠️ THE ANDROID `style` OVERRIDE IS LOAD-BEARING AND MUST STAY ON THE SYMBOL, not move up
  // to the wrapper with the rest. SymbolView sizes its own inner <View> from the `size` it was
  // given — the DIVIDED one — so without this the glyph, drawn at the full `size`, overflows a
  // box only `size / fontScale` across and the clipping comes straight back.
  //
  // The wrapper is what makes this component's promise below true. SymbolView's Android path
  // renders `<View style={style}><Text/></View>` and spreads NOTHING, so every prop in
  // `...rest` — accessibilityElementsHidden, importantForAccessibility, accessibilityLabel,
  // testID — used to be dropped on the floor. The cost was real and invisible: settings/
  // OptionGroup marks its check glyph decorative exactly that way, and on Android TalkBack
  // reached the inner <Text> and read out the Material Symbols private-use codepoint after
  // every selected option.
  return (
    <View style={[{ width: size, height: size }, styles.centre, style]} {...rest}>
      <SymbolView
        name={icon}
        size={IOS ? Math.round(size * icon.ink) : androidGlyphSize(size, fontScale)}
        tintColor={color}
        style={IOS ? undefined : { width: size, height: size }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
});
