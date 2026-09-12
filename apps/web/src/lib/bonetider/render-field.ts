// The Bönetider canvas: the app's signature prayer-time map, rebuilt for the web with
// no map library. Three layers over a Sweden silhouette, all from the ported (and tested)
// engine — the same maths the iOS/Android app uses:
//   1. Land   — warm parchment (light) / cool navy (dark), the basemap stand-in.
//   2. Wash   — the twilight, coloured by the sun's REAL depression below the horizon
//               (washColorAt), sampled per pixel and clipped to the silhouette.
//   3. Lines  — the sweeping prayer isolines: the level-0 contour of (prayerTime − now)
//               for each prayer (buildGrid/buildLines), so each line is the exact locus
//               where that prayer is happening across the country at this instant.
// A brass marker pins the chosen place. Pure-ish: hand it a <canvas> and a config, it draws.

import { type Camera, cameraForBBox, type Viewport } from "./camera";
import { mercX, mercY } from "./map/projection";
import { NEIGHBORS_OUTLINE } from "./neighbors-outline";
import {
	computePrayerTimes,
	nextPrayerKeyAt,
	PRAYER_LABELS,
	type PrayerKey,
	stockholmDayKey,
} from "./prayer-times";
import type { PrayerSettings } from "./settings";
import {
	buildGridAsync,
	buildLines,
	type PrayerLineLabel,
	type SolarGrid,
	type SolarLines,
} from "./solar/field";
import { PRAYER_COLORS, washStopsDark, washStopsLight } from "./solar/palette";
import { solarParams } from "./solar/sun";
import { bakeWashRows, type WashFootprint } from "./solar/wash-kernel";
import { SWEDEN_OUTLINE } from "./sweden-outline";

function plate(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number,
): void {
	ctx.beginPath();
	ctx.roundRect(x, y, w, h, r);
	ctx.fill();
}

export type Scheme = "light" | "dark";
export type Variant = "home" | "full" | "screen";

export interface FieldLocation {
	name: string;
	latitude: number;
	longitude: number;
}

export interface FieldConfig {
	location: FieldLocation;
	settings: PrayerSettings;
	scheme: Scheme;
	variant: Variant;
	/** Where the field is looking. Absent → the variant's default contain-fit of its
	 *  own frame, which is what home and full have always done. */
	camera?: Camera;
	/** True while a camera move is in flight. The renderer then takes its cheap path:
	 *  no shadow blur (the single most expensive step, measured at 5–25 ms a frame at
	 *  1080p) and no re-derived isolines. A line sweeps 0.25°/min, so over a six-second
	 *  move it travels about two pixels — freezing it is invisible and it is what makes
	 *  30 fps reachable on the Celeron-class box behind a mosque television. */
	moving?: boolean;
}

// Land + edge colours. Dark was the app's navy (#1d2333/#141a26/#171d2b) until
// 2026-07-27: wrong hue for a warm page, and the whole ramp inside L* 9.8–14.1,
// so at noon — when the wash is fully transparent and the bare land colour IS
// daylight — Sweden rendered black. Now L* 8 → 14 → 23 on the warm axis, sea
// kept relatively cooler so water still reads as water. See washStopsDark.NIGHT.
const LAND = { light: "#ece6d8", dark: "#3d382e" } as const;
const EDGE = { light: "rgba(26,23,18,0.20)", dark: "rgba(232,229,224,0.34)" } as const;
// The sea was #dfe7ec, and it was the one surface on this page pointing the wrong
// way. Measured in CIE Lab: the page background sits at b* +7.8 and the map's LAND
// at b* +7.5 — the same warm axis — while that sea sat at b* −3.35, an 11-point
// swing to the cold side. Against the older near-neutral page it passed; against
// the warm ground it read as a cold slab pasted onto the article.
//
// #dfe4e2 is cool RELATIVE to the land (7 points in b*) without the absolute blue
// cast that fought the page; dark follows the same rule. Keep in sync with
// `.bf-stage`'s pre-JS background in PrayerField.astro.
//
// ⚠️ 2026-07-28: that sea was right in HUE and wrong in LIGHTNESS. Measured against
// LAND it was ΔL* 1.2, and the neighbours ΔL* 2.1 — both under the ~3 L* JND, so in
// light mode the whole frame was one flat pale field and the translucent wash on top
// turned it to smudge. (Dark was never affected: 16.1 and 9.5.) Now a three-step
// ramp — Sweden 91.4, neighbours 86.5, sea 82.0 — which survives the wash while
// keeping b* on the warm side of neutral (+1.0) so it still belongs to this page.
const SEA = { light: "#c9cdca", dark: "#15171a" } as const;
const BRASS = { light: "#b8862f", dark: "#c89a48" } as const;
const ON_MARK = { light: "#fffdf8", dark: "#15171a" } as const;
// Surrounding countries — a muted tone between sea and Sweden's land, plus a barely-there
// coast, so the neighbours read as quiet context and Sweden stays the clear subject.
const NEIGHBOR_LAND = { light: "#ddd8cd", dark: "#26241e" } as const;
const NEIGHBOR_EDGE = { light: "rgba(26,23,18,0.10)", dark: "rgba(232,229,224,0.12)" } as const;

// The Arctic Circle: north of it the sun doesn't set at midsummer, which is where
// prayer times fall back to the nearest-latitude rule (`sunRisesAndSets` in
// solar/field.ts). Dashed, so it reads as neither coastline nor prayer line.
const ARCTIC_CIRCLE_LAT = 66.5622;
const GRATICULE = { light: "rgba(26,23,18,0.28)", dark: "rgba(232,229,224,0.26)" } as const;

// Anchor cities. The prayer isolines are absent ~35% of the day (measured: no line
// in frame roughly 07:00–12:20, when every locus is out over Asia or the Atlantic),
// which is honest but left the morning map empty. These give it permanent scale.
const ANCHORS: readonly { name: string; lat: number; lon: number }[] = [
	{ name: "Malmö", lat: 55.605, lon: 13.0 },
	{ name: "Göteborg", lat: 57.707, lon: 11.967 },
	{ name: "Stockholm", lat: 59.329, lon: 18.069 },
	{ name: "Sundsvall", lat: 62.39, lon: 17.306 },
	{ name: "Umeå", lat: 63.826, lon: 20.263 },
	{ name: "Luleå", lat: 65.584, lon: 22.157 },
	{ name: "Kiruna", lat: 67.856, lon: 20.226 },
] as const;
const ANCHOR_DOT = { light: "rgba(26,23,18,0.42)", dark: "rgba(232,229,224,0.42)" } as const;
const ANCHOR_TEXT = { light: "rgba(26,23,18,0.62)", dark: "rgba(232,229,224,0.58)" } as const;
// The subject town outranks the reference cities, so its name is set at full strength.
const MARKER_TEXT = { light: "rgba(26,23,18,0.92)", dark: "rgba(240,237,232,0.95)" } as const;
// Plate behind the isoline labels, in the page's own ground rather than plain white.
const LABEL_PLATE = { light: "rgba(255,246,232,0.88)", dark: "rgba(20,17,12,0.84)" } as const;

// The visible map AND the line grid both span Sweden plus a generous margin of
// surrounding sea and neighbours, so the sweeping prayer isolines read as full lines
// across the map (as in the app) — not stubs clipped at the coast. A prayer's line is
// the locus where that prayer happens *right now*; for most of the day it sits out over
// the sea east or west of Sweden, so a frame that hugged the country (the old
// [8,54.5,25.6,69.6]) cut those lines to a short streak at the edge. The silhouette
// still marks Sweden inside this wider frame; everything past its coast is open water
// the lines sweep across.
const VIEW_BBOX: [number, number, number, number] = [-8, 50, 30, 72];
// The lattice covers the WIDEST frame a variant can show, never the current camera —
// so zooming in costs no lattice work and a line does not stop at the old frame edge.
const GRID_BOUNDS: Record<Variant, [number, number, number, number]> = {
	home: VIEW_BBOX,
	full: VIEW_BBOX,
	screen: VIEW_BBOX,
};
// Finer in latitude than in longitude on the screen, on purpose: prayer time varies
// almost exactly linearly with longitude (−4 min/°), so marching squares' linear edge
// interpolation is near-exact along that axis, while the steep, nonlinear dependence
// is in latitude. Spending the cells where the curvature is buys a visibly smoother
// line at a wall's scale for far less than a uniform refinement would cost.
const GRID_STEP: Record<Variant, { latStep: number; lonStep: number }> = {
	home: { latStep: 0.6, lonStep: 0.95 },
	full: { latStep: 0.4, lonStep: 0.6 },
	screen: { latStep: 0.25, lonStep: 0.7 },
};

/**
 * Everything the canvas draws at an absolute pixel size, scaled to the canvas.
 *
 * The literals throughout this file were tuned against a 384 px card. On a 1920×1080
 * wall they would be hairlines: a 1.5 px isoline core is invisible across a foyer, and
 * 11 px labels are unreadable at four metres. `u` is 1 for home and full, so those two
 * are byte-identical to what the site already ships, and rises to about 3 on a screen.
 */
interface Metrics {
	u: number;
}

function metricsFor(variant: Variant, w: number, h: number): Metrics {
	// 360 is the reference short edge the existing literals were tuned at (the full
	// card is 384 px, the home card 304). Capped so a 4K panel does not draw a
	// cartoon.
	if (variant !== "screen") return { u: 1 };
	return { u: Math.min(3.5, Math.max(1, Math.min(w, h) / 360)) };
}

interface Transform {
	scale: number;
	ox: number;
	oy: number;
	mxMin: number;
	myMin: number;
	w: number;
	h: number;
}

/**
 * The frame a variant draws into, including the band the home variant reserves at the
 * bottom for its floating readout — the silhouette is fitted ABOVE it, never under.
 *
 * Exported because the screen's engine has to build the same wide camera the renderer
 * would, in order to schedule a move toward the close one.
 */
export function viewportFor(w: number, h: number, variant: Variant): Viewport {
	const reserveBottom = variant === "home" ? Math.max(74, h * 0.14) : 0;
	const pad = variant === "screen" ? 0.03 : 0.04;
	return {
		w,
		h,
		padX: w * (variant === "screen" ? 0.03 : 0.05),
		padTop: h * pad,
		padBottom: h * pad + reserveBottom,
	};
}

/**
 * A camera becomes a Transform by folding its centre into the projection origin, so
 * projX/projY stay the two-multiply expressions they have always been and nothing
 * downstream has to know the camera exists.
 */
function transformForCamera(cam: Camera, w: number, h: number): Transform {
	return {
		scale: cam.scale,
		ox: 0,
		oy: 0,
		mxMin: cam.cx - w / 2 / cam.scale,
		myMin: cam.cy - h / 2 / cam.scale,
		w,
		h,
	};
}

const projX = (lon: number, t: Transform): number => t.ox + (mercX(lon) - t.mxMin) * t.scale;
const projY = (lat: number, t: Transform): number => t.oy + (mercY(lat) - t.myMin) * t.scale;

/**
 * Un-wrap a ring that crosses the antimeridian. Two of the 30 rings in
 * NEIGHBORS_OUTLINE (Russia, and an Arctic sliver) span −179.6°…179.9°, and plain
 * Mercator drew them back across the whole frame as full-width bands of land
 * colour over open sea — which looks exactly like twilight banding, but isn't.
 * No-op for rings that don't wrap.
 */
function unwrap(ring: readonly (readonly [number, number])[]): readonly [number, number][] {
	let min = Number.POSITIVE_INFINITY;
	let max = Number.NEGATIVE_INFINITY;
	for (const [lon] of ring) {
		if (lon < min) min = lon;
		if (lon > max) max = lon;
	}
	if (max - min <= 180) return ring as readonly [number, number][];
	return ring.map(([lon, lat]) => [lon < 0 ? lon + 360 : lon, lat] as [number, number]);
}

function pathFor(rings: readonly (readonly [number, number])[][], t: Transform): Path2D {
	const p = new Path2D();
	for (const raw of rings) {
		const ring = unwrap(raw);
		ring.forEach(([lon, lat], i) => {
			const x = projX(lon, t);
			const y = projY(lat, t);
			if (i === 0) p.moveTo(x, y);
			else p.lineTo(x, y);
		});
		p.closePath();
	}
	return p;
}

/** Creates a renderer bound to one canvas. Caches the prayer-time grid by (day, settings). */
export function createFieldRenderer(canvas: HTMLCanvasElement) {
	const ctx0 = canvas.getContext("2d");
	if (!ctx0) throw new Error("bonetider: 2D canvas context unavailable");
	// Re-bind to a non-null const so the nested draw closures keep the narrowed type
	// (TypeScript drops `if (!ctx)` narrowing when `ctx` is captured by an inner function).
	const ctx = ctx0;
	const offscreen = document.createElement("canvas");

	// Label type matches the site's heading face (Source Sans 3) instead of the
	// system sans — the canvas is the only surface that can't inherit it via CSS.
	// Resolved lazily and cached on first use: getComputedStyle forces a style recalc,
	// so deferring it to the first real render (which is itself deferred until the field
	// scrolls into view) keeps that cost off the boot critical path for off-screen maps.
	// ctx.font can't read custom properties, so this must be resolved in JS.
	let labelFontFamily = "";
	function resolveLabelFont(): string {
		if (!labelFontFamily) {
			const fam = getComputedStyle(canvas).getPropertyValue("--font-heading").trim();
			labelFontFamily = fam || "ui-sans-serif, system-ui, -apple-system, sans-serif";
		}
		return labelFontFamily;
	}

	let grid: SolarGrid | null = null;
	let gridKey = "";

	// Keyed on the STOCKHOLM day, because that is the day the lattice holds: every cell comes
	// from computePrayerTimes, which resolves the Swedish day from the instant it is handed.
	// Under the visitor's local day the key outlived the Stockholm midnight it had to
	// invalidate, so a reader abroad kept yesterday's wash and contours for the hours between
	// the two midnights. See stockholmDayKey.
	const gridKeyFor = (now: Date, settings: PrayerSettings, variant: Variant) =>
		`${stockholmDayKey(now)}|${variant}|${JSON.stringify(settings)}`;

	/** The cached lattice, or null when it still has to be built. */
	function cachedGrid(now: Date, settings: PrayerSettings, variant: Variant): SolarGrid | null {
		return grid && gridKeyFor(now, settings, variant) === gridKey ? grid : null;
	}

	let building: Promise<SolarGrid> | null = null;
	let buildingKey = "";

	function ensureGridAsync(
		now: Date,
		settings: PrayerSettings,
		variant: Variant,
	): Promise<SolarGrid> {
		const key = gridKeyFor(now, settings, variant);
		if (building && key === buildingKey) return building;
		buildingKey = key;
		// ⚠️ Both writes below are guarded on the slot still being ours. Two settings
		// changes inside one build let the FIRST lattice resolve LAST: unguarded it
		// overwrote the newer one — cachedGrid then misses forever, so every minute tick
		// takes the promise path — and its failure branch cleared the NEWER build's slot,
		// starting a duplicate ~3 600-cell build on the next tick.
		const mine = buildGridAsync(now, settings, {
			bounds: GRID_BOUNDS[variant],
			...GRID_STEP[variant],
		}).then(
			(g) => {
				if (buildingKey === key) {
					grid = g;
					gridKey = key;
				}
				return g;
			},
			(err) => {
				if (buildingKey === key) {
					building = null;
					buildingKey = "";
				}
				throw err;
			},
		);
		building = mine;
		return mine;
	}

	// The wash is a pure function of (size, scheme, minute, viewport), and a cold render
	// now paints twice — once without the lattice, once with. Recomputing ~30 000
	// per-pixel solar solves for the second pass was the larger half of the remaining
	// long task. Keyed to the minute because that is the resolution the tick redraws at.
	let washKey = "";
	/** The Mercator rect the current buffer was solved over, so it can be re-projected
	 *  under a different camera instead of re-solved. */
	let washFp: WashFootprint | null = null;

	/** The buffer's own rect in Mercator units. The loop walks screen pixels and inverts
	 *  them, so the texels are already evenly spaced in Mercator — which is what makes a
	 *  plain source-rect blit exact at every latitude. */
	function footprintOf(t: Transform): WashFootprint {
		return {
			mxMin: t.mxMin - t.ox / t.scale,
			mxMax: t.mxMin + (t.w - t.ox) / t.scale,
			myMin: t.myMin - t.oy / t.scale,
			myMax: t.myMin + (t.h - t.oy) / t.scale,
		};
	}

	/**
	 * Re-project the buffer we already hold onto a different camera.
	 *
	 * Screen space is a uniform scale-and-translate of Mercator space, so the mapping
	 * from texel to screen is affine and axis-aligned: one drawImage with a source rect,
	 * no per-pixel work at all. This is what makes a camera move cheap — the alternative
	 * is ~58 000 solar solves every frame, which is most of a frame budget on the kind of
	 * box that ends up behind a mosque television. The wash blurs while the camera is in
	 * flight, because a wide-baked buffer is being magnified; nobody can see that during a
	 * six-second move, and the settling frame re-solves at full resolution.
	 */
	function blitWash(t: Transform, fp: WashFootprint): boolean {
		const fw = fp.mxMax - fp.mxMin;
		const fh = fp.myMax - fp.myMin;
		if (fw <= 0 || fh <= 0) return false;
		const view = footprintOf(t);
		// Only when the new view sits INSIDE what was solved. Closing in always does;
		// opening back out does not, and blitting anyway would drag transparent bands
		// across the edges of the map where the buffer has no texels.
		if (
			view.mxMin < fp.mxMin ||
			view.mxMax > fp.mxMax ||
			view.myMin < fp.myMin ||
			view.myMax > fp.myMax
		)
			return false;
		const sx = ((view.mxMin - fp.mxMin) / fw) * offscreen.width;
		const sy = ((view.myMin - fp.myMin) / fh) * offscreen.height;
		const sw = ((view.mxMax - view.mxMin) / fw) * offscreen.width;
		const sh = ((view.myMax - view.myMin) / fh) * offscreen.height;
		if (!(sw > 0 && sh > 0)) return false;
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = "high";
		ctx.drawImage(offscreen, sx, sy, sw, sh, 0, 0, t.w, t.h);
		return true;
	}

	function drawWash(t: Transform, now: Date, scheme: Scheme, moving: boolean): void {
		// Half resolution while the camera is in flight. Opening back out cannot reuse the
		// buffer (see blitWash), so those frames do solve the sun again — at a quarter of
		// the texels, which is invisible on a frame that is on screen for 16 ms and is the
		// difference between a move that glides and one that stutters.
		const div = moving ? 8 : 4;
		const sw = Math.max(48, Math.round(t.w / div));
		const sh = Math.max(48, Math.round(t.h / div));
		// The key has to identify the VIEW, which means the footprint: the buffer is baked for
		// one rectangle of mercator space and is wrong for any other. It used to carry scale
		// plus ox/oy, which was sound under the old fixed-bbox fitTransform but is not under
		// transformForCamera — that pins ox/oy to 0 always and folds the camera centre into
		// mxMin/myMin, so two of the key's four positional components became dead constants
		// and the pan left the key entirely. Two cameras at the same scale pointing at
		// different places were indistinguishable, and the second blitted the first's sky over
		// its map with no per-pixel work left to correct it. Masked today only because the two
		// cameras in play happen to differ in scale.
		const fp = footprintOf(t);
		const key = `${sw}x${sh}|${scheme}|${Math.floor(now.getTime() / 60000)}|${fp.mxMin.toFixed(4)}|${fp.myMin.toFixed(4)}|${fp.mxMax.toFixed(4)}|${fp.myMax.toFixed(4)}`;
		if (key === washKey && offscreen.width === sw && offscreen.height === sh) {
			ctx.imageSmoothingEnabled = true;
			ctx.imageSmoothingQuality = "high";
			ctx.drawImage(offscreen, 0, 0, t.w, t.h);
			return;
		}
		// Mid-move: re-project what we have rather than solving the sun again.
		if (moving && washFp && offscreen.width > 0 && blitWash(t, washFp)) return;
		const stops = scheme === "dark" ? washStopsDark : washStopsLight;
		const { declRad, eotMin } = solarParams(now);
		const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes() + now.getUTCSeconds() / 60;
		offscreen.width = sw;
		offscreen.height = sh;
		const octx = offscreen.getContext("2d");
		if (!octx) return;
		const img = octx.createImageData(sw, sh);
		// The per-texel solve moved to solar/wash-kernel.ts, which is the same maths with
		// the four arrays per texel (two from mix4, one from the RGBA return, one from
		// sunPositionAt's {altDeg, haDeg}) inlined into scalars: measured 496 → 165
		// ns/texel, so this block went from 64 ms to 21 ms at 1920×1080. The kernel is
		// pinned to washColorAt by wash-kernel.test.ts, which sweeps the frame and
		// demands an exact channel-for-channel match, so the shader twin still has one
		// spec and not two.
		//
		// The footprint is this canvas's own visible rect in mercator units. The loop
		// used to walk screen pixels and invert them, so the texels were ALREADY evenly
		// spaced in mercator y rather than in latitude; expressing that as a rectangle
		// changes nothing here and is what lets the screen variant blit the same buffer
		// under a moving camera.
		bakeWashRows(img.data, sw, sh, 0, sh, fp, stops, declRad, eotMin, utcMin);
		octx.putImageData(img, 0, 0);
		washKey = key;
		washFp = fp;
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = "high";
		ctx.drawImage(offscreen, 0, 0, t.w, t.h);
	}

	/** A glow under a crisp core, which is what makes a line read as light on the map
	 *  rather than as a drawn stroke.
	 *
	 *  shadowBlur is by far the most expensive thing this canvas does — measured at
	 *  5–25 ms a frame at 1080p, enough on its own to put a camera move under 30 fps on
	 *  signage hardware. While the camera is moving it is replaced by a second, wider,
	 *  fainter stroke: indistinguishable at wall-viewing distance, pure fast-path
	 *  rasterising, and the real blur returns the moment the camera settles. */
	function strokeIsoline(
		path: Path2D,
		color: string,
		isNext: boolean,
		m: Metrics,
		moving: boolean,
	): void {
		ctx.save();
		ctx.strokeStyle = color;
		ctx.globalAlpha = isNext ? 0.32 : 0.2;
		ctx.lineWidth = (isNext ? 6 : 4) * m.u;
		if (moving) {
			ctx.stroke(path);
			ctx.globalAlpha = isNext ? 0.14 : 0.09;
			ctx.lineWidth = (isNext ? 13 : 9) * m.u;
		} else {
			ctx.shadowColor = color;
			ctx.shadowBlur = (isNext ? 12 : 8) * m.u;
		}
		ctx.stroke(path);
		ctx.restore();

		ctx.save();
		ctx.strokeStyle = color;
		ctx.globalAlpha = 0.96;
		ctx.lineWidth = (isNext ? 2.2 : 1.5) * m.u;
		ctx.stroke(path);
		ctx.restore();
	}

	function drawLines(
		t: Transform,
		lines: SolarLines["lines"],
		scheme: Scheme,
		nextKey: PrayerKey | null,
		m: Metrics,
		moving: boolean,
	): void {
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		for (const feat of lines.features) {
			const prayer = feat.properties.prayer;
			const color = scheme === "dark" ? PRAYER_COLORS[prayer].dark : PRAYER_COLORS[prayer].light;
			const isNext = prayer === nextKey;
			for (const seg of feat.geometry.coordinates) {
				const path = new Path2D();
				seg.forEach(([lon, lat], i) => {
					const x = projX(lon, t);
					const y = projY(lat, t);
					if (i === 0) path.moveTo(x, y);
					else path.lineTo(x, y);
				});
				strokeIsoline(path, color, isNext, m, moving);
			}
		}
	}

	// Name each visible isoline so it reads as "Maghrib is happening along this line right
	// now", not an unlabelled stroke. Positions come from buildLines' labelPlacement; the
	// label is pushed perpendicular to the line so the sweep never crosses the text.
	function drawLabels(t: Transform, labels: PrayerLineLabel[], scheme: Scheme, m: Metrics): void {
		if (labels.length === 0) return;
		ctx.save();
		ctx.font = `600 ${11 * m.u}px ${resolveLabelFont()}`;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.lineJoin = "round";
		for (const lab of labels) {
			const color =
				scheme === "dark" ? PRAYER_COLORS[lab.prayer].dark : PRAYER_COLORS[lab.prayer].light;
			const [lon, lat] = lab.lngLat;
			const x = projX(lon, t);
			const y = projY(lat, t);
			// Tangent direction in screen space (project a nearby point along the tangent).
			const x2 = projX(lon + lab.tangent[0] * 0.1, t);
			const y2 = projY(lat + lab.tangent[1] * 0.1, t);
			let dx = x2 - x;
			let dy = y2 - y;
			const len = Math.hypot(dx, dy) || 1;
			dx /= len;
			dy /= len;
			// Push the label perpendicular to the line.
			const off = 11 * m.u;
			const lx = x - dy * off;
			const ly = y + dx * off;
			const text = PRAYER_LABELS[lab.prayer];
			// ⚠️ These labels are the only ones carrying transliteration marks (ʿIshāʾ,
			// Ẓuhr). A strokeText halo is wider than those marks at 11 px, so it filled
			// them in and the word came out chewed. A plate reads cleaner and cannot eat
			// a glyph. Kept off the city names — they need no protection on quiet land,
			// and plating all ten would clutter the map.
			const wpx = ctx.measureText(text).width;
			ctx.fillStyle = LABEL_PLATE[scheme];
			plate(ctx, lx - wpx / 2 - 4.5 * m.u, ly - 8 * m.u, wpx + 9 * m.u, 16 * m.u, 4 * m.u);
			ctx.fillStyle = color;
			ctx.fillText(text, lx, ly);
		}
		ctx.restore();
	}

	/** The Arctic Circle, dashed, named at the left edge. */
	function drawGraticule(t: Transform, scheme: Scheme, variant: Variant, m: Metrics): void {
		const y = projY(ARCTIC_CIRCLE_LAT, t);
		if (y < 0 || y > t.h) return;
		ctx.save();
		ctx.strokeStyle = GRATICULE[scheme];
		ctx.lineWidth = 1 * m.u;
		ctx.setLineDash([5 * m.u, 5 * m.u]);
		ctx.beginPath();
		ctx.moveTo(0, y);
		ctx.lineTo(t.w, y);
		ctx.stroke();
		ctx.setLineDash([]);
		if (variant !== "home") {
			ctx.font = `600 ${10 * m.u}px ${resolveLabelFont()}`;
			ctx.textAlign = "left";
			ctx.textBaseline = "alphabetic";
			ctx.fillStyle = GRATICULE[scheme];
			ctx.fillText("Polcirkeln", 10 * m.u, y - 5 * m.u);
		}
		ctx.restore();
	}

	/** Anchor cities — a dot each, named on the full variant. The current location
	 *  is skipped; it already carries the brass marker. */
	function drawAnchors(
		t: Transform,
		loc: FieldLocation,
		scheme: Scheme,
		variant: Variant,
		m: Metrics,
	): void {
		const mx = projX(loc.longitude, t);
		const my = projY(loc.latitude, t);
		ctx.save();
		ctx.font = `500 ${10 * m.u}px ${resolveLabelFont()}`;
		ctx.textAlign = "left";
		ctx.textBaseline = "middle";
		for (const a of ANCHORS) {
			const x = projX(a.lon, t);
			const y = projY(a.lat, t);
			if (Math.hypot(x - mx, y - my) < 14 * m.u) continue;
			ctx.beginPath();
			ctx.arc(x, y, 1.6 * m.u, 0, Math.PI * 2);
			ctx.fillStyle = ANCHOR_DOT[scheme];
			ctx.fill();
			if (variant !== "home") {
				ctx.fillStyle = ANCHOR_TEXT[scheme];
				ctx.fillText(a.name, x + 4.5 * m.u, y);
			}
		}
		ctx.restore();
	}

	/** ⚠️ The marker names itself. Every reference city on the map carried its name
	 *  while the one the page is ABOUT was the single unlabelled dot — drawAnchors
	 *  drops any anchor sitting under the marker, and that dropped the name with the
	 *  dot. Naming it here rather than in ANCHORS covers all 2 128 towns, not the 7
	 *  anchors. Flipped to the left when the marker sits near the right edge so the
	 *  name never runs off the canvas. */
	function drawMarker(
		t: Transform,
		loc: FieldLocation,
		scheme: Scheme,
		variant: Variant,
		m: Metrics,
	): void {
		const x = projX(loc.longitude, t);
		const y = projY(loc.latitude, t);
		ctx.save();
		ctx.beginPath();
		ctx.arc(x, y, 8 * m.u, 0, Math.PI * 2);
		ctx.fillStyle = scheme === "dark" ? "rgba(200,154,72,0.22)" : "rgba(184,134,47,0.20)";
		ctx.fill();
		ctx.beginPath();
		ctx.arc(x, y, 3.4 * m.u, 0, Math.PI * 2);
		ctx.fillStyle = BRASS[scheme];
		ctx.fill();
		ctx.lineWidth = 1.5 * m.u;
		ctx.strokeStyle = ON_MARK[scheme];
		ctx.stroke();
		if (variant !== "home" && loc.name) {
			ctx.font = `600 ${11 * m.u}px ${resolveLabelFont()}`;
			ctx.textBaseline = "middle";
			const wpx = ctx.measureText(loc.name).width;
			const flip = x + wpx + 14 * m.u > t.w;
			ctx.textAlign = flip ? "right" : "left";
			const lx = x + (flip ? -11 : 11) * m.u;
			// ⚠️ A stroked halo cannot work on this label. Its colour has to be picked
			// per SCHEME, but the marker sits wherever the town is, and that ground runs
			// from full daylight to deep night inside one map — so on the night side the
			// near-white halo turned into a glow around the word and read as agitated.
			// The plate is independent of whatever the wash is doing underneath, and it
			// matches the isoline labels, so the canvas has one label system.
			ctx.fillStyle = LABEL_PLATE[scheme];
			plate(
				ctx,
				flip ? lx - wpx - 4.5 * m.u : lx - 4.5 * m.u,
				y - 8 * m.u,
				wpx + 9 * m.u,
				16 * m.u,
				4 * m.u,
			);
			ctx.fillStyle = MARKER_TEXT[scheme];
			ctx.fillText(loc.name, lx, y);
		}
		ctx.restore();
	}

	/** One full canvas pass. `g` null = the lattice is not ready, so the isolines and
	 *  their labels are skipped; everything else paints. The map therefore appears at
	 *  once and the lines arrive on the second pass, in the correct z-order. */
	function paint(cfg: FieldConfig, now: Date, g: SolarGrid | null): void {
		const w = canvas.clientWidth || canvas.width;
		const h = canvas.clientHeight || canvas.height;
		// A 4K panel at dpr 2 asks for four times the fill of a 1080p one for the same
		// apparent sharpness — on signage hardware that is the difference between a
		// smooth move and a slideshow, and at four metres nobody can see the gain.
		const dpr = Math.min(window.devicePixelRatio || 1, cfg.variant === "screen" ? 1.5 : 2);
		if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
			canvas.width = Math.round(w * dpr);
			canvas.height = Math.round(h * dpr);
		}
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, w, h);

		const m = metricsFor(cfg.variant, w, h);
		const vp = viewportFor(w, h, cfg.variant);
		// No camera means "frame the whole country", which is what home and full have
		// always shown and what the screen shows for most of the day.
		const t = transformForCamera(cfg.camera ?? cameraForBBox(VIEW_BBOX, vp), w, h);
		const path = pathFor(SWEDEN_OUTLINE, t);
		const neighbors = pathFor(NEIGHBORS_OUTLINE, t);

		// 1. Sea (opaque base), then the surrounding countries in a muted tone, then Sweden
		//    in the full land tone on top — so the frame reads as a real Nordic/Baltic map
		//    with Sweden as the clear subject, not a lone silhouette in empty sea.
		ctx.fillStyle = SEA[cfg.scheme];
		ctx.fillRect(0, 0, w, h);
		// Nonzero, not evenodd: neighbours share borders, and even-odd cancels the
		// overlaps into holes.
		ctx.fillStyle = NEIGHBOR_LAND[cfg.scheme];
		ctx.fill(neighbors);
		ctx.fillStyle = LAND[cfg.scheme];
		ctx.fill(path);

		// 2. Wash over the WHOLE stage (sea + land), like the app — the night darkens
		//    everything by the sun's depression, not just the land.
		drawWash(t, now, cfg.scheme, cfg.moving === true);

		// 3. Prayer isolines — drawn across the whole stage (sea included), like the app, so
		//    every line is visible and matches its label. (Clipping them to land used to hide
		//    lines that run mostly over sea while their label still showed.)
		const times = computePrayerTimes(cfg.location, now, cfg.settings);
		const nextKey = nextPrayerKeyAt(times, now.getTime());
		const solar = g ? buildLines(g, now.getTime()) : null;
		if (solar) drawLines(t, solar.lines, cfg.scheme, nextKey, m, cfg.moving === true);

		// 4. Coastlines — neighbours barely there, Sweden crisp on top.
		ctx.lineJoin = "round";
		ctx.lineWidth = 1 * m.u;
		ctx.strokeStyle = NEIGHBOR_EDGE[cfg.scheme];
		ctx.stroke(neighbors);
		ctx.strokeStyle = EDGE[cfg.scheme];
		ctx.stroke(path);

		// 5. Standing geography — present at every hour, unlike the sweeping lines.
		drawGraticule(t, cfg.scheme, cfg.variant, m);
		drawAnchors(t, cfg.location, cfg.scheme, cfg.variant, m);

		// 6. Place marker.
		drawMarker(t, cfg.location, cfg.scheme, cfg.variant, m);

		// 7. Line labels (over everything) so each isoline names its prayer.
		if (solar) drawLabels(t, solar.labels, cfg.scheme, m);
	}

	/** Generation guard: a later render (settings change, minute tick) must win, so a
	 *  slow lattice from a superseded call can never paint over the current one. */
	let generation = 0;

	function render(cfg: FieldConfig, now: Date): void {
		const mine = ++generation;
		const cached = cachedGrid(now, cfg.settings, cfg.variant);
		if (cached) {
			paint(cfg, now, cached);
			return;
		}
		// Cold lattice: paint ONCE, when it is ready. Painting a line-less map first and
		// repainting after cost two full canvas passes (~300 ms each, measured) — worse
		// than the wait it hid, and the wait is no longer a freeze because buildGridAsync
		// yields. The pre-JS `.bf-stage` background covers the gap.
		//
		// WARM lattice is the opposite case and gets the opposite answer: at the Stockholm
		// midnight roll-over, and on a settings change, we already hold yesterday's lattice
		// and the canvas would otherwise hold a stale frame for the ~1.3 s rebuild. On a
		// page that is read for a minute nobody notices; on a mosque wall that never
		// navigates, it is the camera visibly stopping dead mid-move once a day. Yesterday's
		// lines are wrong by a prayer's day-over-day drift — one to four minutes, a couple
		// of pixels — for those seconds, which is invisible and far better than a stall.
		if (grid) paint(cfg, now, grid);
		ensureGridAsync(now, cfg.settings, cfg.variant)
			.then((g) => {
				if (mine === generation) paint(cfg, now, g);
			})
			.catch(() => {
				// The base map is already on screen; losing the lattice costs the isolines,
				// not the page. ensureGridAsync has already freed its own slot — and only its
				// own — so the next tick retries instead of caching the failure.
			});
	}

	return { render };
}
