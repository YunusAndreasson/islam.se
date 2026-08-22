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
import { useKeepAwake } from 'expo-keep-awake';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalBar } from '@/components/ui/ModalBar';
import { Icon, type IconName } from '@/components/ui/Icon';
import { hapticLight, hapticSuccess } from '@/lib/haptics';
import { useLocation } from '@/lib/location/context';
import { useSettings } from '@/lib/settings/context';
import {
  openSystemSettings,
  openSystemSettingsA11yLabel,
  openSystemSettingsLabel,
  systemSettingsName,
} from '@/lib/system-settings';
import { deriveQiblaStatus, formatKm, headingReliable, normalizeHeading, qiblaBearing, qiblaDistanceKm, qiblaProximity, type QiblaStatus, type QiblaTurn, qiblaTurn, shortestTurn, type TurnDir } from '@/lib/qibla';
import { DIAL_MAX, makeDialStyles, rotate as rot } from '@/theme/dial';
import { mono, motion, type Palette, radius, shadow, space, type } from '@/theme/tokens';
import { useColors } from '@/theme/useColors';

// The coarse, heading-derived state the dial actually shows (computed by lib/qibla's
// `deriveQiblaStatus`; the lock tolerance, hysteresis, near/proximity ranges all live there
// too). We store THIS, never the raw degree — see `status` below for why.
const COLD: QiblaStatus = { aligned: false, near: false, calibrating: false };
// Cardinal points, Swedish (Nord/Ost/Syd/Väst — "O" for east per the Swedish
// cartographic/meteorological convention, as used by SMHI and in seafaring).
const CARDINALS: readonly { deg: number; label: string }[] = [
  { deg: 0, label: 'N' },
  { deg: 90, label: 'O' },
  { deg: 180, label: 'S' },
  { deg: 270, label: 'V' },
];
const TICKS = Array.from({ length: 24 }, (_, i) => i * 15);

// How often the remaining-turn numeral may re-enter React state. The magnetometer fires
// ~60×/s; a decimal-free degree count changing faster than ~10 Hz is unreadable anyway, so
// this is six times cheaper than the tick rate and costs the reader nothing. Paired with
// the memoized `Dial` below, the whole instrument sits out these renders.
const TURN_PUSH_MS = 100;

// Translucent colour from a palette hex — the beam, glow and chips tint the warm
// face without hiding it (same trick as the kiswa band's rgba white).
function hexToRgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** One row per direction, so the glyph, the sentence a sighted reader sees and the words a
    screen-reader user hears can never drift apart — this is the one screen whose whole
    purpose is a single unambiguous instruction, and two parallel switches over the same
    three values is exactly how the two halves end up saying different things. */
const TURN_CUES: Record<TurnDir, { icon: IconName; text: string; spoken: string }> = {
  right: { icon: 'rotateRight', text: 'Vrid åt höger', spoken: 'vrid åt höger' },
  left: { icon: 'rotateLeft', text: 'Vrid åt vänster', spoken: 'vrid åt vänster' },
  // Side-less on purpose: past QIBLA_TURN_AROUND the words stop naming a side because the
  // sign is decided by jitter, so a handed arrow here would name one anyway.
  around: { icon: 'turnAround', text: 'Vänd dig om', spoken: 'vänd dig om' },
};

/** The status line: one icon and one sentence for whichever state the compass is in.
    Pure and banded — it must NEVER carry the live degree count, because the pill it
    renders into is an `accessibilityLiveRegion`, and a value changing ten times a second
    would have TalkBack announcing continuously. Magnitude belongs in the numeral below,
    which is read on demand rather than announced. */
function statusLine(
  status: QiblaStatus,
  turn: QiblaTurn | null,
  noCompass: boolean,
  permissionDenied: boolean,
): { icon: IconName; text: string } {
  // The two "we cannot read a direction" states come FIRST. A lock is only reachable from a
  // trusted heading, which clears both flags, so in practice they are exclusive — but if a
  // stale `aligned` ever did survive alongside one of these, the screen must not go on
  // claiming you are facing Mecca over a dial that is merely pointing north.
  if (noCompass || permissionDenied) return { icon: 'compassRose', text: 'Qibla räknad från norr' };
  if (status.aligned) return { icon: 'checkCircle', text: 'Du är vänd mot Mecka' };
  if (status.calibrating) {
    return { icon: 'compassCalibration', text: 'Kalibrera – rör telefonen i en åtta' };
  }
  // Live, trusted, but no reading folded in yet — the first frames after focus. The 2.5 s
  // no-event timeout replaces this with the honest no-compass line if none ever arrives.
  if (!turn) return { icon: 'navigationArrow', text: 'Söker riktning…' };
  return TURN_CUES[turn.dir];
}

export default function Qibla() {
  // Aligning with the qibla is the one thing in this app you do by holding the phone
  // perfectly still and looking at it — which is exactly what the display-sleep timer reads
  // as "nobody is here". Being dimmed out mid-turn, on the screen whose entire job is to be
  // watched while you rotate, is the sort of small betrayal that makes an app feel unfinished.
  // Scoped to this screen: the hook releases on unmount, and the sheet unmounts on dismiss.
  useKeepAwake();
  const { coords, label, source } = useLocation();
  const { settings } = useSettings();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(c), [c]);
  // A resolved place carries its own qualifier ("Stockholm (standard)") when it is the
  // fallback rather than a real fix. Stripping that produced a confident "Stockholm"
  // above a precise bearing and distance computed for a city the reader may be nowhere
  // near — the same lie the dock already refuses to tell (see bonetider's locationIsFallback
  // and PrayerDock's "Välj plats"). So strip it only when there IS a place; when the
  // location is the fallback we say so and offer the way out instead.
  const locationIsFallback = source === 'default';
  const placeLabel = label.replace(/\s*\([^)]*\)\s*$/, '');
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
  // Live bearing in a ref so the heading callback reads the latest value WITHOUT
  // listing `bearing` in its deps. In GPS mode each fresh fix changes `coords` →
  // `bearing`; if that re-created `onHeading`, the focus effect (dep `[onHeading]`)
  // would tear down and re-subscribe the magnetometer on every fix, resetting its
  // calibration warm-up and dropping the lock on a moving device.
  const bearingRef = useRef(bearing);

  // The coarse status (the pill, and whether the direction overlays are drawn) plus the
  // rounded remaining turn. We still do NOT keep the raw heading in state —
  // `watchHeadingAsync` fires up to ~60×/s and storing the degree would reconcile the whole
  // tree on every tick. What changed is that the *readout* now shows a live number, so a
  // heading-derived value has to reach React somehow: it does at a throttled 10 Hz
  // (TURN_PUSH_MS), rounded and deduped, and the ~30 dial Views sit it out behind `Dial`'s
  // memo. Rotation and brass warmth still ride shared values on the UI thread.
  const [status, setStatus] = useState<QiblaStatus>(COLD);
  const [turn, setTurn] = useState<QiblaTurn | null>(null);
  // Two DIFFERENT facts, kept apart. `noCompass` means the hardware never spoke (emulator,
  // a tablet without a magnetometer); `permissionDenied` means it would have, but heading
  // needs the location permission and the user said no. They used to share one flag, so a
  // denial printed "Ingen kompass på den här enheten" — a sentence about the device that
  // was simply false, on a screen with no way to fix it. Now each says its own truth, and
  // the denial carries the route to the OS settings that the sentence names.
  const [noCompass, setNoCompass] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  // Latest reading, kept out of state. `accRef` is the expo-location calibration level (0–3);
  // below MEDIUM (2) the magnetometer is mid-calibration and can be tens of degrees off — the
  // "wrong at first, then right" warm-up — so we don't trust it for the lock.
  const headingRef = useRef<number | null>(null);
  const accRef = useRef<number | null>(null);
  const lastTurnPush = useRef(0);
  // A mirror of `status`, so a reading can be folded deterministically (hysteresis needs the
  // previous lock) AND we can tell whether the band actually moved — which the turn throttle
  // below needs, so the pill and the numeral can never be sampled a beat apart.
  const statusRef = useRef<QiblaStatus>(COLD);
  // Whether we are currently reading the sensor. A fresh GPS fix changes the bearing at any
  // time, including while this sheet is blurred and unsubscribed; re-folding a minutes-old
  // heading then would rebuild a direction from wherever the phone WAS pointing, and could
  // fire the lock haptic and speak "Du är vänd mot Mecka" at a screen nobody is looking at.
  const reading = useRef(false);

  // Continuous (unwrapped) rotation so 359°→1° eases the short way instead of
  // spinning 358° backwards. The rose's rotation lives on the UI thread.
  const roseDeg = useSharedValue(0);
  // Proximity 0..1 (1 = pointing at the qibla). Drives the brass cross-fade and
  // glow on the UI thread, so "getting warmer" stays smooth at 60fps.
  const prox = useSharedValue(0);
  const lastRaw = useRef(0);
  const unwrapped = useRef(0);
  const wasAligned = useRef(false);
  const wasCalibrating = useRef(false);

  // Safe to close over directly, and safe in `onHeading`'s deps: reanimated's
  // useReducedMotion returns a module constant sampled once at app start ("Changing the
  // reduced motion system setting doesn't cause your components to rerender"), so it cannot
  // change for the life of this screen and cannot churn the magnetometer subscription.
  const reduceMotion = useReducedMotion();

  // Fold a heading reading into the coarse status (lib/qibla `deriveQiblaStatus`) and the
  // remaining turn, bailing whenever neither changed so the common case — holding roughly
  // steady — costs zero renders. `force` skips the turn throttle, for the re-fold that a
  // fresh GPS fix triggers while the phone is not moving.
  const applyReading = useCallback(
    (norm: number, acc: number | null, brg: number, force: boolean) => {
      const prev = statusRef.current;
      const next = deriveQiblaStatus(norm, acc, brg, prev.aligned);
      const bandMoved =
        prev.aligned !== next.aligned || prev.near !== next.near || prev.calibrating !== next.calibrating;
      if (bandMoved) {
        statusRef.current = next;
        setStatus(next);
      }
      // An untrusted reading has no turn to report: the same gate that hides the needle
      // must hide the number, or the readout would count down toward a bearing the dial
      // is refusing to draw.
      if (!headingReliable(acc)) {
        setTurn((p) => (p === null ? p : null));
        return;
      }
      // performance.now(), not Date.now(): this is an interval, and a wall clock that steps
      // backwards (NTP, or the reader changing the device time) would make every remaining
      // reading look "too soon" and freeze the numeral while the dial kept turning.
      const now = performance.now();
      // A band change always pushes, throttle or not. Otherwise the pill (updated every tick)
      // and the numeral (sampled at 10 Hz) can be up to 100 ms — nearly 20° in a brisk sweep —
      // out of step, and the screen shows "Du är vänd mot Mecka" above "18° kvar att vrida".
      if (!force && !bandMoved && now - lastTurnPush.current < TURN_PUSH_MS) return;
      lastTurnPush.current = now;
      const t = qiblaTurn(norm, brg);
      const deg = Math.round(t.deg);
      setTurn((p) => (p && p.deg === deg && p.dir === t.dir ? p : { deg, dir: t.dir }));
    },
    [],
  );

  const onHeading = useCallback(
    (raw: number, acc: number | null) => {
      const norm = normalizeHeading(raw);
      // Accumulate the SHORT signed turn so the rose unwraps (eases across the 0/360 seam)
      // rather than spinning the long way; the running total drives the UI-thread rotation.
      unwrapped.current += shortestTurn(lastRaw.current, norm);
      lastRaw.current = norm;
      headingRef.current = norm;
      accRef.current = acc;
      const p = qiblaProximity(norm, acc, bearingRef.current);
      // Idiomatic reanimated: drive the shared values from JS. The compiler's
      // immutability rule can't see that a SharedValue is meant to be mutated.
      // Under Reduce Motion we jump instead of easing, the way DisclosureGroup and
      // FaqItem do. The rose's ROTATION itself is the instrument and cannot be removed —
      // what goes is the added easing on top of the sensor, and the glow's swell below.
      const rose = -unwrapped.current;
      // eslint-disable-next-line react-hooks/immutability
      roseDeg.value = reduceMotion ? rose : withTiming(rose, { duration: motion.quick });
      // eslint-disable-next-line react-hooks/immutability
      prox.value = reduceMotion ? p : withTiming(p, { duration: motion.quick });
      applyReading(norm, acc, bearingRef.current, false);
      setNoCompass((v) => (v ? false : v));
      setPermissionDenied((v) => (v ? false : v));
    },
    [roseDeg, prox, applyReading, reduceMotion],
  );

  // Keep `bearingRef` current and re-fold the last reading when the bearing moves on a fresh
  // GPS fix — the magnetometer may not tick while the phone is still, so without this the
  // status would lag a location change. (Listing `bearing` in `onHeading`'s deps instead
  // would re-subscribe the magnetometer on every fix, resetting its calibration warm-up.)
  useEffect(() => {
    bearingRef.current = bearing;
    if (reading.current && headingRef.current != null) {
      applyReading(headingRef.current, accRef.current, bearing, true);
    }
  }, [bearing, applyReading]);

  // Subscribe to the magnetometer only while the screen is focused (battery), and
  // fall back to a north-up dial if no heading arrives (emulator / no sensor).
  useFocusEffect(
    useCallback(() => {
      let sub: Location.LocationSubscription | null = null;
      let cancelled = false;
      let gotEvent = false;
      reading.current = true;
      // Armed only AFTER the permission question is settled, never alongside it. Started
      // up front, this timer runs while the OS dialog is still on screen waiting for an
      // answer — and a reader who takes more than 2.5 s to decide was told, underneath
      // their own open dialog, that the device has no compass. The silence during a
      // prompt is not evidence about hardware.
      let timer: ReturnType<typeof setTimeout> | null = null;

      // Errors are handled inside; `void` marks the IIFE as intentionally floating.
      void (async () => {
        try {
          // Opening Qibla is the explicit intent that justifies the prompt. Branch on the
          // result rather than relying on watchHeadingAsync to throw: heading needs the
          // permission on both platforms, so on denial show the north-up dial immediately
          // instead of waiting out the 2.5 s no-event timeout.
          const { granted } = await Location.requestForegroundPermissionsAsync();
          if (cancelled) return;
          if (!granted) {
            setPermissionDenied(true);
            return;
          }
          // Clear it HERE, not only when a heading arrives. On a device with no
          // magnetometer the reader who denies, walks to the OS settings, grants, and
          // comes back would otherwise be stuck: no heading event ever fires, so nothing
          // would ever retract "Platsåtkomst nekad" — leaving the screen offering a
          // settings link for a permission it already has.
          setPermissionDenied(false);
          timer = setTimeout(() => {
            if (!gotEvent) setNoCompass(true);
          }, 2500);
          const s = await Location.watchHeadingAsync((h) => {
            // TRUE heading (declination-corrected) when the OS can provide it; -1 means it
            // can't yet. The magHeading fallback is knowingly imperfect — in Sweden the
            // magnetic declination runs ~+5° (Skåne) to ~+13° (Kiruna), past the 4° lock
            // tolerance — but the window is brief: Android computes declination itself
            // (WMM via GeomagneticField) as soon as it has any location fix, which it
            // self-requests, and the magnetometer's own calibration gate (accuracy < 2 →
            // no direction drawn) covers those first seconds. Only a device with location
            // services off entirely stays magnetic — rare, and still roughly right.
            const raw = h.trueHeading != null && h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
            if (raw == null || Number.isNaN(raw)) return;
            gotEvent = true;
            onHeading(raw, typeof h.accuracy === 'number' ? h.accuracy : null);
          });
          if (cancelled) s.remove();
          else sub = s;
        } catch {
          setNoCompass(true);
        }
      })();

      return () => {
        cancelled = true;
        reading.current = false;
        if (timer) clearTimeout(timer);
        sub?.remove();
        // EVERYTHING heading-derived goes, not just the count. This sheet stays mounted
        // across a blur (the header's "Välj plats" pushes over it), so a lock left standing
        // would greet the returning reader with a brass-lit dial and "Du är vänd mot Mecka"
        // — possibly for a city they changed while they were away — with the phone pointing
        // anywhere. Clearing the count alone was worse than clearing nothing: it left the
        // verdict on screen with the measurement that justified it removed.
        headingRef.current = null;
        accRef.current = null;
        statusRef.current = COLD;
        setStatus(COLD);
        setTurn(null);
        lastTurnPush.current = 0;
        prox.value = 0;
      };
    }, [onHeading, prox]),
  );

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
    // deriveQiblaStatus cuts hard at HEADING_ACCURACY_MIN — and the OS-reported level
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
  // The caption stops giving an INSTRUCTION once the lock holds. `qiblaAligned` keeps a lock
  // through QIBLA_ALIGN_RELEASE (7°), so at 6° off the pill rightly says you are facing Mecca
  // while the numeral rightly says 6 — "6° kvar att vrida" under "Du är vänd mot Mecka" is the
  // screen contradicting itself in two adjacent lines. "från qibla" turns the same number from
  // an instruction into a measurement, which is what it is once you have arrived.
  const heroLabel = turn ? (aligned ? 'från qibla' : 'kvar att vrida') : 'från norr';
  // The bearing keeps a home in the quiet line while the hero is live — some readers
  // cross-check it against a real compass — but never twice on the same screen.
  const facts = `Mecka · ${formatKm(distanceKm)}${turn ? ` · qibla ${bearingDeg}°` : ''}`;
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
      <View style={styles.header}>
        <Text style={styles.title}>Qibla</Text>
        {locationIsFallback ? (
          // No place of the user's own — the bearing below is Stockholm's. Same offer the
          // dock makes in the same situation, same icon, same route.
          <Pressable
            onPress={() => {
              hapticLight();
              router.push('/(settings)/byt-plats');
            }}
            // 12 rather than 10 top/bottom: with the ~20 dp row that is exactly the 44 dp
            // target the sibling settings link reserves with minHeight — bought here
            // through hit area instead, so the header doesn't grow a gap in the state
            // where this control is absent.
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            style={({ pressed }) => [styles.placePick, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Ingen plats vald – riktningen gäller standardplatsen. Tryck för att välja stad"
          >
            <Icon name="place" size={14} color={c.accent} />
            <Text style={styles.placePickText} numberOfLines={1}>
              Välj plats
            </Text>
          </Pressable>
        ) : (
          <Text style={styles.subtitle} numberOfLines={1}>
            {placeLabel}
          </Text>
        )}
      </View>

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
          roseDeg={roseDeg}
          prox={prox}
          reduceMotion={reduceMotion}
        />
      </View>

      {/* Status + readout. */}
      <View style={[styles.readout, { paddingBottom: Math.max(space.xxxl, space.lg + insets.bottom) }]}>
        {/* A polite live region so TalkBack re-announces the moment the state changes
            (e.g. "Du är vänd mot Mecka" on lock) without the user re-focusing it. Its text
            is banded on purpose — see `statusLine`. */}
        <View
          style={[styles.statusPill, near && styles.statusPillNear, aligned && styles.statusPillOn]}
          accessible
          accessibilityRole="text"
          accessibilityLiveRegion="polite"
        >
          <Icon
            name={line.icon}
            size={16}
            color={aligned ? c.onHighlight : near ? c.highlightText : c.accent}
          />
          <Text style={[styles.statusText, near && styles.statusTextNear, aligned && styles.statusTextOn]}>
            {line.text}
          </Text>
        </View>

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
          accessibilityLabel={`Avstånd till Mecka: ${formatKm(distanceKm)}`}
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
    </SafeAreaView>
  );
}

interface DialProps {
  size: number;
  bearing: number;
  calibrating: boolean;
  c: Palette;
  styles: ReturnType<typeof makeStyles>;
  /** Unwrapped rose rotation (deg), written from the heading callback on the JS thread. */
  roseDeg: SharedValue<number>;
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
const Dial = memo(function Dial({ size, bearing, calibrating, c, styles, roseDeg, prox, reduceMotion }: DialProps) {
  const r = size / 2;
  const coneTop = r - 40; // beam apex at the hub, base 40px shy of the rim

  const roseStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${roseDeg.value}deg` }] }));
  // The brass layer (beam / cube fill / shaft / index / hub) fades in with proximity
  // — the one shared style reused on every "live" overlay, so they warm together.
  const brassStyle = useAnimatedStyle(() => ({ opacity: prox.value }));
  // A warm halo behind the Kaaba that grows as you close in (a faked radial glow). Under
  // Reduce Motion it keeps the opacity ramp — a fade is not vestibular motion — but stops
  // swelling, since a pulsing object under the reader's eye is exactly what the setting is
  // asking us not to do.
  const glowStyle = useAnimatedStyle(
    () => ({
      opacity: prox.value,
      transform: [{ scale: reduceMotion ? 1 : 0.55 + prox.value * 0.55 }],
    }),
    [reduceMotion],
  );

  return (
    <View style={[styles.dialWrap, { width: size, height: size }]}>
      {/* Fixed warm face — a gentle top-down sheen gives the instrument depth.
          It does NOT rotate, so the "light" always falls from the top. */}
      <LinearGradient colors={[c.surface, c.paperSunken]} style={[styles.face, { borderRadius: r }]} />
      <View style={[styles.innerRing, { width: size * 0.66, height: size * 0.66, borderRadius: size * 0.33 }]} pointerEvents="none" />
      {/* Fixed sight line from the aim index down to the hub — shows the axis the
          Kaaba must travel up to meet (the conceptual model, made visible). It starts
          BELOW the cardinal band (the index wedge + 0° tick already carry the axis up
          there) so it never strikes through the "N" letter; a short fade-in keeps the
          start soft rather than a chopped end. */}
      <View style={[styles.sightWrap, { top: SIGHT_TOP, height: r - SIGHT_TOP }]} pointerEvents="none">
        <LinearGradient
          colors={[hexToRgba(c.ink, 0), hexToRgba(c.ink, 0.16), hexToRgba(c.ink, 0)]}
          locations={[0, 0.2, 1]}
          style={styles.sight}
        />
      </View>

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

// Where the fixed sight line starts, just under the cardinal letters (ticks end at 21,
// the cardinal glyphs at ~46) — so the line reads index → tick → N → line → hub without
// ever striking through the letter.
const SIGHT_TOP = 48;

function makeStyles(c: Palette) {
  return StyleSheet.create({
    // The face, the rose's ticks and letters, the aim index and the hub are the INSTRUMENT,
    // and Månen draws the same one — so their geometry lives in theme/dial and is spread in
    // here rather than written twice. Everything below is this screen's own drawing.
    ...makeDialStyles(c),
    safe: { flex: 1, backgroundColor: c.paper },
    header: { paddingHorizontal: space.lg, paddingTop: space.xs },
    title: { ...type.title, color: c.ink },
    subtitle: { ...type.callout, color: c.inkMuted, marginTop: 2 },

    compassArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    dialWrap: { alignItems: 'center', justifyContent: 'center' },

    sightWrap: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' },
    sight: { width: 2, height: '100%' },

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
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      paddingVertical: space.sm,
      paddingHorizontal: space.lg,
      borderRadius: radius.round,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: hexToRgba(c.accent, 0.3),
      // The longest line ("Kalibrera – rör telefonen i en åtta") ran off a narrow screen at
      // large text sizes. Cap the pill and let the text wrap inside it instead.
      maxWidth: '100%',
      ...shadow.button,
      shadowOpacity: 0.06,
    },
    // On your way → a warm brass tint. Locked on the qibla → a solid brass pill.
    statusPillNear: { backgroundColor: c.highlightSoft, borderColor: 'transparent' },
    statusPillOn: { backgroundColor: c.highlight, borderColor: 'transparent' },
    statusText: { ...type.callout, fontWeight: '600', color: c.accent, flexShrink: 1 },
    statusTextNear: { color: c.ink },
    statusTextOn: { color: c.onHighlight },

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
    // The place-offer and the settings link — the two controls this screen grows only in
    // the states where it owes the reader a way forward. Both borrow the dock's and the
    // hint cards' existing shapes rather than inventing a third.
    placePick: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
    placePickText: { ...type.callout, color: c.accent, fontWeight: '600', flexShrink: 1 },
    link: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 44, paddingHorizontal: space.sm },
    linkText: { ...type.bodyStrong, color: c.accent },
    pressed: { opacity: 0.6 },
  });
}
