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
// 2. Sizes are not directly comparable to the old ones. A Material Icons glyph fills its
//    em square; an SF Symbol is drawn to an optical baseline and letterboxed into the box
//    by `resizeMode: 'scaleAspectFit'`. A narrow symbol (chevron, plus) therefore reads
//    SMALLER on iOS at the same `size` number. The numbers here are carried over verbatim
//    from the MaterialIcons call sites so this change is a pure swap; if iOS chrome looks
//    undersized on a device, calibrate per-icon at the CALL SITE, not by scaling everything
//    here.
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
import { Platform, type ColorValue, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

// Android renders the symbol as a glyph in a font that has to load before it can draw
// anything — SymbolView shows an empty box until then, so without this the chrome pops in
// a frame or two after the first screen. Kicking the load off at MODULE scope means it
// starts when this file is first imported, which is well before the splash gate lets the
// real screen through (lib/splash). expo-font dedupes by family name and shares the
// in-flight promise, so SymbolView's own load resolves against this one rather than
// racing it. Fire-and-forget: a failed icon font is a blank glyph, never a blank app.
if (Platform.OS === 'android') {
  void loadAsync({ [materialSymbolsRegular.name]: materialSymbolsRegular.font }).catch(() => {});
}

/**
 * Semantic name → the platform pair. Every entry is validated against both vendor sets
 * (sf-symbols-typescript's union and expo-symbols' android/symbols.json) by the type
 * annotation below, so a typo is a build error rather than an invisible glyph.
 */
const ICONS = {
  // Navigation and dismissal
  close: { ios: 'xmark', android: 'close' },
  back: { ios: 'chevron.backward', android: 'arrow_back' },
  chevronRight: { ios: 'chevron.right', android: 'chevron_right' },
  chevronLeft: { ios: 'chevron.left', android: 'chevron_left' },
  chevronDown: { ios: 'chevron.down', android: 'expand_more' },
  // Affirmation and arithmetic
  check: { ios: 'checkmark', android: 'check' },
  checkCircle: { ios: 'checkmark.circle.fill', android: 'check_circle' },
  add: { ios: 'plus', android: 'add' },
  remove: { ios: 'minus', android: 'remove' },
  // Chrome
  search: { ios: 'magnifyingglass', android: 'search' },
  externalLink: { ios: 'arrow.up.forward.square', android: 'open_in_new' },
  settings: { ios: 'gearshape', android: 'settings' },
  settingsRestore: { ios: 'arrow.counterclockwise', android: 'settings_backup_restore' },
  recenter: { ios: 'scope', android: 'center_focus_strong' },
  errorOutline: { ios: 'exclamationmark.circle', android: 'error_outline' },
  lock: { ios: 'lock', android: 'lock' },
  shieldCheck: { ios: 'checkmark.shield', android: 'verified_user' },
  // Dates
  calendar: { ios: 'calendar', android: 'event' },
  today: { ios: 'calendar.badge.clock', android: 'today' },
  restore: { ios: 'clock.arrow.circlepath', android: 'restore' },
  // Place and direction
  map: { ios: 'map', android: 'map' },
  place: { ios: 'mappin.and.ellipse', android: 'place' },
  directions: { ios: 'arrow.triangle.turn.up.right.diamond.fill', android: 'directions' },
  locationOn: { ios: 'location.fill', android: 'location_on' },
  locationOff: { ios: 'location.slash', android: 'location_off' },
  myLocation: { ios: 'location.circle', android: 'my_location' },
  // The two Plats modes in Inställningar (lib/settings/options).
  gps: { ios: 'location.circle.fill', android: 'gps_fixed' },
  city: { ios: 'building.2.fill', android: 'location_city' },
  // The qibla compass. `compassRose` is the no-heading state — a rose claims no direction,
  // which an arrow always would; see components/nav/CompassButton for why that matters.
  compassRose: { ios: 'safari', android: 'explore' },
  navigationArrow: { ios: 'location.north.fill', android: 'navigation' },
  compassCalibration: { ios: 'arrow.triangle.2.circlepath', android: 'compass_calibration' },
  // Alerts
  notificationsOff: { ios: 'bell', android: 'notifications' },
  notificationsOn: { ios: 'bell.badge.fill', android: 'notifications_active' },
  // Degraded-network notices on the map
  wifiOff: { ios: 'wifi.slash', android: 'wifi_off' },
  cloudOff: { ios: 'icloud.slash', android: 'cloud_off' },
} as const satisfies Record<string, { ios: SFSymbol; android: AndroidSymbol }>;

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
 * A single glyph from the app's chrome set. Accessibility props pass straight through —
 * most call sites are decoration beside a label and mark themselves hidden, which matters
 * more on Android (still a Text node holding a private-use codepoint) than on iOS, where
 * the symbol is a native view with no text for a screen reader to stumble into.
 */
export function Icon({ name, size = 24, color, style, ...rest }: IconProps) {
  return <SymbolView name={ICONS[name]} size={size} tintColor={color} style={style} {...rest} />;
}
