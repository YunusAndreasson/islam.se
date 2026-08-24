// Aiming — the maths behind an instrument you turn until it points at something.
//
// The app draws TWO of these on one face (see theme/dial): the qibla compass, aimed at the
// Kaaba, and the Moon dial's `På himlen`, aimed at wherever the Moon actually stands. They
// are the same instrument asked two questions, so the rule for "how far off am I", "which
// way do I turn", "am I there yet" and "may I trust this reading at all" has to be one rule.
// It used to live in lib/qibla under qibla-shaped names, which was true while there was one
// target and became a lie the moment the Moon borrowed it: nothing here knows about Mecca.
//
// What stays in lib/qibla is what is genuinely the qibla's — the Kaaba, the bearing to it,
// the great-circle arc. What is here is the instrument.
//
// Pure and UI-free, so both screens and their tests can call it.

/** Smallest absolute angle (0–180°) between two compass bearings, wrap-aware. So
    359° and 1° are 2° apart, not 358°. Drives the "you're pointing at it" test.
    (It is exactly the magnitude of {@link shortestTurn}.) */
export function angleDelta(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

/** Normalize any heading (degrees) into the [0, 360) range — negatives and ≥360 wrap. */
export function normalizeHeading(raw: number): number {
  return ((raw % 360) + 360) % 360;
}

/** The shortest *signed* turn (degrees, in [−180, 180)) from bearing `from` to bearing `to`.
    Accumulating these is what unwraps the dial: it always steps the SHORT way across the
    0/360 seam (359°→1° is +2°, not −358°), so a needle eases instead of whipping all the way
    around. By construction `from + shortestTurn(from, to) ≡ to (mod 360)` and the step never
    exceeds 180° — the two properties that uniquely define it. */
export function shortestTurn(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

// expo-location's heading `accuracy` is a calibration level 0–3 (0 = none, 3 = high).
// Per the Expo SDK docs, on iOS 3 means < 20° uncertainty and 0 means > 50°. Below
// MEDIUM the compass can be tens of degrees off — far more than the ≤4° lock
// tolerance — so we treat anything under this as "still calibrating" and ask the user
// to move the phone in a figure-8 rather than show (or lock onto) a confidently-wrong
// heading. One canonical threshold shared by every instrument in the app.
export const HEADING_ACCURACY_MIN = 2;

/** Whether a heading reading is trustworthy enough to point at / lock onto a target.
    `accuracy` is the expo-location heading calibration level (0–3); null = no reading yet. */
export function headingReliable(accuracy: number | null | undefined): boolean {
  return accuracy != null && accuracy >= HEADING_ACCURACY_MIN;
}

// ── Alignment: when do we call the phone "pointing at it"? ───────────────────────
// A fresh lock needs the tight tolerance; once locked it holds through a wider band so
// a heading sitting right on the 4° edge can't strobe the lock on and off — which would
// re-fire the haptic and flicker the brass every frame. One canonical "you're on it"
// rule shared by the Qibla screen, the Moon's sky dial and the map's compass button (it
// was a copy-pasted 4° in each, with a comment begging them to stay in sync — now the
// type system enforces it).

/** Degrees within which an *unlocked* instrument first counts as pointing at its target. */
export const AIM_ALIGN_TOL = 4;
/** Once locked, alignment holds until the heading drifts past this (hysteresis band). */
export const AIM_ALIGN_RELEASE = 7;

/** Whether `delta` (the wrap-aware angle 0–180 between heading and target bearing) counts
    as aligned, given whether we were already locked. Hysteresis: tight to acquire, looser
    to keep, so a reading hovering at the boundary doesn't chatter. Reliability gating
    (calibration ≥ MEDIUM, via {@link headingReliable}) stays the caller's concern. */
export function aimAligned(delta: number, wasAligned: boolean): boolean {
  return delta <= (wasAligned ? AIM_ALIGN_RELEASE : AIM_ALIGN_TOL);
}

/** Degrees within which the readout encourages "you're on your way" (but not yet locked). */
const AIM_NEAR_TOL = 30;
/** Beyond this many degrees off, the "getting warmer" proximity feedback is fully cold. */
export const AIM_PROX_RANGE = 45;

/** "Getting warmer" 0..1: 1 when pointing straight at the target, ramping linearly to 0 at
    {@link AIM_PROX_RANGE}° off. Pinned to 0 while the heading is untrustworthy — we must
    not warm the dial toward a bearing we don't yet believe (the calibration warm-up). */
export function aimProximity(heading: number, accuracy: number | null, bearing: number): number {
  if (!headingReliable(accuracy)) return 0;
  return Math.max(0, Math.min(1, 1 - angleDelta(heading, bearing) / AIM_PROX_RANGE));
}

/** The coarse, heading-derived state an instrument shows: pointing at its target (`aligned`),
    closing in (`near`), or holding a reading we don't trust yet (`calibrating`). Pure, so the
    screen can re-render only when the band flips — and so the warm-up gate is unit-testable. */
export interface AimStatus {
  /** Within the (hysteresis-aware) lock tolerance AND the reading is trusted. */
  readonly aligned: boolean;
  /** Closing in (≤ {@link AIM_NEAR_TOL}°), trusted, but not yet locked. */
  readonly near: boolean;
  /** We have a live heading but its calibration is below MEDIUM — don't claim a direction. */
  readonly calibrating: boolean;
}

/** The state of an instrument that has not read anything yet, and the one it returns to on
    blur. Shared so no screen has to spell the three falses out for itself. */
export const AIM_COLD: AimStatus = { aligned: false, near: false, calibrating: false };

/** Fold a heading reading into the coarse {@link AimStatus}. `wasAligned` carries the prior
    lock so {@link aimAligned}'s hysteresis applies. The reliability gate is the whole point:
    an uncalibrated reading is `calibrating` and NEVER `aligned`/`near`, even if it happens to
    point exactly at the target — that's what stops the "wrong at first, then right"
    magnetometer warm-up from locking + buzzing on a confidently-wrong heading. */
export function deriveAimStatus(
  heading: number,
  accuracy: number | null,
  bearing: number,
  wasAligned: boolean,
): AimStatus {
  const reliable = headingReliable(accuracy);
  const delta = angleDelta(heading, bearing);
  const aligned = reliable && aimAligned(delta, wasAligned);
  const near = reliable && !aligned && delta <= AIM_NEAR_TOL;
  const calibrating = !reliable;
  return { aligned, near, calibrating };
}

// ── Which way to turn ───────────────────────────────────────────────────────────
// The dial shows the direction; these two facts SAY it. The qibla screen's loudest
// element used to be the bearing from north — a constant, which never moved while the
// reader turned, so the one element they watched gave them no feedback at all. It now
// counts down the remaining turn, and the status line names the side to turn toward.
// The Moon's sky dial says the same two things about a different target.

/** Past this many degrees off, "left" and "right" are the same journey and the sign is
    decided by jitter — the reading would strobe between them every tick. Inside this
    band we say "turn around" instead, which is both flicker-free and the truer
    instruction. (Same motive as {@link AIM_ALIGN_RELEASE}'s hysteresis.) */
export const AIM_TURN_AROUND = 165;

/** Which way the shortest turn goes: clockwise (`right`), anticlockwise (`left`), or
    far enough behind you that the side no longer means anything (`around`). */
export type TurnDir = 'left' | 'right' | 'around';

/** How far, and which way, to turn to face the target. */
export interface AimTurn {
  /** Wrap-aware magnitude 0–180 — identical to {@link angleDelta}. */
  readonly deg: number;
  /** The SHORT way round, or `around` past {@link AIM_TURN_AROUND}. */
  readonly dir: TurnDir;
}

/** Fold a heading and a target bearing into the turn the reader still has to make.
    Built on {@link shortestTurn}, so the sign is the short way by construction: positive
    means the bearing is clockwise of the heading, which on a compass is your right. */
export function aimTurn(heading: number, bearing: number): AimTurn {
  // Normalize first: `shortestTurn` only lands inside [-180, 180) for inputs already in
  // [0, 360), and a raw sensor heading is not guaranteed to be. Unnormalized, a 765°
  // reading would report a 257° turn to the wrong side — the one failure mode here that
  // actively sends the reader the opposite way.
  const signed = shortestTurn(normalizeHeading(heading), normalizeHeading(bearing));
  const deg = Math.abs(signed);
  return { deg, dir: deg >= AIM_TURN_AROUND ? 'around' : signed >= 0 ? 'right' : 'left' };
}

/** The eight-point compass rose, Swedish. "Ost/öster" for east throughout, per the Swedish
 *  cartographic convention the dial's O already follows. A bearing is a number; a direction
 *  is where you turn your head, and the second is what a sentence wants. */
const COMPASS_POINTS = [
  'norr',
  'nordost',
  'öster',
  'sydost',
  'söder',
  'sydväst',
  'väster',
  'nordväst',
] as const;

/** Name a bearing: 0° → "norr", 135° → "sydost". Rounds to the nearest of eight points, so
 *  each name covers 45° centred on its own direction. */
export function compassPoint(deg: number): string {
  const i = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return COMPASS_POINTS[i] as string;
}
