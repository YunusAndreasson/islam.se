// Qibla — the direction of prayer. Most prayer apps bolt on a generic compass;
// this one belongs to a *map* app, so it reads as cartography: a warm Nordic dial
// on the same paper as everything else, a soft directional beam to Mecca, the
// great-circle distance, and an honest fallback when the device has no compass
// (the emulator, some tablets) — it then simply shows the qibla *from north*.
//
// The dial uses the device heading from expo-location (already a dependency — no
// new native module). The whole rose rotates by −heading on the UI thread, so the
// Kaaba needle, pinned at the qibla bearing inside the rose, ends up pointing at
// the real Mecca; line it up with the fixed index at the top and you're facing it.
//
// "Getting warmer" feedback (Don Norman): a `prox` shared value (1 at the bearing,
// 0 by 45° off) drives a graded indigo→brass transition on the beam, the Kaaba
// glow, the needle and the index — so you feel yourself closing in *before* the
// hard ≤4° lock, not just a binary on/off.
//
// THE READOUT SAYS WHAT THE DIAL SHOWS. The big numeral used to be the qibla
// bearing from north — a constant. It is the loudest thing on a screen whose whole
// job is to respond while you turn, and it never moved: the reader watching it got
// no feedback at all, and anyone arriving from Apple Compass (where that slot is
// live) read it as their own heading and thought it was stuck. It now counts down
// the turn you still have to make, and the status line names the side to turn
// toward. When there is no heading we can trust, both fall back to the old static
// reading — because that is genuinely all the screen can say.
//
// THE SENSOR HALF IS NOT WRITTEN HERE ANY MORE. Every awkward detail this screen
// paid for — the permission branch, the no-event timeout, the calibration gate, the
// 10 Hz turn throttle, clearing the lock on blur — moved into lib/useAim when the
// Moon's `På himlen` dial became the second instrument that needed all of it. What
// is left in this file is the qibla's own drawing and its own words.
import { useKeepAwake } from 'expo-keep-awake';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useIsFocused } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { DialSight } from '@/components/ui/DialSight';
import { ModalBar } from '@/components/ui/ModalBar';
import { Icon, type IconName } from '@/components/ui/Icon';
import { PlaceHeader } from '@/components/ui/PlaceHeader';
import { StatusPill, type PillTone } from '@/components/ui/StatusPill';
import { TURN_CUES } from '@/components/ui/turnCues';
import { hapticSuccess } from '@/lib/haptics';
import { useLocation } from '@/lib/location/context';
import { useSettings } from '@/lib/settings/context';
import {
  openSystemSettings,
  openSystemSettingsA11yLabel,
  openSystemSettingsLabel,
  systemSettingsName,
} from '@/lib/system-settings';
import type { AimStatus, AimTurn } from '@/lib/aim';
import { formatKm, qiblaBearing, qiblaDistanceKm } from '@/lib/qibla';
import { useAim } from '@/lib/useAim';
import { DIAL_MAX, makeDialStyles, rotate as rot, useBrassStyles } from '@/theme/dial';
import { hexToRgba } from '@/theme/rgba';
import { mono, type Palette, shadow, space, type } from '@/theme/tokens';
import { useColors } from '@/theme/useColors';

// Cardinal points, Swedish (Nord/Ost/Syd/Väst — "O" for east per the Swedish
// cartographic/meteorological convention, as used by SMHI and in seafaring).
const CARDINALS: readonly { deg: number; label: string }[] = [
  { deg: 0, label: 'N' },
  { deg: 90, label: 'O' },
  { deg: 180, label: 'S' },
  { deg: 270, label: 'V' },
];
const TICKS = Array.from({ length: 24 }, (_, i) => i * 15);

/** The status line: one icon and one sentence for whichever state the compass is in.
    Pure and banded — it must NEVER carry the live degree count, because the pill it
    renders into is an `accessibilityLiveRegion`, and a value changing ten times a second
    would have TalkBack announcing continuously. Magnitude belongs in the numeral below,
    which is read on demand rather than announced. */
function statusLine(
  status: AimStatus,
  turn: AimTurn | null,
  noCompass: boolean,
  permissionDenied: boolean,
): { icon: IconName; text: string; tone: PillTone } {
  // The two "we cannot read a direction" states come FIRST. A lock is only reachable from a
  // trusted heading, which clears both flags, so in practice they are exclusive — but if a
  // stale `aligned` ever did survive alongside one of these, the screen must not go on
  // claiming you are facing Mecca over a dial that is merely pointing north.
  // `quiet`, not `neutral`: StatusPill reserves the accent border for a state the reader can
  // act on, and this is a bare statement of fact. Månen's twin of this line says the same
  // thing in the same tone — the two instruments must not wear different chrome for one
  // state, which is the whole reason the pill was extracted.
  if (noCompass || permissionDenied) {
    return { icon: 'compassRose', text: 'Qibla räknad från norr', tone: 'quiet' };
  }
  if (status.aligned) return { icon: 'checkCircle', text: 'Du är vänd mot Mecka', tone: 'on' };
  if (status.calibrating) {
    return { icon: 'compassCalibration', text: 'Kalibrera – rör telefonen i en åtta', tone: 'neutral' };
  }
  // Live, trusted, but no reading folded in yet — the first frames after focus. The 2.5 s
  // no-event timeout replaces this with the honest no-compass line if none ever arrives.
  if (!turn) return { icon: 'navigationArrow', text: 'Söker riktning…', tone: 'neutral' };
  return { ...TURN_CUES[turn.dir], tone: status.near ? 'near' : 'neutral' };
}

export default function Qibla() {
  // Aligning with the qibla is the one thing in this app you do by holding the phone
  // perfectly still and looking at it — which is exactly what the display-sleep timer reads
  // as "nobody is here". Being dimmed out mid-turn, on the screen whose entire job is to be
  // watched while you rotate, is the sort of small betrayal that makes an app feel unfinished.
  // Scoped to this screen: the hook releases on unmount, and the sheet unmounts on dismiss.
  useKeepAwake();
  const { coords } = useLocation();
  const { settings } = useSettings();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(c), [c]);
  const focused = useIsFocused();
  const settingsName = systemSettingsName();

  // The rose is sized from the box it actually gets, not from the window. A width-only
  // clamp overflowed a short screen the moment the readout grew — large Dynamic Type, or
  // the permission-denied note plus its two links — and the dial then ran under the text.
  // The window is only the seed for the first frame: lib/map/projection-guard documents why
  // useWindowDimensions is not a safe proxy for a view's real size on iOS.
  const { width, height } = useWindowDimensions();
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const onAreaLayout = useCallback((e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setBox((prev) => (prev && Math.abs(prev.w - w) < 1 && Math.abs(prev.h - h) < 1 ? prev : { w, h }));
  }, []);
  const dial = useMemo(() => {
    const w = box?.w ?? width;
    const h = box?.h ?? height * 0.45;
    return Math.max(0, Math.min(w - space.xxl * 2, h - space.lg * 2, DIAL_MAX));
  }, [box, width, height]);

  const bearing = qiblaBearing(coords);
  const distanceKm = qiblaDistanceKm(coords);
  // Distance changes only with the selected coordinates, while `turn` intentionally pushes
  // this screen through React at up to 10 Hz. Locale formatting is comparatively expensive
  // on Hermes, so format it once per location and reuse the exact same string for visible
  // and spoken output instead of paying for it twice on every compass tick.
  const distance = useMemo(() => formatKm(distanceKm), [distanceKm]);

  // The instrument. Opening Qibla is the explicit intent that justifies the permission
  // prompt, so this is the `request: true` caller; the map's compass button is the other one
  // and only checks. Everything heading-derived is cleared when `focused` goes false.
  const { status, turn, noCompass, permissionDenied, rotation, prox } = useAim({
    active: focused,
    request: true,
    bearing,
  });

  const wasAligned = useRef(false);
  const wasCalibrating = useRef(false);
  const reduceMotion = useReducedMotion();

  // The coarse status drives the pill and which overlays draw. `calibrating` means we have a
  // live-but-untrusted heading: while it holds we don't claim alignment / "on your way" (both
  // would point at a possibly-wrong bearing) — we ask the user to figure-8 the phone instead.
  const { aligned, near, calibrating } = status;

  // A single confirming tap the moment you line up (not on every frame while held).
  // The pill below is a `accessibilityLiveRegion="polite"` node, which React Native only
  // honours on Android — so on iOS the one moment this screen exists for went unannounced,
  // and the dial itself is hidden from assistive tech. Announce it explicitly here, in the
  // effect that already owns this exact edge.
  useEffect(() => {
    if (aligned && !wasAligned.current) {
      hapticSuccess();
      AccessibilityInfo.announceForAccessibility('Du är vänd mot Mecka');
    }
    wasAligned.current = aligned;
  }, [aligned]);

  // The other edge worth speaking: entering calibration takes the needle, the beam and the
  // whole count off the screen at once. Sighted readers see that happen; without this a
  // screen-reader user just stops being told anything, with no way to know why. (No haptic
  // — lib/haptics' policy reserves those for outcomes the reader just caused.)
  useEffect(() => {
    if (!calibrating) {
      wasCalibrating.current = false;
      return;
    }
    if (wasCalibrating.current) return;
    // Held for a beat before speaking. Unlike the lock, `calibrating` has NO hysteresis —
    // deriveAimStatus cuts hard at HEADING_ACCURACY_MIN — and the OS-reported level
    // oscillates across that line several times a second during warm-up. Announcing on
    // every crossing would talk continuously over the very user this is for.
    const t = setTimeout(() => {
      wasCalibrating.current = true;
      AccessibilityInfo.announceForAccessibility(
        'Kompassen kalibreras – riktningen döljs tills den är tillförlitlig',
      );
    }, 900);
    return () => clearTimeout(t);
  }, [calibrating]);

  const line = statusLine(status, turn, noCompass, permissionDenied);
  const bearingDeg = Math.round(bearing);
  // The hero numeral: the live remaining turn when we have a heading worth trusting, the
  // static qibla bearing when we don't. The caption underneath always names which, so the
  // number can never be misread as the other one.
  const heroValue = turn ? turn.deg : bearingDeg;
  // The caption stops giving an INSTRUCTION once the lock holds. `aimAligned` keeps a lock
  // through AIM_ALIGN_RELEASE (7°), so at 6° off the pill rightly says you are facing Mecca
  // while the numeral rightly says 6 — "6° kvar att vrida" under "Du är vänd mot Mecka" is the
  // screen contradicting itself in two adjacent lines. "från qibla" turns the same number from
  // an instruction into a measurement, which is what it is once you have arrived.
  const heroLabel = turn ? (aligned ? 'från qibla' : 'kvar att vrida') : 'från norr';
  // The bearing keeps a home in the quiet line while the hero is live — some readers
  // cross-check it against a real compass — but never twice on the same screen.
  const facts = `Mecka · ${distance}${turn ? ` · qibla ${bearingDeg}°` : ''}`;
  const factsA11y = turn
    ? aligned
      ? `${turn.deg} grader från qibla. Qibla ${bearingDeg} grader från norr`
      : `${turn.deg} grader kvar, ${TURN_CUES[turn.dir].spoken}. Qibla ${bearingDeg} grader från norr`
    : `Qibla ${bearingDeg} grader från norr`;
  // The way forward out of the two dead-end states: the map already draws the great-circle
  // qibla arc from the reader's own dot, and it needs no magnetometer at all. Only offered
  // when that arc is actually switched on, so the link cannot promise something absent.
  const mapEscape =
    settings.showQibla ? (
      <Pressable
        // `navigate`, not `back()`: back returns to whatever is underneath, which is only the
        // map when this sheet was opened from it. A control labelled "på kartan" has to land
        // on the map however the reader got here. (It also stops this duplicating ModalBar's
        // dismiss expression, which is a different decision that should stay in one place.)
        onPress={() => router.navigate('/bonetider')}
        accessibilityRole="button"
        accessibilityLabel="Se qibla-riktningen på kartan"
        style={({ pressed }) => [styles.link, pressed && styles.pressed]}
      >
        <Text style={styles.linkText}>Se riktningen på kartan</Text>
        <Icon name="map" size={18} color={c.accent} />
      </Pressable>
    ) : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* This screen is a sheet over the map — a persistent ✕ dismisses back to it. */}
      <ModalBar variant="close" fallback="/bonetider" />
      <ScrollView contentContainerStyle={styles.content}>
      <PlaceHeader title="Qibla" what="riktningen" />

      {/* The dial is a purely visual instrument — its rotating letters (N/O/S/V) and ticks
          convey nothing to a screen-reader user and would just clutter the swipe order, so
          hide it from accessibility. The status pill + bearing readout below carry the state. */}
      <View
        style={styles.compassArea}
        onLayout={onAreaLayout}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Dial
          size={dial}
          bearing={bearing}
          calibrating={calibrating}
          c={c}
          styles={styles}
          rotation={rotation}
          prox={prox}
          reduceMotion={reduceMotion}
        />
      </View>

      {/* Status + readout. */}
      <View style={[styles.readout, { paddingBottom: Math.max(space.xxxl, space.lg + insets.bottom) }]}>
        <StatusPill icon={line.icon} text={line.text} tone={line.tone} c={c} />

        {/* One accessible node so a screen reader speaks the whole instruction — "34 grader
            kvar, vrid åt höger" — instead of the split visual pieces ("34", "°", "kvar att
            vrida"). Read on demand rather than announced, so a label that moves with the
            reading is free here in a way it would not be inside the live region above. */}
        <View style={styles.factsRow} accessible accessibilityRole="text" accessibilityLabel={factsA11y}>
          {/* The value as ONE run of text: the typeface places the ° where a degree sign
              belongs (small, top-right, at cap height) and it shares the numerals' ink —
              a unit mark is part of the number, not an accent. (It used to be a separate
              30px accent-coloured glyph bottom-nudged to the numerals' mid-height.)
              `maxFontSizeMultiplier` is a deliberate local exception to the app's
              everything-scales default: this is a bespoke display numeral, not reading
              text, and uncapped it takes the readout off the screen — while the label
              above carries the same value in full for anyone who needs it spoken. */}
          <Text style={styles.bearingNum} maxFontSizeMultiplier={1.6}>
            {heroValue}°
          </Text>
          <Text style={styles.factLabel}>{heroLabel}</Text>
        </View>
        <Text
          style={styles.distance}
          numberOfLines={2}
          accessibilityLabel={`Avstånd till Mecka: ${distance}`}
        >
          {facts}
        </Text>

        {/* The note slot. Its height is reserved so the instruction arriving and leaving —
            it goes once you are closing in, having done its job — doesn't shift the
            readout under the reader's eye. */}
        <View style={styles.noteSlot}>
          {permissionDenied ? (
            <>
              <Text style={styles.note}>
                Platsåtkomst nekad – nålen visar qibla räknad från norr. Tillåt i {settingsName}.
              </Text>
              {/* The remedy the sentence above names, made reachable. Nothing is added to the
                  healthy screen: this exists only in the state that needs it. */}
              <Pressable
                onPress={openSystemSettings}
                accessibilityRole="button"
                accessibilityLabel={openSystemSettingsA11yLabel('plats')}
                style={({ pressed }) => [styles.link, pressed && styles.pressed]}
              >
                <Text style={styles.linkText}>{openSystemSettingsLabel()}</Text>
                <Icon name="externalLink" size={18} color={c.accent} />
              </Pressable>
              {mapEscape}
            </>
          ) : noCompass ? (
            <>
              <Text style={styles.note}>
                Ingen kompass på den här enheten – nålen visar qibla räknad från norr.
              </Text>
              {mapEscape}
            </>
          ) : calibrating ? (
            <Text style={styles.note}>
              Rör telefonen i en åtta tills riktningen stabiliseras – då låser nålen mot Mecka.
              Håll den borta från metall och magnetiska fodral.
            </Text>
          ) : !near && !aligned ? (
            // The one thing every other qibla app says and this one never did. A tilted
            // phone is the commonest cause of a confidently wrong reading, and the compass
            // has no way to detect it — so it has to be said. It leaves once you are
            // closing in, because by then the reader is plainly doing it right.
            <Text style={styles.note}>Håll telefonen plant och vrid dig tills märket når toppen.</Text>
          ) : null}
        </View>
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}

interface DialProps {
  size: number;
  bearing: number;
  calibrating: boolean;
  c: Palette;
  styles: ReturnType<typeof makeStyles>;
  /** Unwrapped live heading (deg), written from lib/useAim's callback on the JS thread.
   *  The rose turns by MINUS this, so a needle pinned at the bearing lands on Mecca. */
  rotation: SharedValue<number>;
  /** "Getting warmer" 0..1 — 1 when pointing at the qibla. */
  prox: SharedValue<number>;
  reduceMotion: boolean;
}

// The instrument, memoized. Every prop is stable — primitives, a palette object that only
// changes on a theme flip, `styles` from a useMemo keyed on it, and two shared values whose
// identity never changes — so the ~30 Views that draw the face, the 24 ticks, the cardinals
// and the needle reconcile only when the bearing, the calibration band or the size actually
// moves. Never for the 10 Hz turn count in the readout below, which is the whole reason that
// count is affordable at all. The animated styles are built HERE rather than passed in, so
// the parent holds nothing but the shared values.
const Dial = memo(function Dial({ size, bearing, calibrating, c, styles, rotation, prox, reduceMotion }: DialProps) {
  const r = size / 2;
  const coneTop = r - 40; // beam apex at the hub, base 40px shy of the rim

  const roseStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${-rotation.value}deg` }] }));
  // The brass layer (beam / cube fill / shaft / index / hub) and the Kaaba's halo. Both come
  // from theme/dial so the Moon's dial cannot warm on different numbers — see useBrassStyles.
  const { brass: brassStyle, glow: glowStyle } = useBrassStyles(prox, reduceMotion);

  return (
    <View style={[styles.dialWrap, { width: size, height: size }]}>
      {/* Fixed warm face — a gentle top-down sheen gives the instrument depth.
          It does NOT rotate, so the "light" always falls from the top. */}
      <LinearGradient colors={[c.surface, c.paperSunken]} style={[styles.face, { borderRadius: r }]} />
      <View style={[styles.innerRing, { width: size * 0.66, height: size * 0.66, borderRadius: size * 0.33 }]} pointerEvents="none" />
      {/* Fixed sight line from the aim index down to the hub — shows the axis the
          Kaaba must travel up to meet (the conceptual model, made visible). */}
      <DialSight radius={r} c={c} />

      {/* The rotating rose: beam, ticks, cardinals, and the qibla needle. */}
      <Animated.View style={[StyleSheet.absoluteFill, roseStyle]}>
        {/* The qibla DIRECTION (beam + needle + tail) is hidden while `calibrating`:
            when the OS reports the compass as unreliable (accuracy < 2) we refuse to
            draw a direction we don't trust — only the orientation ring shows, and the
            status pill/note tell the user to figure-8 the phone. The direction
            reappears the instant the heading becomes reliable. */}
        {!calibrating && (
          <>
            {/* Qibla beam — a soft cone, pinned at the bearing, widening to the Kaaba.
                Indigo by default; the brass twin fades in with proximity. */}
            <View style={[StyleSheet.absoluteFill, rot(bearing)]} pointerEvents="none">
              <View style={[styles.coneSlot, { height: r }]}>
                <View style={[styles.coneBase, { borderTopWidth: coneTop, borderTopColor: hexToRgba(c.accent, 0.14) }]} />
              </View>
            </View>
            <View style={[StyleSheet.absoluteFill, rot(bearing)]} pointerEvents="none">
              <View style={[styles.coneSlot, { height: r }]}>
                <Animated.View
                  style={[styles.coneBase, { borderTopWidth: coneTop, borderTopColor: hexToRgba(c.highlight, 0.22) }, brassStyle]}
                />
              </View>
            </View>
          </>
        )}

        {TICKS.map((deg) => {
          const major = deg % 90 === 0;
          return (
            <View key={`t${deg}`} style={[StyleSheet.absoluteFill, rot(deg)]} pointerEvents="none">
              <View style={styles.tickSlot}>
                <View style={major ? styles.tickMajor : styles.tickMinor} />
              </View>
            </View>
          );
        })}

        {CARDINALS.map((card) => (
          <View key={card.label} style={[StyleSheet.absoluteFill, rot(card.deg)]} pointerEvents="none">
            <View style={styles.cardinalSlot}>
              {/* counter-rotate so each letter is upright when the rose faces north */}
              <Text style={[styles.cardinal, card.label === 'N' && styles.cardinalN, rot(-card.deg)]}>
                {card.label}
              </Text>
            </View>
          </View>
        ))}

        {!calibrating && (
          <>
            {/* Qibla needle — pinned at the bearing, so the rose's −heading rotation
                lands it on the real Mecca. */}
            <View style={[StyleSheet.absoluteFill, rot(bearing)]} pointerEvents="none">
              <View style={[styles.needleSlot, { height: r }]}>
                {/* The Kaaba — an abstract cube, fitting and quieter than any glyph,
                    over a warm glow that swells as you align. It rides the needle's
                    rotation (a needle ornament, not a screen-pinned marker), so the
                    kiswa band stays perpendicular to the shaft with the belt toward
                    Mecca — the cube visibly POINTS with the needle. */}
                <View style={styles.kaabaWrap}>
                  <Animated.View style={[styles.glow, glowStyle]} />
                  <View style={styles.kaaba}>
                    <Animated.View style={[StyleSheet.absoluteFill, styles.kaabaBrass, brassStyle]} />
                    <View style={styles.kaabaBand} />
                  </View>
                </View>
                <View style={styles.shaftWrap}>
                  <View style={styles.needleShaft} />
                  <Animated.View style={[StyleSheet.absoluteFill, styles.needleShaftBrass, brassStyle]} />
                </View>
              </View>
            </View>

            {/* tail (south) of the needle — a quiet counterweight. Anchored to the
                slot bottom (the dial centre) so it grows out of the hub with no gap. */}
            <View style={[StyleSheet.absoluteFill, rot(bearing + 180)]} pointerEvents="none">
              <View style={[styles.needleSlot, styles.tailSlot, { height: r }]}>
                <View style={[styles.needleTail, { borderBottomWidth: r * 0.48 }]} />
              </View>
            </View>
          </>
        )}
      </Animated.View>

      {/* Fixed bits that do NOT rotate: the top index you aim at, and the hub. */}
      <View style={styles.index} pointerEvents="none" />
      <Animated.View style={[styles.index, styles.indexBrass, brassStyle]} pointerEvents="none" />
      <View style={styles.hubWrap} pointerEvents="none">
        <View style={[StyleSheet.absoluteFill, styles.hub]} />
        <Animated.View style={[StyleSheet.absoluteFill, styles.hub, styles.hubBrass, brassStyle]} />
      </View>
    </View>
  );
});

function makeStyles(c: Palette) {
  return StyleSheet.create({
    // The face, the rose's ticks and letters, the aim index and the hub are the INSTRUMENT,
    // and Månen draws the same one — so their geometry lives in theme/dial and is spread in
    // here rather than written twice. Everything below is this screen's own drawing.
    ...makeDialStyles(c),
    safe: { flex: 1, backgroundColor: c.paper },

    content: { flexGrow: 1 },
    compassArea: { flex: 1, minHeight: 280, alignItems: 'center', justifyContent: 'center' },
    dialWrap: { alignItems: 'center', justifyContent: 'center' },

    // ── Dial instrument geometry below is deliberately bespoke (it's an instrument
    //    drawing, not layout): tick/cone/kaaba/hub/index/needle sizes and the giant
    //    bearing numerals stay as literals. Only typography that doubles as UI text
    //    (cardinals, status, facts) and the surrounding spacing map to tokens. ──

    // A beam lives in a slot rotated to the bearing; flex-end puts its apex at the hub.
    coneSlot: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'flex-end' },
    coneBase: {
      width: 0,
      height: 0,
      borderLeftWidth: 34,
      borderRightWidth: 34,
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
    },

    needleSlot: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' },
    // zIndex (+ the cube's own Android elevation) keeps the cube painted ABOVE the
    // shaft tip that tucks under it — see shaftWrap's negative margin.
    kaabaWrap: { marginTop: 22, width: 64, height: 64, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
    glow: { position: 'absolute', width: 60, height: 60, borderRadius: 30, backgroundColor: hexToRgba(c.highlight, 0.45) },
    // A CUBE, not a chip: corners stay tight (radius 2) so it reads as a building. The
    // centred-band + radius-6 version read as a hamburger glyph once you saw it.
    kaaba: {
      width: 22,
      height: 22,
      borderRadius: 2,
      overflow: 'hidden',
      backgroundColor: c.accent,
      ...shadow.thumb,
    },
    kaabaBrass: { backgroundColor: c.highlight, borderRadius: 2 },
    // The kiswa's belt (the ḥizām) runs around the UPPER THIRD of the real Kaaba — that
    // asymmetry is what makes the icon recognisable, so the band sits there, not centred.
    // The colour is `onAccent` — the token that exists for "what reads on top of an accent
    // fill" — rather than the flat white it used to be. White was correct on the light
    // palette and nearly invisible on the dark one, where the cube fills with a PALE
    // periwinkle accent (#adbcf8): the band disappeared, and with it the asymmetry that
    // makes the cube read as a Kaaba at all. `onAccent` is white on light and deep navy on
    // dark, and both read over the brass fill the lock swaps in.
    kaabaBand: { position: 'absolute', top: 5, width: 22, height: 3, backgroundColor: hexToRgba(c.onAccent, 0.55) },
    // The negative top margin reaches the shaft up through the glow wrapper's dead space
    // so its tip touches the cube's bottom edge — without it the needle stopped ~21 px
    // short and the upright cube read as a separate, floating object off the needle line.
    shaftWrap: { flex: 1, width: 3, marginTop: -20, marginBottom: 2, alignItems: 'center' },
    needleShaft: { flex: 1, width: 3, borderRadius: 2, backgroundColor: c.accent },
    needleShaftBrass: { backgroundColor: c.highlight, borderRadius: 2 },
    // Pin the tail to the centre end of the slot so it meets the hub like the shaft.
    tailSlot: { justifyContent: 'flex-end' },
    // The south counterweight, tapered to a fine point — widest (4px) where it pivots on the
    // hub, narrowing to nothing at the tip, the way a real compass needle carries its mass.
    // Its length is set inline from the dial radius so it scales. (A triangle via the border
    // trick: a coloured bottom edge + transparent sides → the apex points outward to the rim.)
    needleTail: {
      width: 0,
      height: 0,
      marginBottom: 2,
      borderLeftWidth: 2,
      borderRightWidth: 2,
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
      borderBottomColor: c.track,
    },

    // paddingBottom is applied at the call site from the safe-area inset: a flat 32 sat
    // under the home indicator on every device that has one.
    readout: { alignItems: 'center', paddingHorizontal: space.lg },

    // Wraps rather than overflows once Dynamic Type pushes "kvar att vrida" past the
    // numeral's shoulder.
    factsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'flex-end',
      justifyContent: 'center',
      gap: space.sm,
      marginTop: space.xl,
    },
    // Bearing readout — bespoke display numerals (a big instrument reading), not on the
    // type scale; the 54px size is intentional and used nowhere else.
    bearingNum: { fontSize: 54, fontWeight: '400', color: c.ink, letterSpacing: 0.5, ...mono },
    factLabel: { ...type.body, color: c.inkMuted, marginBottom: 13, flexShrink: 1 },
    distance: { ...type.callout, color: c.inkMuted, marginTop: 2, textAlign: 'center', ...mono },
    // Height reserved for the two-line instruction so its arrival and departure don't
    // shift the readout; the taller denied/no-compass blocks simply exceed the floor.
    noteSlot: { alignSelf: 'stretch', alignItems: 'center', minHeight: 56 },
    note: { ...type.caption, color: c.inkFaint, textAlign: 'center', marginTop: space.lg, maxWidth: 300 },
    // The settings link and the map escape — the two controls this screen grows only in the
    // states where it owes the reader a way forward. Both borrow the dock's and the hint
    // cards' existing shapes rather than inventing a third.
    link: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 44, paddingHorizontal: space.sm },
    linkText: { ...type.bodyStrong, color: c.accent, flexShrink: 1 },
    pressed: { opacity: 0.6 },
  });
}
