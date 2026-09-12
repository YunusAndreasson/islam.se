// Where the solar field is looking, and how it moves.
//
// Split out of render-field.ts so the camera can be reasoned about and tested without
// a canvas, and so the mosque screen's engine can drive a tween without importing the
// 32 kB renderer chunk.
//
// A camera is a CENTRE and a SCALE in normalised-Mercator units — not a bounding box.
// That distinction is the whole design. A bbox carries an aspect ratio, so
// interpolating two bboxes on a 16:9 canvas either warps the aspect mid-move or needs
// a re-fit every frame; {cx, cy, scale} interpolates unambiguously (geometric in
// scale, linear in centre) and the canvas aspect is applied once, at the end.
//
// The other load-bearing choice is that the tween is a PURE FUNCTION OF THE CLOCK
// (see cameraAt) rather than an imperative animation with its own accumulated state.
// On a wall screen that runs for months this is what makes it self-healing: a frame
// freeze, an occluded window, a throttled hour or a clock correction all resolve to
// the camera the current time says is right, instead of finishing a stale animation
// late or drifting out of step for good.

import { mercX, mercY } from "./map/projection";

/** Centre in normalised-Mercator units, plus canvas pixels per Mercator unit. */
export interface Camera {
	cx: number;
	cy: number;
	scale: number;
}

/** The canvas and the insets the framing must respect. */
export interface Viewport {
	w: number;
	h: number;
	padX: number;
	padTop: number;
	/** The home variant reserves a band here for its floating readout. */
	padBottom: number;
}

export type BBox = readonly [west: number, south: number, east: number, north: number];

/**
 * Contain-fit: the whole bbox inside the padded frame, centred.
 *
 * This reproduces the framing render-field.ts has always used, including its
 * asymmetric padding — the `padBottom − padTop` term is what keeps the silhouette
 * sitting above the home variant's reserved dock band rather than under it.
 */
export function cameraForBBox(bbox: BBox, vp: Viewport): Camera {
	const [west, south, east, north] = bbox;
	const mxMin = mercX(west);
	const mxMax = mercX(east);
	const myMin = mercY(north); // north → smaller Mercator y
	const myMax = mercY(south);
	const availW = vp.w - 2 * vp.padX;
	const availH = vp.h - vp.padTop - vp.padBottom;
	const scale = Math.min(availW / (mxMax - mxMin), availH / (myMax - myMin));
	return {
		cx: (mxMin + mxMax) / 2,
		cy: (myMin + myMax) / 2 + (vp.padBottom - vp.padTop) / 2 / scale,
		scale,
	};
}

/**
 * A frame roughly `spanLatDeg` tall centred on a point.
 *
 * Latitude drives it rather than longitude because the thing being framed is Sweden's
 * north–south extent and the prayer lines' north–south run; a longitude span would
 * mean something different at Malmö than at Kiruna.
 *
 * Mercator forces a choice here and this function makes it deliberately: the point is
 * centred EXACTLY, and the degree span is honoured only to within about a percent.
 * The projection stretches northward, so a frame that spanned exactly lat ± half would
 * not have `lat` at its middle. Centring is the visual promise the move makes — the
 * mosque sits at the centre of the screen while the prayer line arrives on it — and
 * the span is an internal knob, so the span is what gives.
 */
export function cameraAround(lat: number, lon: number, spanLatDeg: number, vp: Viewport): Camera {
	const half = spanLatDeg / 2;
	const top = Math.min(84, lat + half);
	const bottom = Math.max(-84, lat - half);
	const mySpan = mercY(bottom) - mercY(top);
	return {
		cx: mercX(lon),
		cy: mercY(lat),
		scale: vp.h / mySpan,
	};
}

/**
 * Blend two cameras. `u` is already eased.
 *
 * Scale is interpolated GEOMETRICALLY. A linear blend of scale reads as a move that
 * lurches at one end and crawls at the other, because what the eye registers is the
 * ratio between successive frames, not the difference — the same reason zoom controls
 * are multiplicative.
 */
export function lerpCamera(a: Camera, b: Camera, u: number): Camera {
	return {
		cx: a.cx + (b.cx - a.cx) * u,
		cy: a.cy + (b.cy - a.cy) * u,
		scale: a.scale * (b.scale / a.scale) ** u,
	};
}

/** The lon/lat rectangle this camera actually shows. Sizes the wash footprint. */
export function visibleBBox(cam: Camera, vp: Viewport): BBox {
	const halfW = vp.w / 2 / cam.scale;
	const halfH = vp.h / 2 / cam.scale;
	return [
		(cam.cx - halfW) * 360 - 180,
		invMercLat(cam.cy + halfH),
		(cam.cx + halfW) * 360 - 180,
		invMercLat(cam.cy - halfH),
	];
}

function invMercLat(my: number): number {
	const t = Math.exp((0.5 - my) * 2 * Math.PI);
	return (2 * (Math.atan(t) - Math.PI / 4) * 180) / Math.PI;
}

export function easeInOutCubic(t: number): number {
	const u = Math.min(1, Math.max(0, t));
	return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
}

// ---------------------------------------------------------------------------
// The schedule
// ---------------------------------------------------------------------------

type CameraPhase = "wide" | "closing" | "close" | "opening";

export interface CameraSchedule {
	wide: Camera;
	close: Camera;
	/** Start closing this long before the prayer. */
	leadInMs: number;
	/** How long a move takes. */
	tweenMs: number;
	/** Stay close this long past the prayer before opening out again. */
	holdAfterMs: number;
}

export const DEFAULT_SCHEDULE = {
	// Ten minutes is long enough that the move is a signal rather than a surprise, and
	// short enough that the screen is wide for the great majority of the day.
	leadInMs: 10 * 60_000,
	tweenMs: 6_000,
	// Covers the adhān-to-iqāma gap plus the prayer itself, so the screen does not pull
	// back out while the room is still praying.
	holdAfterMs: 12 * 60_000,
} as const;

export interface CameraState {
	phase: CameraPhase;
	camera: Camera;
	/** 0 at the wide end, 1 at the close end. Exposed so the renderer can take its
	 *  cheap path while the value is strictly between the two. */
	u: number;
}

/**
 * The camera at an instant.
 *
 * `focusMs` is the moment being zoomed onto — the iqāma when the mosque holds one,
 * otherwise the adhān. `nextFocusMs` lets the camera stay in rather than pull out and
 * dive straight back when two prayers are close together, which in Sweden is most of
 * the summer: Maghrib and ʿIshāʾ converge in June, and Fajr and Shurūq sit minutes
 * apart for weeks.
 */
export function cameraAt(
	nowMs: number,
	focusMs: number | null,
	nextFocusMs: number | null,
	s: CameraSchedule,
): CameraState {
	if (focusMs === null) return { phase: "wide", camera: s.wide, u: 0 };

	const closeStart = focusMs - s.leadInMs;
	const closeEnd = closeStart + s.tweenMs;
	const holdEnd = focusMs + s.holdAfterMs;

	if (nowMs < closeStart) return { phase: "wide", camera: s.wide, u: 0 };

	if (nowMs < closeEnd) {
		const u = easeInOutCubic((nowMs - closeStart) / s.tweenMs);
		return { phase: "closing", camera: lerpCamera(s.wide, s.close, u), u };
	}

	if (nowMs < holdEnd) return { phase: "close", camera: s.close, u: 1 };

	// Stay close rather than open out and immediately close again on the next prayer.
	if (nextFocusMs !== null && nextFocusMs - s.leadInMs <= holdEnd + s.tweenMs)
		return { phase: "close", camera: s.close, u: 1 };

	if (nowMs < holdEnd + s.tweenMs) {
		const u = 1 - easeInOutCubic((nowMs - holdEnd) / s.tweenMs);
		return { phase: "opening", camera: lerpCamera(s.wide, s.close, u), u };
	}

	return { phase: "wide", camera: s.wide, u: 0 };
}
