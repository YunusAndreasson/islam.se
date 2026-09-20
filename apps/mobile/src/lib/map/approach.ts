// The map leans in toward the reader as a prayer approaches, and back out once it has
// passed. Everything the camera needs to decide HOW FAR is here, pure; the screen
// (app/bonetider) owns WHEN it may move at all — live time only, never while the reader
// has the camera, never while a reset is in charge. See its `reconcileApproach`.
//
// THE SHAPE. The lean is a zoom DELTA on top of the whole-Sweden home frame, linear in
// time: 0 thirty minutes out, APPROACH_MAX_ZOOM at the prayer, 0 again twenty minutes
// after. Linear in zoom LEVEL is linear in log-scale, which is how a change of scale is
// perceived — so a straight ramp already reads as steady and proportional, and needs no
// easing curve on top. At 1.5 levels the phone's home zoom (≈3.9) peaks near 5.4:
// a regional view with enough scale change to make the current prayer prominent.
//
// THE PIVOT. Keep the reader’s horizontal position unless the line needs room. As the
// zoom grows, gently bring edge cities into the middle half of the unobscured map.
// This gives Malmö room above the dock and Kiruna room below navigation; at Δ = 0
// the original whole-country frame is restored exactly.
//
// THE GUARD. Zooming in must never push out of frame the very thing the reader is
// waiting for. At the reader's own latitude the approaching prayer's line is exactly
// T/4 degrees of longitude east of them (a solar event shifts 4 min per degree). A zoom
// pivoting on the dot throws that point east; for a reader near the frame's east edge
// (Haparanda, Luleå) that would hide the line until the last minutes. So there, and only
// there, the PIVOT moves east — just far enough to hold the line at the edge, never past
// it. The line then enters the frame exactly when it would have at home zoom and stays in.
//
// Why the pivot and not the zoom: capping Δ instead was tried first. It made the lean wait
// and then catch up with the line — 0.15 zoom levels in a single 30 s tick for Haparanda,
// instead of a steady ramp. Moving the pivot keeps the zoom proportional everywhere;
// an east-edge reader's dot drifts west over several minutes, back home by the prayer.

import { type Camera, invMercY, mercX, mercY, project, unproject, worldSize } from './projection';

/** How long before a prayer the lean begins. */
export const APPROACH_LEAD_MS = 30 * 60_000;
/** How long after a prayer the lean takes to return to the home frame. */
export const APPROACH_RELEASE_MS = 20 * 60_000;
/** Zoom levels added at the prayer itself — 2^1.5 ≈ 2.8×. */
export const APPROACH_MAX_ZOOM = 1.5;
/** Changes smaller than this (≈0.7 % in scale) are not worth a camera move. */
export const APPROACH_MIN_STEP = 0.01;
/** Ease each 30 s update (about 1.7% scale inward, 2.6% outward). */
export const APPROACH_EASE_MS = 1200;
/** The longest a single catch-up may take — see {@link approachEaseMs}. */
const APPROACH_EASE_MAX_MS = 2400;
/** The approaching line is held at least this fraction of the width inside the east edge,
 *  so it is seen rather than grazing the bezel. */
export const LINE_EDGE_MARGIN = 0.03;
/** The dot must sit at least this far (px) inside the frame's top and side edges for a
 *  lean to start. Not the bottom: there the dock's own top edge is the limit, and Malmö
 *  sits only a few points above it by design (see SWEDEN_BOUNDS in bonetider) — an inset
 *  there once shut Sweden's third city out of the feature entirely. */
export const ANCHOR_INSET = 24;
/** A solar event moves 4 minutes per degree of longitude, at every latitude. */
export const MS_PER_DEGREE = 4 * 60_000;

export interface LonLatPoint {
  lon: number;
  lat: number;
}

/** 0..1 for the prayer that is coming: 0 at the lead window's start, 1 at the instant. */
function leadProximity(msUntil: number): number {
  return msUntil > 0 && msUntil < APPROACH_LEAD_MS ? 1 - msUntil / APPROACH_LEAD_MS : 0;
}

/** 0..1 for a prayer that has arrived: 1 at the instant, 0 once the release has run out. */
function releaseProximity(msSince: number): number {
  return msSince >= 0 && msSince < APPROACH_RELEASE_MS ? 1 - msSince / APPROACH_RELEASE_MS : 0;
}

/** The soonest instant strictly after `now`, or null. */
function nextInstant(now: number, instants: readonly number[]): number | null {
  let best: number | null = null;
  for (const at of instants) {
    if (Number.isFinite(at) && at > now && (best == null || at < best)) best = at;
  }
  return best;
}

/** The strongest release among the prayers that have already arrived. */
function releaseTerm(now: number, instants: readonly number[]): number {
  let best = 0;
  for (const at of instants) {
    if (!Number.isFinite(at)) continue;
    const p = releaseProximity(now - at);
    if (p > best) best = p;
  }
  return best;
}

/**
 * How close `now` is to a prayer, 0..1: rising linearly over the lead window, 1 at the
 * instant, falling linearly over the release. Where two windows overlap (a short winter
 * gap, a polar evening) the larger wins, so the lean holds rather than dipping out and
 * back in between them. `instants` are epoch ms in any order; non-finite ones (a prayer
 * adhan could not place) are ignored.
 */
export function approachProximity(now: number, instants: readonly number[]): number {
  const next = nextInstant(now, instants);
  const lead = next == null ? 0 : leadProximity(next - now);
  return Math.max(lead, releaseTerm(now, instants));
}

/**
 * When the stretch of non-zero proximity that `now` sits in ends — `now` itself when
 * there is none. Overlapping windows chain into one stretch. The screen suspends the
 * lean until then after the reader presses Återställ ("visa hela Sverige"): they asked
 * for the whole country, so the map must not lean back in on the next tick.
 */
export function approachWindowEnd(now: number, instants: readonly number[]): number {
  if (approachProximity(now, instants) <= 0) return now;
  const windows = instants
    .filter(Number.isFinite)
    .map((at) => [at - APPROACH_LEAD_MS, at + APPROACH_RELEASE_MS] as const)
    .sort((a, b) => a[0] - b[0]);
  let end = now;
  for (const [start, stop] of windows) {
    if (start < end && stop > end) end = stop;
  }
  return end;
}

/**
 * The zoom delta at `now`: the proximity, scaled to APPROACH_MAX_ZOOM. Identical for every
 * reader whose dot is in view — the guard below moves the pivot, never this.
 */
export function approachDelta(now: number, instants: readonly number[]): number {
  return APPROACH_MAX_ZOOM * approachProximity(now, instants);
}

/**
 * The camera the map should hold at `now`: `delta` zoom levels on top of the `home` frame,
 * pivoting on `anchor` (the reader's dot), or on a point east of it when the dot would
 * throw the approaching line out of frame (see THE GUARD). `bottomPad` is the strip the
 * dock covers — its real height, not the camera's fit padding, which adds a margin above.
 *
 * `delta` is 0 and the camera is `home` when no prayer is near, and also when the dot is
 * not inside the clear frame: a traveller outside Sweden gets no zoom toward a point they
 * cannot see, and a dot under the dock stays under it.
 */
export function approachPose(input: {
  now: number;
  instants: readonly number[];
  home: Camera;
  anchor: LonLatPoint;
  bottomPad: number;
  topPad?: number;
}): { delta: number; camera: Camera } {
  const { now, instants, home, anchor, bottomPad, topPad = 0 } = input;
  const u = project(anchor.lon, anchor.lat, home);
  const inView =
    u.x >= ANCHOR_INSET &&
    u.x <= home.width - ANCHOR_INSET &&
    u.y >= ANCHOR_INSET &&
    u.y <= home.height - bottomPad;
  const delta = inView ? approachDelta(now, instants) : 0;
  if (delta <= 0) return { delta: 0, camera: home };

  let pivotX = u.x;
  const next = nextInstant(now, instants);
  if (next != null && next - now < APPROACH_LEAD_MS) {
    const s = 2 ** delta;
    const edge = home.width * (1 - LINE_EDGE_MARGIN);
    // Where the approaching line crosses the reader's latitude, in home-frame pixels.
    // Mercator x is linear in longitude, so this holds at any latitude.
    const lineX = u.x + ((next - now) / MS_PER_DEGREE / 360) * worldSize(home.zoom);
    // Zooming by s about p carries the line to p + (lineX − p)·s. Solved for the line
    // landing exactly on the edge, that is the pivot below; the dot is the pivot whenever
    // it already keeps the line in, and the edge is as far east as the pivot may go.
    const needed = (lineX * s - edge) / (s - 1);
    pivotX = Math.min(Math.max(u.x, needed), Math.max(u.x, edge));
  }
  const pivot = unproject(pivotX, u.y, home);
  const camera = anchoredCamera(home, pivot, delta);
  // Only edge cities move vertically. Scale the clearance with the actual free map
  // area so larger text/docks and smaller screens retain a balanced composition.
  const freeHeight = Math.max(0, home.height - bottomPad - topPad);
  const clearance = freeHeight / 4;
  const targetY = Math.min(Math.max(u.y, topPad + clearance), topPad + freeHeight - clearance);
  const y = u.y + (targetY - u.y) * (delta / APPROACH_MAX_ZOOM);
  const centre = unproject(home.width / 2, home.height / 2 + u.y - y, camera);
  return { delta, camera: { ...camera, lon: centre.lon, lat: centre.lat } };
}

/**
 * The camera `delta` zoom levels closer than `home`, pivoting on `anchor`: the anchor
 * projects to the same screen pixel under both. Centres are the UNPADDED viewport centre,
 * the convention the overlay's camera mirror uses throughout.
 */
export function anchoredCamera(home: Camera, anchor: LonLatPoint, delta: number): Camera {
  const k = 2 ** -delta;
  const ax = mercX(anchor.lon);
  const ay = mercY(anchor.lat);
  const cx = ax + (mercX(home.lon) - ax) * k;
  const cy = ay + (mercY(home.lat) - ay) * k;
  return { ...home, lon: cx * 360 - 180, lat: invMercY(cy), zoom: home.zoom + delta };
}

/**
 * How long a camera move of `step` zoom levels should take. A tick's step (≈0.025) gets
 * the plain APPROACH_EASE_MS. A bigger one — coming back to the map after twenty minutes
 * on another screen, or tapping "Nu" after a scrub — is a catch-up, and gets more time in
 * proportion, so it arrives at the same unhurried pace instead of lunging.
 */
export function approachEaseMs(step: number): number {
  const scaled = APPROACH_EASE_MS * (Math.abs(step) / 0.1);
  return Math.min(APPROACH_EASE_MAX_MS, Math.max(APPROACH_EASE_MS, scaled));
}

/**
 * The coordinate MapLibre must be handed as `center` for `cam` to result when the camera
 * call carries `bottomPad` of padding. In maplibre-react-native v11 `center` is the
 * PADDED target — the middle of the area above the padding — not the viewport centre.
 */
export function paddedCentre(cam: Camera, bottomPad: number): LonLatPoint {
  return unproject(cam.width / 2, (cam.height - bottomPad) / 2, cam);
}
