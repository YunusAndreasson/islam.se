// One live instrument, for every screen that has something to point at.
//
// The qibla compass, the Moon's `På himlen` dial and the map's little compass button are the
// same device asked three questions, and this hook is that device: it owns the magnetometer
// subscription, the permission question, the honest no-compass fallback, the UI-thread
// rotation, the "getting warmer" ramp, and the coarse band machine that decides when to say
// you are pointing at the thing. The caller supplies only the bearing it wants aimed at.
//
// It grew out of the Qibla screen, where all of this was written inline, and every awkward
// detail below is a bug that screen already paid for once. They are kept together here so
// the Moon dial cannot re-learn them one at a time.
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type SharedValue, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import {
  AIM_COLD,
  type AimStatus,
  type AimTurn,
  aimProximity,
  aimTurn,
  deriveAimStatus,
  headingReliable,
  normalizeHeading,
  shortestTurn,
} from './aim';
import { motion } from '@/theme/tokens';

// ── ONE SENSOR, MANY INSTRUMENTS ────────────────────────────────────────────────
//
// ⚠️ THIS MUST STAY A SINGLE SHARED WATCH. Two concurrent `watchHeadingAsync` subscriptions
// on Android starve each other: NEITHER delivers events, silently and with no error. The map
// carries two of these instruments side by side (the qibla compass and the Moon), so the
// moment the second one mounted, both discs went dead and reported "kompassen är inte
// tillgänglig" on a phone whose compass was working perfectly — the Qibla screen, opened on
// its own, still read it. Nothing in the type system or the test suite sees this; it took a
// device, and it will come straight back if a caller is ever given its own subscription.
//
// So the sensor is opened once, ref-counted, and fanned out. Everything above the fan-out —
// the permission question, the bands, the throttle — stays per-consumer, because those are
// per-consumer decisions.
type HeadingListener = (heading: number, accuracy: number | null) => void;
const listeners = new Set<HeadingListener>();
let watch: Location.LocationSubscription | null = null;
let opening: Promise<void> | null = null;
/** The most recent reading, replayed to whoever joins an already-open watch.
 *
 *  ⚠️ WITHOUT THIS, THE SECOND INSTRUMENT LIES. expo-location emits a heading event only when
 *  the field actually MOVES, so a joiner attaching to a running watch gets nothing at all
 *  while the phone is held still — which is the posture a reader is in when they open the
 *  Qibla sheet from the map. It would then arm NO_EVENT_MS, hear nothing, and print "Ingen
 *  kompass på den här enheten" over a map whose compass disc was reading the sensor happily
 *  two hundred milliseconds earlier. Each consumer used to own a subscription, and a fresh
 *  subscription yields an immediate reading; sharing one took that away, so we hand it back.
 *  Dropped when the watch closes, so a stale bearing from a previous session is never
 *  replayed into a new one. */
let lastReading: { heading: number; accuracy: number | null } | null = null;

function fanOut(h: Location.LocationHeadingObject): void {
  // TRUE heading (declination-corrected) when the OS can provide it; -1 means it can't yet.
  // The magHeading fallback is knowingly imperfect — in Sweden the magnetic declination runs
  // ~+5° (Skåne) to ~+13° (Kiruna), past the 4° lock tolerance — but the window is brief:
  // Android computes declination itself (WMM via GeomagneticField) as soon as it has any
  // location fix, which it self-requests, and the calibration gate (accuracy < 2 → no
  // direction drawn) covers those first seconds. Only a device with location services off
  // entirely stays magnetic — rare, and still roughly right.
  const raw = h.trueHeading != null && h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
  if (raw == null || Number.isNaN(raw)) return;
  const acc = typeof h.accuracy === 'number' ? h.accuracy : null;
  lastReading = { heading: raw, accuracy: acc };
  // Iterate a COPY: a listener that unsubscribes during the fan-out would otherwise mutate
  // the set we are walking.
  for (const l of [...listeners]) l(raw, acc);
}

async function addHeadingListener(fn: HeadingListener): Promise<void> {
  listeners.add(fn);
  if (!watch) {
    if (!opening) {
      opening = Location.watchHeadingAsync(fanOut)
        .then((s) => {
          // Everyone may have left while we were opening.
          if (listeners.size === 0) s.remove();
          else watch = s;
        })
        .finally(() => {
          opening = null;
        });
    }
    try {
      await opening;
    } catch (err) {
      // The listener was added up front so the `listeners.size === 0` check above can see it.
      // If the sensor refuses to open we have to take it back out again, or it sits in the set
      // for the life of the process: `listeners.size` never reaches 0, so the watch a LATER
      // consumer opens is never released, and the magnetometer runs behind every screen for
      // ever after. (The caller's catch only gets as far as setting `noCompass`.)
      listeners.delete(fn);
      throw err;
    }
  }
  // Whatever we already know, said immediately — see `lastReading`.
  if (lastReading) fn(lastReading.heading, lastReading.accuracy);
}

function removeHeadingListener(fn: HeadingListener): void {
  listeners.delete(fn);
  if (listeners.size === 0 && watch) {
    watch.remove();
    watch = null;
    lastReading = null;
  }
}

/** How long we wait for a first heading event before calling the device compass-less. Armed
 *  only AFTER the permission question is settled, never alongside it: started up front it
 *  runs while the OS dialog is still on screen waiting for an answer, and a reader who takes
 *  more than this to decide was told, underneath their own open dialog, that their phone has
 *  no compass. Silence during a prompt is not evidence about hardware. */
const NO_EVENT_MS = 2500;

/** How often the remaining-turn count may re-enter React state. The magnetometer fires
 *  ~60×/s; a decimal-free degree count changing faster than ~10 Hz is unreadable anyway, so
 *  this is six times cheaper than the tick rate and costs the reader nothing. Paired with a
 *  memoized dial, the whole instrument sits out these renders. */
const TURN_PUSH_MS = 100;

export interface AimOptions {
  /** Subscribe only while true — pass the screen's focus, so the magnetometer is not running
   *  behind a screen nobody is looking at. Going false clears every heading-derived value. */
  active: boolean;
  /** true → prompt for permission (a screen opened *in order to* point at something);
   *  false → check only, never prompt (passive chrome like the map's compass button). */
  request: boolean;
  /** Where the instrument is aimed, degrees clockwise from true north. May move at any time
   *  (a fresh GPS fix, the Moon climbing) — the last reading is re-folded when it does. */
  bearing: number;
  /** Whether this consumer needs the live remaining-turn count. Default true.
   *
   *  Pass FALSE for a consumer that only reads `status` — the two map nav discs, which say
   *  "you are on it" and nothing else. The count is the one thing here that re-enters React
   *  on a timer (10 Hz while the phone moves), and a consumer that never destructures `turn`
   *  still re-renders for every push of it. On the home screen that is the Moon disc
   *  recomputing its Hijri date and redrawing its phase ten times a second to answer a
   *  question it did not ask. With it off, those discs reconcile only when the BAND moves —
   *  a handful of times per sweep. `turn` is then always null. */
  countTurn?: boolean;
}

export interface Aim {
  /** Pointing at it / closing in / holding a reading we don't trust. Changes only when the
   *  band flips, so it is cheap to keep in a rendered pill. */
  status: AimStatus;
  /** How far and which way still to turn — null whenever there is no reading worth trusting,
   *  which is the same gate that hides the needle. */
  turn: AimTurn | null;
  /** The hardware never spoke: no magnetometer, or no event inside {@link NO_EVENT_MS}. */
  noCompass: boolean;
  /** It would have spoken, but heading needs the location permission and we do not have it.
   *  Kept apart from `noCompass` because they call for different sentences and only one of
   *  them has a remedy the app can offer. Note that a `request: false` caller reaches this
   *  state for "never asked" as well as for "refused" — see `canAskAgain`. */
  permissionDenied: boolean;
  /** Raise the OS permission dialog now, from a gesture the reader just made.
   *
   *  ⚠️ IT IS A FUNCTION, NOT A FLAG, and that is the point. The obvious shape — a boolean the
   *  screen flips to arm `request` — is idempotent, and Android grants TWO refusals before it
   *  stops listening. So the second press of a "Tillåt platsåtkomst" button set an already-true
   *  boolean, changed no state, re-ran no effect and raised no dialog: a control that visibly
   *  does nothing, which is exactly what `canAskAgain` exists to prevent. Each call re-runs the
   *  subscribe effect, so each press asks again for as long as the OS will answer. */
  askPermission: () => void;
  /** Whether the OS would still show its dialog if we asked. It decides WHICH remedy a screen
   *  offers for `permissionDenied`: a prompt it can raise itself, or the trip to the system
   *  settings, which is all that is left once the OS has stopped listening. Offering the first
   *  when the answer is the second is a button that visibly does nothing. */
  canAskAgain: boolean;
  /** Continuous, UNWRAPPED heading (deg) on the UI thread — 359°→1° is +2°, not −358°, so a
   *  rose eases across the seam instead of whipping round. Rotate a rose by `−rotation`, or
   *  a needle at a fixed bearing by `bearing − rotation`. */
  rotation: SharedValue<number>;
  /** "Getting warmer" 0..1, 1 when aimed. Drives the brass cross-fade on the UI thread, so
   *  the reader feels themselves closing in before the hard lock rather than only at it. */
  prox: SharedValue<number>;
  /** Whether the sensor has spoken at all since we subscribed — the gate for drawing anything
   *  that claims a direction. Deliberately NOT `turn != null`, which is the stricter *trusted*
   *  gate: an uncalibrated reading is still a real orientation, and turning with the phone
   *  while the OS says "don't lock on this" is honest. Flips once and costs one render. */
  hasReading: boolean;
}

export function useAim({ active, request, bearing, countTurn = true }: AimOptions): Aim {
  // The coarse status and the rounded remaining turn are the ONLY heading-derived things
  // that reach React. The raw degree never does: `watchHeadingAsync` fires up to ~60×/s and
  // storing it would reconcile the whole tree on every tick. The turn arrives throttled
  // (TURN_PUSH_MS), rounded and deduped; rotation and warmth ride shared values instead.
  const [status, setStatus] = useState<AimStatus>(AIM_COLD);
  const [turn, setTurn] = useState<AimTurn | null>(null);
  const [noCompass, setNoCompass] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [hasReading, setHasReading] = useState(false);
  const [canAskAgain, setCanAskAgain] = useState(true);
  // The raw sensor callback is much hotter than React's render cadence. Mirror these three
  // one-way flags so a healthy reading does not enqueue three same-value state updates for
  // every magnetometer event. The refs are updated at every write site below; React state
  // remains the rendered source of truth.
  const noCompassRef = useRef(false);
  const permissionDeniedRef = useRef(false);
  const hasReadingRef = useRef(false);
  // Bumped by `askPermission`; a dep of the subscribe effect, so every press re-runs it. The
  // ref records that the reader has asked at all, which upgrades this consumer's silent CHECK
  // into a real prompt from then on.
  const [askCount, setAskCount] = useState(0);
  const askedManually = useRef(false);
  const askPermission = useCallback(() => {
    askedManually.current = true;
    setAskCount((n) => n + 1);
  }, []);

  const rotation = useSharedValue(0);
  const prox = useSharedValue(0);

  // Latest reading, kept out of state. `accRef` is expo-location's calibration level (0–3);
  // below MEDIUM the magnetometer is mid-calibration and can be tens of degrees off — the
  // "wrong at first, then right" warm-up — so we don't trust it for the lock.
  const headingRef = useRef<number | null>(null);
  const accRef = useRef<number | null>(null);
  const lastRaw = useRef(0);
  const unwrapped = useRef(0);
  const lastTurnPush = useRef(0);
  // A mirror of `status`, so a reading can be folded deterministically (the hysteresis needs
  // the previous lock) AND we can tell whether the band actually moved — which the turn
  // throttle needs, so the pill and the count can never be sampled a beat apart.
  const statusRef = useRef<AimStatus>(AIM_COLD);
  // In a ref so flipping it cannot re-create `applyReading` and, through it, re-subscribe the
  // sensor — the same reason `bearingRef` exists. Written in an effect rather than in render:
  // a ref mutated during render is the pattern react-hooks/refs exists to stop, and this value
  // is a constant per call site anyway.
  const countTurnRef = useRef(countTurn);
  useEffect(() => {
    countTurnRef.current = countTurn;
  }, [countTurn]);
  // Live bearing in a ref so the heading callback reads the latest value WITHOUT listing
  // `bearing` in its deps. In GPS mode each fresh fix moves the bearing; if that re-created
  // `onHeading`, the subscribe effect would tear down and re-subscribe the magnetometer on
  // every fix, resetting its calibration warm-up and dropping the lock on a moving device.
  const bearingRef = useRef(bearing);
  // Whether we are currently reading the sensor. The bearing can move at any time, including
  // while this screen is blurred and unsubscribed; re-folding a minutes-old heading then
  // would rebuild a direction from wherever the phone WAS pointing, and could fire the lock
  // haptic at a screen nobody is looking at.
  const reading = useRef(false);

  // Safe to close over directly, and safe in the deps below: reanimated's useReducedMotion
  // returns a module constant sampled once at app start ("Changing the reduced motion system
  // setting doesn't cause your components to rerender"), so it cannot change for the life of
  // this hook and cannot churn the subscription.
  const reduceMotion = useReducedMotion();

  // Fold a reading into the coarse status and the remaining turn, bailing whenever neither
  // moved so the common case — holding roughly steady — costs zero renders. `force` skips the
  // turn throttle, for the re-fold a moved bearing triggers while the phone is not moving.
  const applyReading = useCallback(
    (norm: number, acc: number | null, brg: number, force: boolean) => {
      const prev = statusRef.current;
      const next = deriveAimStatus(norm, acc, brg, prev.aligned);
      const bandMoved =
        prev.aligned !== next.aligned || prev.near !== next.near || prev.calibrating !== next.calibrating;
      if (bandMoved) {
        statusRef.current = next;
        setStatus(next);
      }
      // Lock-only consumers stop here: the band is all they read, so the throttle, the
      // rounding and the state push below are pure cost for them. See `countTurn`.
      if (!countTurnRef.current) return;
      // An untrusted reading has no turn to report: the same gate that hides the needle must
      // hide the number, or the readout would count down toward a bearing the dial is
      // refusing to draw.
      if (!headingReliable(acc)) {
        setTurn((p) => (p === null ? p : null));
        return;
      }
      // performance.now(), not Date.now(): this is an interval, and a wall clock that steps
      // backwards (NTP, or the reader changing the device time) would make every remaining
      // reading look "too soon" and freeze the count while the dial kept turning.
      const now = performance.now();
      // A band change always pushes, throttle or not. Otherwise the pill (updated every tick)
      // and the count (sampled at 10 Hz) can be up to 100 ms — nearly 20° in a brisk sweep —
      // out of step, and the screen says "you are pointing at it" above "18° left to turn".
      if (!force && !bandMoved && now - lastTurnPush.current < TURN_PUSH_MS) return;
      lastTurnPush.current = now;
      const t = aimTurn(norm, brg);
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
      const p = aimProximity(norm, acc, bearingRef.current);
      // Drive the shared values from JS, through set() — the form the React Compiler can see
      // is a deliberate write. Under Reduce Motion we jump instead of easing, the way
      // DisclosureGroup and FaqItem do — what goes is the added easing on top of the sensor,
      // never the rotation itself, which IS the instrument.
      rotation.set(
        reduceMotion ? unwrapped.current : withTiming(unwrapped.current, { duration: motion.quick }),
      );
      prox.set(reduceMotion ? p : withTiming(p, { duration: motion.quick }));
      applyReading(norm, acc, bearingRef.current, false);
      if (!hasReadingRef.current) {
        hasReadingRef.current = true;
        setHasReading(true);
      }
      if (noCompassRef.current) {
        noCompassRef.current = false;
        setNoCompass(false);
      }
      if (permissionDeniedRef.current) {
        permissionDeniedRef.current = false;
        setPermissionDenied(false);
      }
    },
    [rotation, prox, applyReading, reduceMotion],
  );

  // Keep `bearingRef` current and re-fold the last reading when the bearing moves — the
  // magnetometer may not tick while the phone is still, so without this the status would lag
  // a fresh GPS fix (or the Moon's own climb).
  //
  // `prox` is re-driven here TOO, not just the words. It is only ever written from the
  // heading callback otherwise, and the case this effect exists for is precisely the one
  // where no callback is coming — a phone held steady, which is the aiming posture. Left out,
  // the pill and the count would move to the new bearing while the dial's brass ramp went on
  // showing the warmth for the old one, which on Månen is every sixty seconds.
  useEffect(() => {
    bearingRef.current = bearing;
    if (!reading.current || headingRef.current == null) return;
    applyReading(headingRef.current, accRef.current, bearing, true);
    const p = aimProximity(headingRef.current, accRef.current, bearing);
    prox.set(reduceMotion ? p : withTiming(p, { duration: motion.quick }));
  }, [bearing, applyReading, prox, reduceMotion]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let gotEvent = false;
    let listening = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    reading.current = true;
    const listener: HeadingListener = (raw, acc) => {
      // `addHeadingListener` puts this in the shared set BEFORE it awaits, so a screen that
      // blurs during that window is cleaned up while still subscribed — and a fan-out landing
      // then would repopulate the status it just cleared, and could re-enter the aligned band
      // and fire the lock haptic and announcement at a screen the reader has already left.
      if (cancelled) return;
      gotEvent = true;
      onHeading(raw, acc);
    };

    // Errors are handled inside; `void` marks the IIFE as intentionally floating.
    void (async () => {
      try {
        // Heading needs the foreground location permission on both platforms. Branch on the
        // result rather than relying on watchHeadingAsync to throw, so a denial shows the
        // north-up fallback immediately instead of waiting out the no-event timeout.
        const perm =
          request || askedManually.current
            ? await Location.requestForegroundPermissionsAsync()
            : await Location.getForegroundPermissionsAsync();
        if (cancelled) return;
        if (!perm.granted) {
          permissionDeniedRef.current = true;
          setPermissionDenied(true);
          setCanAskAgain(perm.canAskAgain !== false);
          return;
        }
        // Cleared HERE, not only when a heading arrives. On a device with no magnetometer a
        // reader who denies, walks to the OS settings, grants and comes back would otherwise
        // be stuck: no heading event ever fires, so nothing would retract the denial — leaving
        // a settings link for a permission the app already has.
        permissionDeniedRef.current = false;
        setPermissionDenied(false);
        setCanAskAgain(true);
        timer = setTimeout(() => {
          if (!gotEvent) {
            noCompassRef.current = true;
            setNoCompass(true);
          }
        }, NO_EVENT_MS);
        await addHeadingListener(listener);
        // The cleanup may have run while we were awaiting; it could not have removed a
        // listener that was not added yet, so this branch owns the removal.
        if (cancelled) removeHeadingListener(listener);
        else listening = true;
      } catch {
        noCompassRef.current = true;
        setNoCompass(true);
      }
    })();

    return () => {
      cancelled = true;
      reading.current = false;
      if (timer) clearTimeout(timer);
      if (listening) removeHeadingListener(listener);
      // EVERYTHING heading-derived goes, not just the count. A screen can stay mounted across
      // a blur (Qibla's header pushes the place picker over it), so a lock left standing would
      // greet the returning reader with a brass dial and "you are facing it" — possibly for a
      // city they changed while they were away — with the phone pointing anywhere. Clearing
      // the count alone was worse than clearing nothing: it left the verdict on screen with
      // the measurement that justified it removed.
      headingRef.current = null;
      accRef.current = null;
      statusRef.current = AIM_COLD;
      setStatus(AIM_COLD);
      setTurn(null);
      // `hasReading` deliberately SURVIVES. It is not a direction claim — it means "this
      // device has a compass and it spoke", which does not stop being true when a screen
      // blurs. Cleared here, the map's compass button reverted to its no-compass rose (and
      // "kompassen är inte tillgänglig") for the frames between coming back and the first new
      // event, flashing a hardware complaint on a phone that plainly has the hardware.
      // `noCompass` and `permissionDenied` survive for the same reason.
      lastTurnPush.current = 0;
      prox.set(0);
    };
  }, [active, request, askCount, onHeading, prox]);

  return {
    status,
    turn,
    noCompass,
    permissionDenied,
    canAskAgain,
    askPermission,
    rotation,
    prox,
    hasReading,
  };
}
