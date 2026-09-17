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
import { invMercY, mercX, mercY } from "./map/projection";
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
import { buildGridOffMainThread } from "./solar/grid-client";
import { PRAYER_COLORS, PRAYER_TEXT_COLORS, washStopsDark, washStopsLight } from "./solar/palette";
import { solarParams, sunPositionAt } from "./solar/sun";
import { bakeWashRows, type WashFootprint } from "./solar/wash-kernel";
import { washColorAt } from "./solar/washColor";
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
	/** The wall's own detailed map (map-detail.ts). Nothing else passes one, because
	 *  static-importing it would put 2 MB into every city page's bundle. */
	detail?: MapDetail;
	/** Draw the qibla from the marker. The wall only. */
	qibla?: boolean;
	/** It is Friday and the mosque holds jumuʿa, so the Ẓuhr line is named Jumuʿa, as the
	 *  rank beside the map already names it. */
	jumua?: boolean;
	/** CSS px at the canvas's left edge that sit under something opaque-ish (the wall's type
	 *  pane). The map still draws there; no label is placed there. */
	occludedLeft?: number;
	/** Every mosque in the directory, [lon, lat], drawn as a point of warm light (drawLights).
	 *  The wall only: an article map is about one place, the wall about the community. */
	lights?: readonly (readonly [lon: number, lat: number])[];
	/** The wall's two frames: the country, and the close-up round the mosque it moves to before
	 *  each prayer. The renderer keeps the detailed map finished for both — baked ahead while
	 *  the screen is idle — so a move shows the real map instead of the coarse outline, and the
	 *  frame it settles on is a copy rather than a repaint (paintGround). The wall only. */
	frames?: { wide: Camera; close: Camera };
}

type Ring = readonly (readonly [number, number])[];

/** What map-detail.ts exports: Natural Earth 1:10m land that shares one set of borders,
 *  and lakes, rivers and towns each tagged with the zoom they first appear at — so the
 *  map gains detail as the camera closes in on the mosque. */
export interface MapDetail {
	sweden: readonly Ring[];
	neighbors: readonly Ring[];
	/** Skerries and small islands; `se` gives them Sweden's land tone. */
	islands: readonly { z: number; se: boolean; ring: Ring }[];
	lakes: readonly { z: number; ring: Ring }[];
	rivers: readonly { z: number; line: Ring }[];
	towns: readonly MapLabel[];
	/** Land borders, dashed on the wall as the app draws them. */
	borders: readonly Ring[];
	countries: readonly MapLabel[];
	seas: readonly MapLabel[];
	/** The neighbours' cities, by their Swedish names. */
	cities: readonly MapLabel[];
	/** National parks and nature reserves (OpenStreetMap) — the app's green patches. */
	parks: readonly Ring[];
	/** The app's hillshade, baked (relief-screen.webp); undefined until it has loaded. */
	relief: ReliefImage | undefined;
}

export interface MapLabel {
	name: string;
	lat: number;
	lon: number;
	z: number;
}

/** A shaded-relief image covering a block of Web Mercator tiles. */
export interface ReliefImage {
	image: CanvasImageSource;
	z: number;
	x0: number;
	y0: number;
	cols: number;
	rows: number;
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

/* Sweden's area centroid, near Ånge. The ink decision below is about the MAP, not about
   the place the page names: these variants always frame the whole country, so a reader in
   a dark Malmö still needs the lit north drawn in ink that reads there. */
const SWEDEN_CENTRE = { lat: 62.8, lon: 16.7 } as const;

/**
 * Which scheme's cartographic ink reads on the ground the wash leaves behind — which is
 * not the page's scheme.
 *
 * The wash goes on over the land and sea FILLS (drawWash, step 2) and everything
 * structural is drawn on top of it: the coastline, the Polcirkeln graticule, the city
 * anchors. Those were all inked from the page scheme, so after ʿIshāʾ in light mode the
 * parchment was washed to a near-black indigo (#282d49 at the NIGHT stop, alpha 0.88)
 * while its ink stayed the near-black chosen for parchment. Dark on dark: the country
 * outline disappeared, every city name went to a smudge, and the only legible mark left
 * on the map was the Stockholm pill — which survived only because it carries its own
 * plate. Land and sea converge under that wash too (ΔL* well under the JND), so the
 * coastline is the single thing holding the shape, and it was the first thing lost.
 *
 * Dark mode never showed the fault: there the wash deepens a ground whose inks were
 * already picked against darkness.
 *
 * The crossover is relative luminance 0.18, the point where contrast against white and
 * against black are equal. One decision per frame, taken at SWEDEN_CENTRE: at full night
 * and full day the whole map agrees, and through dusk the land/sea contrast still carries
 * the shape while the terminator crosses. (Per-mark sampling would be exact at dusk and is
 * the obvious refinement if a half-lit frame ever reads wrong.)
 */
export function inkSchemeFor(now: Date, scheme: Scheme): Scheme {
	const stops = scheme === "dark" ? washStopsDark : washStopsLight;
	const { declRad, eotMin } = solarParams(now);
	const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes() + now.getUTCSeconds() / 60;
	const { altDeg, haDeg } = sunPositionAt(
		SWEDEN_CENTRE.lat,
		SWEDEN_CENTRE.lon,
		utcMin,
		declRad,
		eotMin,
	);
	const [wr, wg, wb, wa] = washColorAt(altDeg, haDeg, stops);
	const base = LAND[scheme];
	const srgb = (wash: number, ground: number): number => {
		const v = (wash * wa + ground * (1 - wa)) / 255;
		return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
	};
	const lum =
		0.2126 * srgb(wr, Number.parseInt(base.slice(1, 3), 16)) +
		0.7152 * srgb(wg, Number.parseInt(base.slice(3, 5), 16)) +
		0.0722 * srgb(wb, Number.parseInt(base.slice(5, 7), 16));
	return lum < 0.18 ? "dark" : "light";
}

// THE WALL GETS ITS OWN RAMP. Everything above is tuned for a map 304–384 px wide sitting
// inside an article, where the cartography must not shout over the prose: Sweden L* 91.4,
// neighbours 86.5, sea 82.0 — the whole frame inside 9.4 L*. Blown up to 840 x 884 on a
// television that compression stops reading as restraint and starts reading as grey haze,
// with the coastline at 20% alpha too faint to give it an edge.
//
// So the screen widens the ramp to ~24 L* and doubles the coast's weight. It is the same
// hues on the same warm axis — nothing here fights the parchment, and the article variants
// are untouched, which matters because 2 128 city pages render them.
//
// The dark halves follow the app's dark basemap (nordicStyle.ts DARK): one navy continent
// with no ramp between Sweden and its neighbours, and the sea receding beneath it. Not its
// exact values, though. The app's #1d2233 land on #0e1424 sea is 7 L* apart, which reads on
// a phone held at arm's length; on a wall seen from metres away, under the night wash that
// darkens both, land and sea became one navy field. So the land is lifted, the sea lowered,
// and the coast gets a hairline the app does not draw (SCREEN_COAST, drawGround).
const SCREEN_LAND = { light: "#efe8d6", dark: "#283047" } as const;
const SCREEN_NEIGHBOR_LAND = { light: "#dcd4c1", dark: "#283047" } as const;
const SCREEN_SEA = { light: "#adb7b5", dark: "#0a0e1a" } as const;
const SCREEN_COAST = { light: "rgba(26,23,18,0.25)", dark: "rgba(200,212,255,0.22)" } as const;
const SCREEN_EDGE = { light: "rgba(26,23,18,0.22)", dark: "rgba(232,229,224,0.26)" } as const;
const SCREEN_NEIGHBOR_EDGE = {
	light: "rgba(26,23,18,0.17)",
	dark: "rgba(232,229,224,0.17)",
} as const;
// Stroked under a prayer line, in the ground's own tone. A casing is how a printed map
// keeps a route legible across everything it crosses; the glow this replaces was doing
// the same job by smearing the line's own colour 36 px into the sea.
const SCREEN_CASING = { light: "rgba(255,246,232,0.38)", dark: "rgba(20,17,12,0.36)" } as const;
// Lower than the article map's 0.88: at 840 px the opaque plate read as a UI chip
// dropped onto the map rather than a label belonging to it.
const SCREEN_PLATE = { light: "rgba(255,246,232,0.52)", dark: "rgba(20,17,12,0.50)" } as const;
// ⚠️ The article maps plate their two special labels because a halo, at 11 px, was wider
// than the marks in "ʿIshāʾ" and "Ẓuhr" and chewed the glyphs. The wall does not have that
// problem: its label font is 11 × m.u ≈ 26 px, and a halo set as a FRACTION of the font
// (0.22em, stroked before the fill so only the outer half shows) is ~2.9 px there — far
// narrower than the marks. The old halo was a fixed width, which is why it only ever
// worked at one size. Plates were also the last thing on this map that looked like UI: six
// town names stood bare and two sat on chips, and the inconsistency was the tell.
const SCREEN_HALO = { light: "rgba(250,247,240,0.92)", dark: "rgba(18,22,36,0.92)" } as const;

// THE APP'S MAP, ON THE WALL. The mobile app's basemap is a MapLibre style over
// OpenStreetMap tiles (apps/mobile/src/lib/map/nordicStyle.ts) and its lines and pills are
// Skia (components/map/skia, MapMarkersOverlay). The wall has no map engine and fetches
// nothing while it runs, so it borrows those values and draws the same layers from baked
// data: map-detail.ts and relief-screen.webp. Sizes on the wall are the app's points × m.u,
// which is within a few per cent of the phone's own scale for a map this size.
const APP_MAP = {
	light: {
		park: "rgba(120,140,104,0.2)",
		boundary: "rgba(40,33,22,0.22)",
		placeInk: "#6f6456",
		faintInk: "#8c8170",
		waterInk: "#7d8a93",
		pill: "#fffdf8",
		accent: "#33437a",
	},
	dark: {
		park: "rgba(96,124,108,0.22)",
		boundary: "rgba(220,228,255,0.14)",
		placeInk: "#c1c6d4",
		faintInk: "#b1b8cd",
		waterInk: "#7c8aa0",
		// A shade above the lifted land (SCREEN_LAND), as the app's #222840 sits above its own.
		pill: "#303852",
		accent: "#adbcf8",
	},
} as const;
// The app's line widths, trimmed a little: a television is watched from further away than
// a phone, but its halo is also far larger on the retina than the phone's ever is.
const LINE_SCALE = 0.85;
/** The halo layer's resolution against the canvas (drawHalos). */
const GLOW_DOWNSCALE = 0.25;
/** The mosques as light (drawLights): points of the mark's gold (--mark-gold) over a faint
 *  brass warmth, brass being the wall's colour for the congregation. Radii are in m.u like
 *  every mark on this canvas; a point is a fifth of the chosen mosque's own marker (3.4u,
 *  ringed), which has to stay the subject. Colours are RGB triplets. */
const LIGHT = {
	dot: 0.7,
	alpha: 0.7,
	warmthRadius: 2.2,
	warmthBlur: 2.2,
	warmthAlpha: 0.32,
	gold: "250,212,134",
	brass: "200,154,72",
} as const;
/** The parks are OpenStreetMap's, and ODbL wants the credit where the map is. */
const CREDIT = "© OpenStreetMap";
/** Canvas `filter` blurs the app-style halo in one pass; Safari has none. */
const CAN_FILTER =
	typeof CanvasRenderingContext2D !== "undefined" && "filter" in CanvasRenderingContext2D.prototype;
const rgbOf = (hex: string): string => {
	const n = Number.parseInt(hex.slice(1), 16);
	return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
};

interface Cartography {
	land: string;
	neighborLand: string;
	sea: string;
	edge: string;
	neighborEdge: string;
	/** Screen only. A casing stroked under each prayer line so it stays readable over
	 *  both the lit and the dark half of the same map — the modern cartographic way of
	 *  doing what a glow was doing badly. Empty string = no casing (the article maps). */
	casing: string;
	/** The plate behind a label. The wall wants a scrim, not a chip. */
	plate: string;
	/** Screen only. A stroked halo instead of a plate — empty string keeps the plate. */
	halo: string;
}

function cartographyFor(variant: Variant, scheme: Scheme): Cartography {
	if (variant === "screen")
		return {
			land: SCREEN_LAND[scheme],
			neighborLand: SCREEN_NEIGHBOR_LAND[scheme],
			sea: SCREEN_SEA[scheme],
			edge: SCREEN_EDGE[scheme],
			neighborEdge: SCREEN_NEIGHBOR_EDGE[scheme],
			casing: SCREEN_CASING[scheme],
			plate: SCREEN_PLATE[scheme],
			halo: SCREEN_HALO[scheme],
		};
	return {
		land: LAND[scheme],
		neighborLand: NEIGHBOR_LAND[scheme],
		sea: SEA[scheme],
		edge: EDGE[scheme],
		neighborEdge: NEIGHBOR_EDGE[scheme],
		casing: "",
		plate: LABEL_PLATE[scheme],
		halo: "",
	};
}

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
const ANCHOR_NAMES = new Set(ANCHORS.map((a) => a.name));

// The Kaaba, and how the wall draws the direction to it (drawQibla).
const KAABA = { lat: 21.4225, lon: 39.8262 } as const;
const QIBLA_LABEL = "Qibla";
// The app's QiblaArc: gone by a third of the way to Mecca, so it reads as a direction.
const QIBLA_FADE = 0.33;

// How far each side of ʿ and ʾ is tucked in, in em: their Literata side bearings brought
// down to a letter's. The same numbers as MosqueScreen.astro's .ms-ayn / .ms-hamza.
const MARK_TUCK: Readonly<Record<string, readonly [before: number, after: number]>> = {
	ʿ: [0.13, 0.16],
	ʾ: [0.16, 0.12],
};

/**
 * Points along the great circle from one place to another, [lon, lat].
 *
 * The qibla is the great-circle direction, not a compass course: from Göteborg it leaves
 * at 139°, and Mercator — conformal — shows that angle truly at the marker, while the
 * line itself bends as it goes. A straight line at 139° would only be right at its start.
 */
function greatCircle(
	lat1: number,
	lon1: number,
	lat2: number,
	lon2: number,
	steps = 160,
): [number, number][] {
	const rad = Math.PI / 180;
	const unit = (lat: number, lon: number): [number, number, number] => [
		Math.cos(lat * rad) * Math.cos(lon * rad),
		Math.cos(lat * rad) * Math.sin(lon * rad),
		Math.sin(lat * rad),
	];
	const a = unit(lat1, lon1);
	const b = unit(lat2, lon2);
	const omega = Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
	const sin = Math.sin(omega) || 1;
	const out: [number, number][] = [];
	for (let i = 0; i <= steps; i++) {
		const f = i / steps;
		const ka = Math.sin((1 - f) * omega) / sin;
		const kb = Math.sin(f * omega) / sin;
		const x = ka * a[0] + kb * b[0];
		const y = ka * a[1] + kb * b[1];
		const z = ka * a[2] + kb * b[2];
		out.push([Math.atan2(y, x) / rad, Math.atan2(z, Math.hypot(x, y)) / rad]);
	}
	return out;
}

// Level of detail on the wall. Natural Earth tags every lake, river and town with the
// web-map zoom it first belongs at; the renderer works out its own zoom from the camera
// (zoomOf) and draws a feature from LOD_LEAD before that. At 1080p the country-wide frame
// sits near z5.3 — the great lakes and main rivers — and the frame around a mosque near
// z6.4, which brings in the small lakes, the tributaries and the towns.
const LOD_LEAD = 0.6;
const ANCHOR_DOT = { light: "rgba(26,23,18,0.42)", dark: "rgba(232,229,224,0.42)" } as const;
const ANCHOR_TEXT = { light: "rgba(26,23,18,0.62)", dark: "rgba(232,229,224,0.58)" } as const;
// The subject town outranks the reference cities, so its name is set at full strength.
const MARKER_TEXT = { light: "rgba(26,23,18,0.92)", dark: "rgba(240,237,232,0.95)" } as const;
/** The marker's own name, in px. On the wall a step above the cities round it (drawAppPlaces)
 *  rather than the article maps' 11: at 11 × u it was 34 px and bold, the largest place name on the
 *  map, repeating the ort that already heads the type column beside it. */
const markerLabelSize = (variant: Variant, m: Metrics): number =>
	(variant === "screen" ? 8.5 : 11) * m.u;
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
	// The wall's map runs to the screen edges and shows ~60° of longitude, so a lattice
	// over VIEW_BBOX ended every prayer line at lon −8 — Maghrib stopped dead in the
	// middle of the North Sea. Matched to the detailed map's clip instead, so a line
	// can only end where the land data ends too. About three times the samples; built
	// asynchronously once a day on a device doing nothing else.
	screen: [-26, 44, 46, 78],
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
	/** Labels keep right of this (FieldConfig.occludedLeft). */
	safeLeft?: number;
}

/**
 * The frame a variant draws into, including the band the home variant reserves at the
 * bottom for its floating readout — the silhouette is fitted ABOVE it, never under.
 *
 * Exported because the screen's engine has to build the same wide camera the renderer
 * would, in order to schedule a move toward the close one.
 */
function viewportFor(w: number, h: number, variant: Variant): Viewport {
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

/** Rings, or open lines when `closed` is false (rivers). */
function pathFor(rings: readonly Ring[], t: Transform, closed = true): Path2D {
	const p = new Path2D();
	for (const raw of rings) {
		const ring = unwrap(raw);
		ring.forEach(([lon, lat], i) => {
			const x = projX(lon, t);
			const y = projY(lat, t);
			if (i === 0) p.moveTo(x, y);
			else p.lineTo(x, y);
		});
		// ⚠️ Not when the ring already ends where it starts — and every ring in the data does.
		// closePath was the single largest cost of repainting the wall, 630 ms over four
		// repaints (CPU profile, 1920x1080) across the ~4 000 rings of parks, lakes and
		// islands; a fill closes each subpath by itself.
		const first = ring[0];
		const last = ring[ring.length - 1];
		if (closed && !(first && last && first[0] === last[0] && first[1] === last[1])) p.closePath();
	}
	return p;
}

/** The web-map zoom a transform draws at, in the 256 px tiles Natural Earth's min_zoom
 *  is written for. t.scale is canvas pixels across the whole Mercator square. */
const zoomOf = (t: Transform): number => Math.log2(t.scale / 256);

type Extent = readonly [west: number, south: number, east: number, north: number];

/** Lon/lat extent of a ring, measured once: the detailed map's arrays are module
 *  constants that live as long as the wall does. */
const RING_EXTENT = new WeakMap<Ring, Extent>();
function extentOf(ring: Ring): Extent {
	const cached = RING_EXTENT.get(ring);
	if (cached) return cached;
	let west = Number.POSITIVE_INFINITY;
	let south = Number.POSITIVE_INFINITY;
	let east = Number.NEGATIVE_INFINITY;
	let north = Number.NEGATIVE_INFINITY;
	for (const [lon, lat] of ring) {
		if (lon < west) west = lon;
		if (lon > east) east = lon;
		if (lat < south) south = lat;
		if (lat > north) north = lat;
	}
	const extent: Extent = [west, south, east, north];
	RING_EXTENT.set(ring, extent);
	return extent;
}

/** What a transform can see, in degrees. The inverse of projX/projY at the canvas edges. */
function viewOf(t: Transform): Extent {
	const lon = (x: number): number => ((x - t.ox) / t.scale + t.mxMin) * 360 - 180;
	const lat = (y: number): number => invMercY((y - t.oy) / t.scale + t.myMin);
	return [lon(0), lat(t.h), lon(t.w), lat(0)];
}

/**
 * The detailed map's rings for one frame: what Natural Earth puts at this zoom, and only
 * what the camera can see.
 *
 * ⚠️ The culling is not optional. Around a mosque the frame is about a sixth of the map's
 * width, and handing the canvas every river and lake in the window regardless took each
 * repaint there from ~125 ms to 200–265 ms (measured at 1920x1080) — for strokes that
 * all landed off-screen.
 */
function detailFor(
	detail: MapDetail,
	t: Transform,
): {
	sweden: Ring[];
	neighbors: Ring[];
	lakes: Ring[];
	rivers: Ring[];
	parks: Ring[];
	borders: Ring[];
} {
	const zoom = zoomOf(t) + LOD_LEAD;
	const [w, s, e, n] = viewOf(t);
	const inView = (ring: Ring): boolean => {
		const [rw, rs, re, rn] = extentOf(ring);
		return rw <= e && re >= w && rs <= n && rn >= s;
	};
	const islands = detail.islands.filter((i) => i.z <= zoom && inView(i.ring));
	return {
		sweden: [...detail.sweden.filter(inView), ...islands.filter((i) => i.se).map((i) => i.ring)],
		neighbors: [
			...detail.neighbors.filter(inView),
			...islands.filter((i) => !i.se).map((i) => i.ring),
		],
		lakes: detail.lakes.filter((l) => l.z <= zoom && inView(l.ring)).map((l) => l.ring),
		rivers: detail.rivers.filter((r) => r.z <= zoom && inView(r.line)).map((r) => r.line),
		parks: detail.parks.filter(inView),
		borders: detail.borders.filter(inView),
	};
}

type FrameSlot = "wide" | "close";

/** How far short of the frame's edge, in CSS px, the close-up's layer may fall and still be
 *  faded in. The wall's stage runs 24 px past the screen on every side the type pane leaves
 *  open (MosqueScreen.astro .ms-stage) and the burn-in orbit moves it by up to 6, so a
 *  half-transparent layer edge inside 16 px never reaches the glass. */
const LAYER_FEATHER = 16;
/** The most the country-wide layer is widened on any side, as a fraction of the frame, to take
 *  in a close-up that reaches past it (bakeLayer). */
const LAYER_MARGIN_MAX = 0.25;

/** The wall's label inset: wider than the 24 px its stage bleeds past the screen edge. */
const screenLabelInset = (w: number, h: number): number => Math.max(34, 0.035 * Math.min(w, h));

/** Creates a renderer bound to one canvas. Caches the prayer-time grid by (day, settings). */
export function createFieldRenderer(canvas: HTMLCanvasElement) {
	const ctx0 = canvas.getContext("2d");
	if (!ctx0) throw new Error("bonetider: 2D canvas context unavailable");
	// Re-bound with an explicit non-null type so the nested draw closures keep it (TypeScript
	// drops `if (!ctx)` narrowing when `ctx` is captured by an inner function). A `let`, because
	// bakeLayer points every draw function at a layer's canvas for the length of one bake.
	let ctx: CanvasRenderingContext2D = ctx0;
	const offscreen = document.createElement("canvas");
	/** The prayer lines' halos, blurred in one pass (drawAppLines). */
	const glow = document.createElement("canvas");
	/** The wall's finished ground for each of its frames (FieldConfig.frames, bakeLayer). */
	const layers: Record<FrameSlot, GroundLayer> = { wide: emptyLayer(), close: emptyLayer() };
	/** Whether the last paint was a camera move: no layer is baked in the middle of one. */
	let inMove = false;
	let bakeQueued = false;
	let bakeCfg: FieldConfig | null = null;

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
	let bodyFontFamily = "";
	function resolveBodyFont(): string {
		if (!bodyFontFamily) {
			const fam = getComputedStyle(canvas).getPropertyValue("--font-body").trim();
			bodyFontFamily = fam || "Georgia, serif";
		}
		return bodyFontFamily;
	}

	/** A label as runs, each ʿ and ʾ set in Literata and tucked in (MARK_TUCK). Source Sans 3,
	 *  the label face, has no glyph for either mark, so the canvas borrowed a system font's —
	 *  wide enough that the Friday line read »Jumu ʿa«. Offsets are from the label's left
	 *  edge; `width` is the whole label's. Leaves ctx.font on the label face. */
	function markedRuns(
		text: string,
		weight: number,
		size: number,
	): { runs: { part: string; font: string; x: number }[]; width: number } {
		const face = `${weight} ${size}px ${resolveLabelFont()}`;
		const markFace = `${weight} ${size}px ${resolveBodyFont()}`;
		const runs: { part: string; font: string; x: number }[] = [];
		let x = 0;
		for (const part of text.split(/([ʿʾ])/)) {
			if (part === "") continue;
			const tuck = MARK_TUCK[part];
			ctx.font = tuck ? markFace : face;
			if (tuck) x -= tuck[0] * size;
			runs.push({ part, font: ctx.font, x });
			x += ctx.measureText(part).width - (tuck ? tuck[1] * size : 0);
		}
		ctx.font = face;
		return { runs, width: x };
	}

	let grid: SolarGrid | null = null;
	let gridKey = "";
	/** The isolines last built, and the lattice they were built from (linesFor). */
	let heldLines: { grid: SolarGrid; solar: SolarLines } | null = null;

	/**
	 * The prayer lines for one frame — held, not rebuilt, while the camera moves.
	 *
	 * FieldConfig.moving has always promised »no re-derived isolines«, and paint() rebuilt them
	 * on every frame regardless: marching squares over the wall's 137 × 104 lattice for six
	 * prayers, chained, smoothed and splined, ~13 ms a frame on a desktop (measured, node) and
	 * the largest piece of JavaScript in a CPU profile of the move. A line sweeps 0.25°/min —
	 * about two pixels over a six-second move — so the held lines are true to the eye, and the
	 * frame the camera settles on builds them fresh.
	 */
	function linesFor(g: SolarGrid, now: Date, moving: boolean): SolarLines {
		if (moving && heldLines?.grid === g) return heldLines.solar;
		const solar = buildLines(g, now.getTime());
		heldLines = { grid: g, solar };
		return solar;
	}

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
		// The wall builds in a worker (grid-client.ts). The article maps keep the yielding
		// builder: their lattice is a quarter the size, and built once per visit.
		const build = variant === "screen" ? buildGridOffMainThread : buildGridAsync;
		const mine = build(now, settings, {
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

	function drawWash(
		t: Transform,
		now: Date,
		scheme: Scheme,
		moving: boolean,
		variant: Variant,
	): void {
		// Half resolution while the camera is in flight. Opening back out cannot reuse the
		// buffer (see blitWash), so those frames do solve the sun again — at a quarter of
		// the texels, which is invisible on a frame that is on screen for 16 ms and is the
		// difference between a move that glides and one that stutters.
		// A wall shows one gradient for months at 840 x 884; a quarter-resolution buffer
		// upscaled to that is the soft, banded haze the twilight reads as. Half resolution
		// costs ~31 ms of solar solves, once a minute, on a device doing nothing else.
		const div = moving ? 8 : variant === "screen" ? 2 : 4;
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
	/** The app's prayer line (SolarSkiaOverlay): a soft Gaussian halo in the prayer's hue
	 *  under a crisp core. Every halo goes onto one offscreen layer that is blurred ONCE as
	 *  it is composited — a blur per line would be up to six full-canvas filters a repaint.
	 *  While the camera moves there is no halo at all, only the cores, and where the canvas
	 *  cannot filter (Safari) the halo is left out rather than drawn as a hard band. */
	function drawAppLines(
		t: Transform,
		lines: SolarLines["lines"],
		scheme: Scheme,
		nextKey: PrayerKey | null,
		m: Metrics,
		moving: boolean,
	): void {
		const segs = appSegments(t, lines, scheme, nextKey);
		if (!moving && CAN_FILTER && segs.length > 0) drawHalos(segs, m);
		ctx.save();
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		for (const s of segs) {
			ctx.strokeStyle = s.color;
			ctx.globalAlpha = s.isNext ? 1 : 0.95;
			ctx.lineWidth = (s.isNext ? 3.4 : 2) * m.u * LINE_SCALE;
			ctx.stroke(s.path);
		}
		ctx.restore();
	}

	/** The article card's line, unchanged: a soft bloom around a thin core. At u = 1 the
	 *  bloom is 6–12 px and reads as light spilling off the line, which is right at that
	 *  size. While the camera moves, three flat strokes stand in for the blur — pure
	 *  fast-path rasterising, and the real blur returns the moment it settles. */
	function strokeGlowing(
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

	interface LineSeg {
		path: Path2D;
		color: string;
		isNext: boolean;
	}

	function appSegments(
		t: Transform,
		lines: SolarLines["lines"],
		scheme: Scheme,
		nextKey: PrayerKey | null,
	): LineSeg[] {
		const segs: LineSeg[] = [];
		for (const feat of lines.features) {
			const prayer = feat.properties.prayer;
			const color = scheme === "dark" ? PRAYER_COLORS[prayer].dark : PRAYER_COLORS[prayer].light;
			for (const seg of feat.geometry.coordinates) {
				const path = new Path2D();
				seg.forEach(([lon, lat], i) => {
					if (i === 0) path.moveTo(projX(lon, t), projY(lat, t));
					else path.lineTo(projX(lon, t), projY(lat, t));
				});
				segs.push({ path, color, isNext: prayer === nextKey });
			}
		}
		return segs;
	}

	/** The halos, blurred on a canvas a quarter of the size and scaled up onto the map. A
	 *  halo is soft by nature, so the low resolution cannot be seen, and the blur — the most
	 *  expensive thing this canvas does — then costs a sixteenth of the pixels at a quarter
	 *  of the radius. At full resolution it took each repaint of the wall from ~90 ms to
	 *  ~340 ms (measured at 1920x1080). */
	function drawHalos(segs: readonly LineSeg[], m: Metrics): void {
		const g = glow.getContext("2d");
		if (!g) return;
		const dpr = ctx.getTransform().a;
		const w = Math.max(1, Math.round(canvas.width * GLOW_DOWNSCALE));
		const h = Math.max(1, Math.round(canvas.height * GLOW_DOWNSCALE));
		if (glow.width !== w || glow.height !== h) {
			glow.width = w;
			glow.height = h;
		}
		g.setTransform(1, 0, 0, 1, 0, 0);
		g.clearRect(0, 0, w, h);
		const k = dpr * GLOW_DOWNSCALE;
		g.setTransform(k, 0, 0, k, 0, 0);
		g.filter = `blur(${9 * m.u * LINE_SCALE * k}px)`;
		g.lineCap = "round";
		g.lineJoin = "round";
		for (const s of segs) {
			g.strokeStyle = s.color;
			g.globalAlpha = s.isNext ? 0.6 : 0.4;
			g.lineWidth = (s.isNext ? 17 : 11) * m.u * LINE_SCALE;
			g.stroke(s.path);
		}
		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = "high";
		ctx.drawImage(glow, 0, 0, canvas.width, canvas.height);
		ctx.restore();
	}

	/**
	 * The mosques, as light: small, even points of the mark's gold, each with a faint warmth
	 * around it — lamps seen from far off, not sparkle. None is named and none outranks
	 * another; the chosen mosque has the marker, and these are the community around it, read
	 * as texture, found when you look at the map and never the first thing on the wall.
	 *
	 * Every point goes into ONE path and is filled once. That is what keeps it clean: where
	 * mosques crowd together their points merge into one shape at one strength, so Stockholm
	 * reads as a denser patch of the same light rather than a brighter one. A first version
	 * gave every mosque its own glow, and the glows stacked — southern Sweden glittered
	 * louder than the prayer times, and Stockholm's forty fused into a hot disc. The warmth
	 * is that same union, filled wider on the quarter-size glow canvas and blurred once. Like
	 * the prayer lines' halos it is left out while the camera moves, and where the canvas
	 * cannot blur; the points themselves are drawn on every frame.
	 *
	 * Over the wash and under everything else, so a prayer line runs across them and a place
	 * name's halo clears room for its word.
	 */
	function drawLights(cfg: FieldConfig, t: Transform, m: Metrics): void {
		const lights = cfg.lights;
		// A light needs a night to be light in, and the wall is always dark.
		if (!lights || lights.length === 0 || cfg.scheme !== "dark") return;
		const ownX = projX(cfg.location.longitude, t);
		const ownY = projY(cfg.location.latitude, t);
		const r = LIGHT.dot * m.u;
		const rw = LIGHT.warmthRadius * m.u;
		const points = new Path2D();
		const warmth = new Path2D();
		for (const [lon, lat] of lights) {
			const x = projX(lon, t);
			const y = projY(lat, t);
			if (x < -rw || y < -rw || x > t.w + rw || y > t.h + rw) continue;
			// The chosen mosque is on the list as well, and its marker is drawn over this spot.
			if (Math.hypot(x - ownX, y - ownY) < r) continue;
			points.moveTo(x + r, y);
			points.arc(x, y, r, 0, Math.PI * 2);
			warmth.moveTo(x + rw, y);
			warmth.arc(x, y, rw, 0, Math.PI * 2);
		}

		const g = cfg.moving !== true && CAN_FILTER ? glow.getContext("2d") : null;
		if (g) {
			const dpr = ctx.getTransform().a;
			const w = Math.max(1, Math.round(canvas.width * GLOW_DOWNSCALE));
			const h = Math.max(1, Math.round(canvas.height * GLOW_DOWNSCALE));
			if (glow.width !== w || glow.height !== h) {
				glow.width = w;
				glow.height = h;
			}
			const k = dpr * GLOW_DOWNSCALE;
			g.setTransform(1, 0, 0, 1, 0, 0);
			g.clearRect(0, 0, w, h);
			g.setTransform(k, 0, 0, k, 0, 0);
			g.filter = `blur(${LIGHT.warmthBlur * m.u * k}px)`;
			g.fillStyle = `rgb(${LIGHT.brass})`;
			g.fill(warmth);
			g.filter = "none";
			ctx.save();
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.globalAlpha = LIGHT.warmthAlpha;
			ctx.imageSmoothingEnabled = true;
			ctx.imageSmoothingQuality = "high";
			ctx.drawImage(glow, 0, 0, canvas.width, canvas.height);
			ctx.restore();
		}

		ctx.save();
		ctx.globalAlpha = LIGHT.alpha;
		ctx.fillStyle = `rgb(${LIGHT.gold})`;
		ctx.fill(points);
		ctx.restore();
	}

	/** Lakes, in the sea's own colour on top of the land. The wall draws them as fills
	 *  only: stroked at coast weight, Finland's ~90 lakes turned the right third of the
	 *  map into a scribble, and the fill against the land is all the edge a lake needs. */
	function fillLakes(
		rings: readonly Ring[],
		variant: Variant,
		t: Transform,
		m: Metrics,
		carto: Cartography,
	): void {
		if (rings.length === 0) return;
		const lakes = pathFor(rings, t);
		ctx.fillStyle = carto.sea;
		ctx.fill(lakes);
		if (variant === "screen") return;
		ctx.strokeStyle = carto.neighborEdge;
		ctx.lineWidth = m.u;
		ctx.stroke(lakes);
	}

	/** Rivers, in the sea's colour — the same water as the lakes they run between — and
	 *  thinner than Sweden's coast, so they read as texture inside the land, not as
	 *  borders across it. */
	function strokeRivers(
		lines: readonly Ring[],
		t: Transform,
		m: Metrics,
		carto: Cartography,
	): void {
		if (lines.length === 0) return;
		ctx.save();
		ctx.strokeStyle = carto.sea;
		ctx.lineWidth = 0.9 * Math.sqrt(m.u);
		ctx.lineJoin = "round";
		ctx.lineCap = "round";
		ctx.stroke(pathFor(lines, t, false));
		ctx.restore();
	}

	/** Coastlines and borders. The wall strokes no coast at all, as the app does not: water
	 *  against land is the coastline. It draws only the land borders, as the app's faint
	 *  dashed hairline (boundary_country). The article maps keep their hairline outlines. */
	function strokeCoasts(
		variant: Variant,
		scheme: Scheme,
		m: Metrics,
		carto: Cartography,
		ground: { sweden: Path2D; neighbors: Path2D; borders: Path2D | null },
		/** The ink the washed ground can carry — see inkSchemeFor. The wall bakes its
		 *  coasts UNDER the wash, so it has no such problem and keeps `scheme`. */
		ink: Scheme = scheme,
	): void {
		if (variant === "screen") {
			if (!ground.borders) return;
			const w = 0.9 * m.u;
			ctx.save();
			ctx.strokeStyle = APP_MAP[scheme].boundary;
			ctx.lineWidth = w;
			ctx.lineCap = "round";
			ctx.lineJoin = "round";
			ctx.setLineDash([3 * w, 2 * w]);
			ctx.stroke(ground.borders);
			ctx.restore();
			return;
		}
		ctx.lineJoin = "round";
		ctx.lineWidth = m.u;
		ctx.strokeStyle = ink === scheme ? carto.neighborEdge : NEIGHBOR_EDGE[ink];
		ctx.stroke(ground.neighbors);
		ctx.strokeStyle = ink === scheme ? carto.edge : EDGE[ink];
		ctx.stroke(ground.sweden);
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
				strokeGlowing(path, color, isNext, m, moving);
			}
		}
	}

	// ── Label layout ─────────────────────────────────────────────────────────
	// Decided before anything is drawn, so a city name can give way to a prayer line's
	// label, which carries the news. On the wall two things went wrong without it: the
	// Maghrib label landed on »Sundsvall«, and labels were drawn into the strip the stage
	// bleeds past the screen edge, so only half a word — or a sliver — was left visible.
	interface LabelBox {
		x: number;
		y: number;
		w: number;
		h: number;
	}

	interface PlacedLabel {
		prayer: PrayerKey;
		text: string;
		lx: number;
		ly: number;
		box: LabelBox;
	}

	const overlaps = (a: LabelBox, b: LabelBox): boolean =>
		a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

	const insideSafe = (b: LabelBox, t: Transform, inset: number): boolean =>
		b.x >= inset + (t.safeLeft ?? 0) &&
		b.y >= inset &&
		b.x + b.w <= t.w - inset &&
		b.y + b.h <= t.h - inset;

	/** Where each isoline label goes. `inset` null keeps the article maps exactly as they
	 *  were: every label drawn, wherever it lands. Positions come from buildLines'
	 *  labelPlacement; the label is pushed perpendicular to the line so the sweep never
	 *  crosses the text. */
	function placeLabels(
		t: Transform,
		labels: PrayerLineLabel[],
		m: Metrics,
		inset: number | null,
		jumua: boolean,
	): PlacedLabel[] {
		ctx.save();
		ctx.font = `600 ${11 * m.u}px ${resolveLabelFont()}`;
		const out: PlacedLabel[] = [];
		for (const lab of labels) {
			const [lon, lat] = lab.lngLat;
			const x = projX(lon, t);
			const y = projY(lat, t);
			// Tangent direction in screen space (project a nearby point along the tangent).
			const x2 = projX(lon + lab.tangent[0] * 0.1, t);
			const y2 = projY(lat + lab.tangent[1] * 0.1, t);
			const len = Math.hypot(x2 - x, y2 - y) || 1;
			// The wall centres its pill ON the line, as the app does, so the line reads
			// straight through it; the article maps push the label off to one side.
			const off = inset === null ? 11 * m.u : 0;
			const lx = x - ((y2 - y) / len) * off;
			const ly = y + ((x2 - x) / len) * off;
			const text = jumua && lab.prayer === "dhuhr" ? "Jumuʿa" : PRAYER_LABELS[lab.prayer];
			const tw = ctx.measureText(text).width + 8 * m.u;
			// Measured bold, so the next prayer's pill fits the same box.
			const box =
				inset === null
					? { x: lx - tw / 2, y: ly - 8 * m.u, w: tw, h: 16 * m.u }
					: pillGeometry(text, lx, ly, m, true).box;
			if (inset !== null && !insideSafe(box, t, inset)) continue;
			out.push({ prayer: lab.prayer, text, lx, ly, box });
		}
		ctx.restore();
		return out;
	}

	/** The wall reserves an inset — wider than the 24 px the stage bleeds past the screen
	 *  edge — and hands the placed boxes to drawAnchors so the city names can yield. */
	function layoutLabels(cfg: FieldConfig, t: Transform, m: Metrics, labels: PrayerLineLabel[]) {
		const inset = cfg.variant === "screen" ? screenLabelInset(t.w, t.h) : null;
		const placed = placeLabels(t, labels, m, inset, cfg.jumua === true);
		return { inset, placed, avoid: inset === null ? [] : placed.map((pl) => pl.box) };
	}

	function drawLabels(
		placed: PlacedLabel[],
		scheme: Scheme,
		m: Metrics,
		carto: Cartography,
		nextKey: PrayerKey | null,
	): void {
		if (placed.length === 0) return;
		if (carto.halo !== "") {
			for (const pl of placed) drawPill(pl, scheme, m, pl.prayer === nextKey);
			return;
		}
		ctx.save();
		ctx.font = `600 ${11 * m.u}px ${resolveLabelFont()}`;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.lineJoin = "round";
		for (const pl of placed) {
			const color =
				scheme === "dark" ? PRAYER_COLORS[pl.prayer].dark : PRAYER_COLORS[pl.prayer].light;
			// ⚠️ These labels are the only ones carrying transliteration marks (ʿIshāʾ,
			// Ẓuhr). A strokeText halo is wider than those marks at 11 px, so it filled
			// them in and the word came out chewed. A plate reads cleaner and cannot eat
			// a glyph.
			const wpx = ctx.measureText(pl.text).width;
			ctx.fillStyle = carto.plate;
			plate(ctx, pl.lx - wpx / 2 - 4 * m.u, pl.ly - 7.5 * m.u, wpx + 8 * m.u, 15 * m.u, 2 * m.u);
			ctx.fillStyle = color;
			ctx.fillText(pl.text, pl.lx, pl.ly);
		}
		ctx.restore();
	}

	/** The pill's shape and text runs for a prayer name centred at (cx, cy). */
	function pillGeometry(text: string, cx: number, cy: number, m: Metrics, bold: boolean) {
		const size = 11 * m.u;
		const { runs, width } = markedRuns(text, bold ? 700 : 500, size);
		const w = width + 14 * m.u;
		const h = size * 1.2 + 6 * m.u;
		return { runs, width, box: { x: cx - w / 2, y: cy - h / 2, w, h } };
	}

	/** The app's prayer pill (MapMarkersOverlay): an opaque chip a shade lighter than the
	 *  night map, ringed in the line's hue, the name in the hue's text colour. The next
	 *  prayer's is bolder with a thicker ring — emphasis never costs a pill its colour.
	 *  Its ʿ and ʾ are set in their own runs (markedRuns). */
	function drawPill(pl: PlacedLabel, scheme: Scheme, m: Metrics, isNext: boolean): void {
		const { runs, width, box } = pillGeometry(pl.text, pl.lx, pl.ly, m, isNext);
		ctx.save();
		ctx.beginPath();
		ctx.roundRect(box.x, box.y, box.w, box.h, box.h / 2);
		ctx.fillStyle = APP_MAP[scheme].pill;
		ctx.fill();
		ctx.lineWidth = (isNext ? 1.5 : 1) * m.u;
		ctx.strokeStyle =
			scheme === "dark" ? PRAYER_COLORS[pl.prayer].dark : PRAYER_COLORS[pl.prayer].light;
		ctx.stroke();
		ctx.fillStyle =
			scheme === "dark" ? PRAYER_TEXT_COLORS[pl.prayer].dark : PRAYER_TEXT_COLORS[pl.prayer].light;
		ctx.textAlign = "left";
		ctx.textBaseline = "middle";
		const left = pl.lx - width / 2;
		for (const run of runs) {
			ctx.font = run.font;
			ctx.fillText(run.part, left + run.x, pl.ly);
		}
		ctx.restore();
	}

	/** The Arctic Circle, dashed, named at the left edge. */
	function drawGraticule(t: Transform, scheme: Scheme, variant: Variant, m: Metrics): void {
		const y = projY(ARCTIC_CIRCLE_LAT, t);
		if (y < 0 || y > t.h) return;
		ctx.save();
		ctx.strokeStyle = GRATICULE[scheme];
		// Same √u rule as the coasts on the wall — a reference line, not a feature.
		const gw = variant === "screen" ? Math.sqrt(m.u) : m.u;
		ctx.lineWidth = gw;
		ctx.setLineDash([5 * gw, 5 * gw]);
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
			ctx.fillText("Polcirkeln", (t.safeLeft ?? 0) + 10 * m.u, y - 5 * m.u);
		}
		ctx.restore();
	}

	/** Anchor cities — a dot each, named on the full variant. The current location
	 *  is skipped; it already carries the brass marker. */
	/** On the wall a city name gives way: skipped when it would be cut by the edge of the
	 *  map, or would sit under a prayer line's label. */
	function anchorFits(
		name: string,
		x: number,
		y: number,
		m: Metrics,
		t: Transform,
		avoid: readonly LabelBox[],
		inset: number,
	): boolean {
		const box = anchorBox(name, x, y, m);
		return insideSafe(box, t, inset) && !avoid.some((b) => overlaps(box, b));
	}

	/** The space a dot and its name take, in the font currently set on the context, whose
	 *  size is `em` × m.u. */
	function anchorBox(name: string, x: number, y: number, m: Metrics, em = 10): LabelBox {
		return {
			x: x - 0.2 * em * m.u,
			y: y - 0.7 * em * m.u,
			w: ctx.measureText(name).width + 0.7 * em * m.u,
			h: 1.4 * em * m.u,
		};
	}

	function drawAnchors(
		t: Transform,
		loc: FieldLocation,
		scheme: Scheme,
		variant: Variant,
		m: Metrics,
		avoid: readonly LabelBox[],
		inset: number | null,
	): LabelBox[] {
		const mx = projX(loc.longitude, t);
		const my = projY(loc.latitude, t);
		const placed: LabelBox[] = [];
		ctx.save();
		ctx.font = `500 ${10 * m.u}px ${resolveLabelFont()}`;
		ctx.textAlign = "left";
		ctx.textBaseline = "middle";
		for (const a of ANCHORS) {
			const x = projX(a.lon, t);
			const y = projY(a.lat, t);
			if (Math.hypot(x - mx, y - my) < 14 * m.u) continue;
			if (inset !== null && !anchorFits(a.name, x, y, m, t, avoid, inset)) continue;
			ctx.beginPath();
			ctx.arc(x, y, 1.6 * m.u, 0, Math.PI * 2);
			ctx.fillStyle = ANCHOR_DOT[scheme];
			ctx.fill();
			if (variant !== "home") {
				ctx.fillStyle = ANCHOR_TEXT[scheme];
				ctx.fillText(a.name, x + 4.5 * m.u, y);
			}
			placed.push(anchorBox(a.name, x, y, m));
		}
		ctx.restore();
		return placed;
	}

	/**
	 * The wall's place names, in the app's label layers (nordicStyle.ts): cities bold, towns
	 * regular, country names spaced capitals fading as the camera closes in, seas in italic
	 * — all haloed, none with a dot, a city's name set just above its point. Placed in the
	 * app's priority: the Swedish anchors, the neighbours' cities, the towns, then countries
	 * and seas, each giving way to everything already on the map. How many of each are
	 * candidates depends on the zoom (LOD_LEAD).
	 *
	 * Lays the names out and returns them; paintPlace draws them. The split is what lets a
	 * frame's layout be kept with its baked ground and drawn again under a moving camera.
	 */
	function layoutPlaces(
		cfg: FieldConfig,
		t: Transform,
		m: Metrics,
		detail: MapDetail | undefined,
		taken: LabelBox[],
		inset: number,
	): PlacedPlace[] {
		const ink = APP_MAP[cfg.scheme];
		const zoom = zoomOf(t);
		const placed: PlacedPlace[] = [];
		const put = (labels: readonly MapLabel[], s: PlaceStyle, lead: number): void => {
			for (const l of labels) {
				if (l.z > zoom + lead || l.name === cfg.location.name) continue;
				const p = fitPlace(l, s, t, m, taken, inset);
				if (p) placed.push(p);
			}
		};
		// Well under the app's 11–13 pt, and dimmed. On a phone the map IS the screen; on the
		// wall it stands beside a column of prayer names at 37 px, and names nearly as large,
		// bold and white turned the map into a list of places louder than the times. They are
		// texture here: read when you look for them, never first.
		//
		// And smaller again, every label here by the same ~80 %: at 8 × u a city was 25 px and a
		// town 22 px, and once the camera closed in on the mosque and the towns crowded in, the
		// names were still the loudest thing on the map. The halos come down with them — a
		// fixed halo round a smaller word reads as a bolder one.
		const city: PlaceStyle = {
			weight: 600,
			size: 6.5,
			color: ink.placeInk,
			halo: 1,
			above: true,
			alpha: 0.8,
		};
		ctx.save();
		put(
			ANCHORS.map((a) => ({ ...a, z: 0 })),
			city,
			0,
		);
		if (detail) {
			// Behind Natural Earth's own zoom rather than ahead of it, so across the whole
			// country only the capitals and the neighbours' largest cities are named.
			put(detail.cities, city, -0.4);
			// Half a zoom behind Natural Earth's own tier, not LOD_LEAD ahead of it like the lakes
			// and rivers. With the lead, the frame round the mosque (z ≈ 6.3) weighed all 347 towns
			// and placed over forty names — a gazetteer at any size. Here it weighs the 93 largest,
			// and the country-wide frame (z ≈ 5.3) the 32 largest.
			put(
				detail.towns.filter((tw) => !ANCHOR_NAMES.has(tw.name)),
				{ weight: 500, size: 5.5, color: ink.placeInk, halo: 0.8, above: true, alpha: 0.65 },
				-0.5,
			);
			put(
				detail.countries,
				{
					weight: 500,
					size: 7,
					color: ink.faintInk,
					halo: 0.8,
					above: false,
					upper: true,
					spacing: 0.18,
					// The app's text-opacity: 0.8 at z4, 0.3 by z7.
					alpha: Math.max(0.3, Math.min(0.8, 0.8 - ((zoom - 4) / 3) * 0.5)),
				},
				LOD_LEAD,
			);
			put(
				detail.seas,
				{
					weight: 500,
					size: 8,
					color: ink.waterInk,
					halo: 0.8,
					above: false,
					italic: true,
					spacing: 0.1,
				},
				LOD_LEAD,
			);
		}
		ctx.restore();
		return placed;
	}

	interface PlaceStyle {
		weight: number;
		size: number;
		color: string;
		halo: number;
		/** Set above the point (a city); otherwise centred on it (a country, a sea). */
		above: boolean;
		upper?: boolean;
		spacing?: number;
		italic?: boolean;
		alpha?: number;
	}

	/** A place name as laid out: enough to draw it again under any camera (paintPlace). */
	interface PlacedPlace {
		/** Name and point, so the same name in two frames' layouts is known as one. */
		key: string;
		text: string;
		lon: number;
		lat: number;
		s: PlaceStyle;
		/** The text's measured width and the line's height, in CSS px. */
		w: number;
		h: number;
	}

	function placeFont(s: PlaceStyle, size: number): void {
		ctx.font = `${s.italic ? "italic " : ""}${s.weight} ${size}px ${resolveLabelFont()}`;
		ctx.letterSpacing = `${(s.spacing ?? 0) * size}px`;
	}

	/** Where a laid-out name sits when its point lands on (x, y): a city's just above it, a
	 *  country's or a sea's centred on it. `cy` is the text's middle. */
	function placeBox(p: PlacedPlace, x: number, y: number, m: Metrics): LabelBox & { cy: number } {
		const cy = p.s.above ? y - p.s.size * m.u * 0.5 - p.h / 2 : y;
		return { x: x - p.w / 2 - 2 * m.u, y: cy - p.h / 2, w: p.w + 4 * m.u, h: p.h, cy };
	}

	/** One place name, if it fits: inside the safe area and clear of everything placed. */
	function fitPlace(
		l: MapLabel,
		s: PlaceStyle,
		t: Transform,
		m: Metrics,
		taken: LabelBox[],
		inset: number,
	): PlacedPlace | null {
		const x = projX(l.lon, t);
		const y = projY(l.lat, t);
		// Off the canvas: out before anything is measured — hundreds of names are candidates
		// on every repaint.
		if (x < (t.safeLeft ?? 0) || y < 0 || x > t.w || y > t.h) return null;
		const size = s.size * m.u;
		const text = s.upper ? l.name.toLocaleUpperCase("sv") : l.name;
		placeFont(s, size);
		const p: PlacedPlace = {
			key: `${l.name}|${l.lon}|${l.lat}`,
			text,
			lon: l.lon,
			lat: l.lat,
			s,
			w: ctx.measureText(text).width,
			h: size * 1.2,
		};
		const box = placeBox(p, x, y, m);
		if (!insideSafe(box, t, inset) || taken.some((b) => overlaps(box, b))) return null;
		taken.push(box);
		return p;
	}

	function paintPlace(p: PlacedPlace, t: Transform, m: Metrics, halo: string, alpha: number): void {
		const x = projX(p.lon, t);
		const { cy } = placeBox(p, x, projY(p.lat, t), m);
		placeFont(p.s, p.s.size * m.u);
		ctx.globalAlpha = alpha;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.lineJoin = "round";
		ctx.strokeStyle = halo;
		ctx.lineWidth = 2 * p.s.halo * m.u;
		ctx.strokeText(p.text, x, cy);
		ctx.fillStyle = p.s.color;
		ctx.fillText(p.text, x, cy);
		ctx.globalAlpha = 1;
	}

	/**
	 * The place names during a move, from the two frames' kept layouts rather than laid out
	 * afresh on every frame.
	 *
	 * Laying out hundreds of candidates per frame was more than a move could afford, so it used
	 * to drop every name but the seven anchors and bring some thirty back at once when it
	 * settled. The country-wide layout is drawn throughout: laid out at the smallest scale the
	 * move passes through, its names only spread apart as the camera closes in and never run
	 * into each other. The close-up's names fade in with the close-up's ground (closeAlpha), so
	 * the frame the move settles on lays out names that are already there.
	 */
	function paintMovePlaces(
		b: MoveBlend,
		cfg: FieldConfig,
		t: Transform,
		m: Metrics,
		taken: readonly LabelBox[],
		inset: number,
	): void {
		const a = b.closeAlpha;
		const halo = SCREEN_HALO[cfg.scheme];
		const close = new Map((b.close?.places ?? []).map((p) => [p.key, p]));
		const draw = (p: PlacedPlace, alpha: number): void => {
			if (alpha < 0.02) return;
			const box = placeBox(p, projX(p.lon, t), projY(p.lat, t), m);
			if (!insideSafe(box, t, inset) || taken.some((q) => overlaps(box, q))) return;
			paintPlace(p, t, m, halo, alpha);
		};
		for (const p of b.wide.places) {
			const twin = close.get(p.key);
			const strength = (1 - a) * (p.s.alpha ?? 1);
			if (!twin) {
				draw(p, strength);
				continue;
			}
			// In both layouts: drawn once, easing between the two frames' strengths — a country's
			// name is fainter close in.
			close.delete(p.key);
			draw(a < 0.5 ? p : twin, strength + a * (twin.s.alpha ?? 1));
		}
		for (const p of close.values()) draw(p, a * (p.s.alpha ?? 1));
	}

	/** OpenStreetMap's credit, for the parks, on the map itself. */
	function drawCredit(t: Transform, m: Metrics, scheme: Scheme, inset: number): void {
		ctx.save();
		ctx.font = `500 ${6.5 * m.u}px ${resolveLabelFont()}`;
		ctx.textAlign = "right";
		ctx.textBaseline = "bottom";
		ctx.globalAlpha = 0.55;
		ctx.fillStyle = APP_MAP[scheme].faintInk;
		ctx.fillText(CREDIT, t.w - inset, t.h - inset);
		ctx.restore();
	}

	/** Where the credit sits, reserved before any place name is placed. */
	function creditBox(t: Transform, m: Metrics, inset: number): LabelBox {
		ctx.save();
		ctx.font = `500 ${6.5 * m.u}px ${resolveLabelFont()}`;
		const w = ctx.measureText(CREDIT).width;
		ctx.restore();
		const h = 6.5 * m.u * 1.3;
		return { x: t.w - inset - w, y: t.h - inset - h, w, h };
	}

	/** Where the marker and its name sit, so no town lands on them. Mirrors drawMarker's
	 *  geometry, including the flip to the left near the right edge. */
	function markerBoxes(t: Transform, loc: FieldLocation, variant: Variant, m: Metrics): LabelBox[] {
		const x = projX(loc.longitude, t);
		const y = projY(loc.latitude, t);
		const size = markerLabelSize(variant, m);
		ctx.save();
		ctx.font = `600 ${size}px ${resolveLabelFont()}`;
		const wpx = ctx.measureText(loc.name).width;
		ctx.restore();
		const flip = x + wpx + 14 * m.u > t.w;
		const lx = x + (flip ? -11 : 11) * m.u;
		return [
			{ x: x - 9 * m.u, y: y - 9 * m.u, w: 18 * m.u, h: 18 * m.u },
			{
				x: flip ? lx - wpx - 3 * m.u : lx - 3 * m.u,
				y: y - size * 0.73,
				w: wpx + 6 * m.u,
				h: size * 1.45,
			},
		];
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
			const size = markerLabelSize(variant, m);
			ctx.font = `600 ${size}px ${resolveLabelFont()}`;
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
			// On the wall the halo's colour is safe where it was not before: the marker sits
			// at the mosque, and the screen's whole ground tracks the sun over that same
			// mosque — so `scheme` IS the ground under this label, not a guess about it.
			const markerCarto = cartographyFor(variant, scheme);
			if (markerCarto.halo === "") {
				ctx.fillStyle = markerCarto.plate;
				plate(
					ctx,
					flip ? lx - wpx - 4 * m.u : lx - 4 * m.u,
					y - 7.5 * m.u,
					wpx + 8 * m.u,
					15 * m.u,
					2 * m.u,
				);
			} else {
				ctx.strokeStyle = markerCarto.halo;
				ctx.lineWidth = size * 0.22;
				ctx.lineJoin = "round";
				ctx.strokeText(loc.name, lx, y);
			}
			ctx.fillStyle = MARKER_TEXT[scheme];
			ctx.fillText(loc.name, lx, y);
		}
		ctx.restore();
	}

	/** The qibla, the anchor cities and the towns. Each gives way to what is already
	 *  placed: the prayer labels, then the qibla's name, the anchors, the marker. While the
	 *  wall's camera moves, the names come from its frames' kept layouts (paintMovePlaces). */
	function drawPlaces(
		cfg: FieldConfig,
		t: Transform,
		m: Metrics,
		carto: Cartography,
		detail: MapDetail | undefined,
		layout: { inset: number | null; avoid: readonly LabelBox[] },
		blend: MoveBlend | null,
		/** Ink for the anchors, which sit ON the wash — see inkSchemeFor. */
		ink: Scheme = cfg.scheme,
	): void {
		const qibla = cfg.qibla
			? drawQibla(t, cfg.location, cfg.scheme, m, carto, layout.inset ?? 0)
			: null;
		const avoid = qibla ? [...layout.avoid, qibla] : layout.avoid;
		if (layout.inset === null) {
			drawAnchors(t, cfg.location, ink, cfg.variant, m, avoid, null);
			return;
		}
		const taken = [...avoid, ...markerBoxes(t, cfg.location, cfg.variant, m)];
		// The parks are on the map whenever the detailed ground is, and a move now shows it too.
		const credited = detail !== undefined || blend !== null;
		if (credited) taken.push(creditBox(t, m, layout.inset));
		ctx.save();
		if (blend) paintMovePlaces(blend, cfg, t, m, taken, layout.inset);
		else
			for (const p of layoutPlaces(cfg, t, m, detail, taken, layout.inset))
				paintPlace(p, t, m, SCREEN_HALO[cfg.scheme], p.s.alpha ?? 1);
		ctx.restore();
		if (credited) drawCredit(t, m, cfg.scheme, layout.inset);
	}

	/**
	 * The qibla from the mosque, as the app's QiblaArc draws it: a thin solid line in the
	 * accent colour along the great circle to the Kaaba, at half strength where it leaves
	 * the marker and gone a third of the way to Mecca, so it reads as a direction rather
	 * than a route. Named once, near its start. Returns the name's box, or null.
	 */
	function drawQibla(
		t: Transform,
		loc: FieldLocation,
		scheme: Scheme,
		m: Metrics,
		carto: Cartography,
		inset: number,
	): LabelBox | null {
		const x0 = projX(loc.longitude, t);
		const y0 = projY(loc.latitude, t);
		const arc = greatCircle(loc.latitude, loc.longitude, KAABA.lat, KAABA.lon);
		const path = new Path2D();
		path.moveTo(x0, y0);
		let [px, py, dist] = [x0, y0, 0];
		let nameAt: readonly [number, number] | null = null;
		for (const [lon, lat] of arc.slice(1, Math.round((arc.length - 1) * QIBLA_FADE) + 1)) {
			const x = projX(lon, t);
			const y = projY(lat, t);
			path.lineTo(x, y);
			dist += Math.hypot(x - px, y - py);
			[px, py] = [x, y];
			if (!nameAt && dist >= 60 * m.u) nameAt = [x, y];
		}
		const rgb = rgbOf(APP_MAP[scheme].accent);
		// Same hue at alpha 0 for the tail, never 'transparent' (black at 0), which would
		// shade the fade grey.
		const fade = ctx.createLinearGradient(x0, y0, px, py);
		fade.addColorStop(0, `rgba(${rgb},0.5)`);
		fade.addColorStop(1, `rgba(${rgb},0)`);
		ctx.save();
		ctx.strokeStyle = fade;
		ctx.lineWidth = 1.5 * m.u;
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		ctx.stroke(path);
		const placed = nameAt
			? nameQibla(t, [x0, y0, nameAt[0], nameAt[1]], `rgba(${rgb},0.85)`, m, carto, inset)
			: null;
		ctx.restore();
		return placed;
	}

	/** »Qibla«, past the end of the line — or, when the line ran into the edge of the screen
	 *  and left no room there (Göteborg at the country-wide frame heads straight for the
	 *  bottom), beside it halfway along, on the side away from the marker's own name.
	 *  Returns the box it used, or null if neither fits. */
	function nameQibla(
		t: Transform,
		[x0, y0, ex, ey]: readonly [number, number, number, number],
		color: string,
		m: Metrics,
		carto: Cartography,
		inset: number,
	): LabelBox | null {
		const len = Math.hypot(ex - x0, ey - y0) || 1;
		const [ux, uy] = [(ex - x0) / len, (ey - y0) / len];
		// The normal that points down the screen; the marker's name sits level with it.
		const [nx, ny] = ux >= 0 ? [-uy, ux] : [uy, -ux];
		ctx.font = `600 ${9 * m.u}px ${resolveLabelFont()}`;
		const wpx = ctx.measureText(QIBLA_LABEL).width;
		const spots: readonly (readonly [number, number, boolean])[] = [
			[ex + ux * 5 * m.u, ey + uy * 5 * m.u, ux >= 0],
			[(x0 + ex) / 2 + nx * 7 * m.u, (y0 + ey) / 2 + ny * 7 * m.u, nx >= 0],
		];
		for (const [lx, ly, right] of spots) {
			const box = {
				x: right ? lx - 2 * m.u : lx - wpx - 2 * m.u,
				y: ly - 7 * m.u,
				w: wpx + 4 * m.u,
				h: 14 * m.u,
			};
			if (!insideSafe(box, t, inset)) continue;
			ctx.textAlign = right ? "left" : "right";
			ctx.textBaseline = "middle";
			if (carto.halo !== "") {
				ctx.strokeStyle = carto.halo;
				ctx.lineWidth = 9 * m.u * 0.22;
				ctx.lineJoin = "round";
				ctx.strokeText(QIBLA_LABEL, lx, ly);
			}
			ctx.fillStyle = color;
			ctx.fillText(QIBLA_LABEL, lx, ly);
			return box;
		}
		return null;
	}

	// ── The wall's frames ────────────────────────────────────────────────────
	// The wall only ever holds still at two cameras (FieldConfig.frames). Each gets a layer: its
	// detailed ground baked once, and its place names laid out with it.

	/** A frame's finished ground, and its place names as laid out for it. */
	interface GroundLayer {
		canvas: HTMLCanvasElement;
		/** What it was baked for (layerKey); "" until it has been. */
		key: string;
		/** Its own extent — Mercator origin, scale, CSS size — which can be wider than its frame. */
		mxMin: number;
		myMin: number;
		scale: number;
		w: number;
		h: number;
		places: PlacedPlace[];
	}

	function emptyLayer(): GroundLayer {
		const layerCanvas = document.createElement("canvas");
		const layer: GroundLayer = {
			canvas: layerCanvas,
			key: "",
			mxMin: 0,
			myMin: 0,
			scale: 1,
			w: 0,
			h: 0,
			places: [],
		};
		// A browser may drop a canvas's context — a GPU reset, memory pressure — and hands it
		// back blank. A layer still claiming its key would then be copied onto the wall empty for
		// as long as the frames stay the same, which on a wall is months. So a restored layer is
		// baked again (and bakedLayer refuses one whose context is currently lost).
		layerCanvas.addEventListener("contextrestored", () => {
			layer.key = "";
		});
		return layer;
	}

	/** What a move frame shows of the two layers (moveBlend). */
	interface MoveBlend {
		wide: GroundLayer;
		close: GroundLayer | null;
		/** How strongly the close-up is shown: 1 once its layer reaches the frame's edges. */
		closeAlpha: number;
		/** CSS px of the visible frame the country-wide layer leaves uncovered. */
		wideGap: number;
	}

	/** Everything a layer depends on: the canvas, its frame (and, for the country-wide layer, the
	 *  close-up it is widened to take in), the scheme, whether the relief has arrived, and what
	 *  its names were laid out round. */
	function layerKey(slot: FrameSlot, cfg: FieldConfig): string {
		const f = cfg.frames;
		if (!f) return "";
		const cam = (c: Camera): string => `${c.cx},${c.cy},${c.scale}`;
		return [
			slot,
			canvas.width,
			canvas.height,
			cam(f[slot]),
			slot === "wide" ? cam(f.close) : "",
			cfg.scheme,
			cfg.detail ? 1 : 0,
			cfg.detail?.relief ? 1 : 0,
			cfg.occludedLeft ?? 0,
			cfg.location.name,
			cfg.location.latitude,
			cfg.location.longitude,
		].join("|");
	}

	/** The slot's layer, if it is baked for exactly this config. */
	function bakedLayer(slot: FrameSlot, cfg: FieldConfig): GroundLayer | null {
		const layer = layers[slot];
		if (layer.key === "" || layer.key !== layerKey(slot, cfg)) return null;
		// Optional call: not every engine has isContextLost on a 2D context.
		return layer.canvas.getContext("2d")?.isContextLost?.() ? null : layer;
	}

	/** The canvas's CSS size and pixel ratio, as paint() sizes it. A 4K panel at dpr 2 asks for
	 *  four times the fill of a 1080p one for the same apparent sharpness — on signage hardware
	 *  the difference between a smooth move and a slideshow, and at four metres nobody can see
	 *  the gain. */
	function frameSize(variant: Variant): { w: number; h: number; dpr: number } {
		return {
			w: canvas.clientWidth || canvas.width,
			h: canvas.clientHeight || canvas.height,
			dpr: Math.min(window.devicePixelRatio || 1, variant === "screen" ? 1.5 : 2),
		};
	}

	/**
	 * Draw one frame's ground, and lay out its names, into that frame's layer.
	 *
	 * Every draw function writes through `ctx`, so for the length of the bake `ctx` IS the
	 * layer's context: the layer comes out of exactly the code that paints the ground live.
	 *
	 * The country-wide layer is baked wider than its frame wherever the close-up reaches past it
	 * — a mosque in Skåne or Göteborg, whose close-up runs south of the country-wide frame — so a
	 * move never uncovers a strip it has no picture for. The widening is whole device pixels,
	 * which keeps the settled frame a 1:1 copy.
	 */
	function bakeLayer(slot: FrameSlot, cfg: FieldConfig): void {
		const frames = cfg.frames;
		const detail = cfg.detail;
		if (!(frames && detail)) return;
		const { w, h, dpr } = frameSize(cfg.variant);
		// paint() sizes the canvas; one resized since has a repaint coming, which bakes for it.
		if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) return;
		const m = metricsFor(cfg.variant, w, h);
		const carto = cartographyFor(cfg.variant, cfg.scheme);
		const view = transformForCamera(frames[slot], w, h);
		view.safeLeft = cfg.occludedLeft ?? 0;
		const reach = slot === "wide" ? transformForCamera(frames.close, w, h) : view;
		const pad = (merc: number, frame: number): number =>
			Math.ceil(Math.min(Math.max(0, merc) * view.scale, frame * LAYER_MARGIN_MAX) * dpr);
		const left = pad(view.mxMin - reach.mxMin, w);
		const top = pad(view.myMin - reach.myMin, h);
		const right = pad(reach.mxMin + w / reach.scale - (view.mxMin + w / view.scale), w);
		const bottom = pad(reach.myMin + h / reach.scale - (view.myMin + h / view.scale), h);
		const layer = layers[slot];
		const devW = canvas.width + left + right;
		const devH = canvas.height + top + bottom;
		if (layer.canvas.width !== devW || layer.canvas.height !== devH) {
			layer.canvas.width = devW;
			layer.canvas.height = devH;
		}
		const layerCtx = layer.canvas.getContext("2d");
		if (!layerCtx) return;
		const lt: Transform = {
			scale: view.scale,
			ox: 0,
			oy: 0,
			mxMin: view.mxMin - left / dpr / view.scale,
			myMin: view.myMin - top / dpr / view.scale,
			w: devW / dpr,
			h: devH / dpr,
		};
		const live = ctx;
		ctx = layerCtx;
		try {
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.clearRect(0, 0, lt.w, lt.h);
			const ground = drawGround(detail, cfg.variant, cfg.scheme, lt, m, carto);
			strokeCoasts(cfg.variant, cfg.scheme, m, carto, ground);
			const inset = screenLabelInset(w, h);
			const taken = [...markerBoxes(view, cfg.location, cfg.variant, m), creditBox(view, m, inset)];
			layer.places = layoutPlaces(cfg, view, m, detail, taken, inset);
		} finally {
			ctx = live;
		}
		layer.key = layerKey(slot, cfg);
		layer.mxMin = lt.mxMin;
		layer.myMin = lt.myMin;
		layer.scale = lt.scale;
		layer.w = lt.w;
		layer.h = lt.h;
	}

	/**
	 * Bake whichever frame's layer is out of date, the next time the page has nothing to do —
	 * one per idle period, since a bake is a single task of a couple of hundred milliseconds that
	 * cannot be cut in two. Never during a move, the one time the main thread is spoken for: the
	 * move's settling repaint asks again.
	 */
	function scheduleBakes(cfg: FieldConfig): void {
		bakeCfg = cfg;
		if (bakeQueued || !cfg.frames || !cfg.detail) return;
		if (bakedLayer("wide", cfg) && bakedLayer("close", cfg)) return;
		bakeQueued = true;
		const run = (): void => {
			bakeQueued = false;
			const c = bakeCfg;
			if (!c || inMove) return;
			const stale = (["wide", "close"] as const).find((slot) => !bakedLayer(slot, c));
			if (!stale) return;
			bakeLayer(stale, c);
			// Only if that took: a bake that could not run (a canvas mid-resize) waits for the
			// next repaint rather than spinning through every idle period until then.
			if (bakedLayer(stale, c)) scheduleBakes(c);
		};
		if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 5000 });
		else setTimeout(run, 500);
	}

	/** A layer onto the live canvas under the camera `t`. At rest on its own frame it is a copy
	 *  of whole device pixels — nothing resampled, so the settled map is as sharp as a live
	 *  repaint. Moving, it is scaled into place. */
	function blitLayer(layer: GroundLayer, t: Transform, alpha = 1): void {
		const k = t.scale / layer.scale;
		const x = (layer.mxMin - t.mxMin) * t.scale;
		const y = (layer.myMin - t.myMin) * t.scale;
		ctx.save();
		ctx.globalAlpha = alpha;
		if (k === 1) {
			const dpr = ctx.getTransform().a;
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.drawImage(layer.canvas, Math.round(x * dpr), Math.round(y * dpr));
		} else {
			ctx.imageSmoothingEnabled = true;
			ctx.imageSmoothingQuality = "low";
			ctx.drawImage(layer.canvas, x, y, layer.w * k, layer.h * k);
		}
		ctx.restore();
	}

	/** CSS px of the visible frame a layer leaves uncovered under the camera `t`; 0 when it
	 *  covers it. Nothing under the type pane counts. */
	function layerGap(layer: GroundLayer, t: Transform): number {
		const k = t.scale / layer.scale;
		const x0 = (layer.mxMin - t.mxMin) * t.scale;
		const y0 = (layer.myMin - t.myMin) * t.scale;
		return Math.max(
			0,
			x0 - (t.safeLeft ?? 0),
			y0,
			t.w - (x0 + layer.w * k),
			t.h - (y0 + layer.h * k),
		);
	}

	/** What a move frame shows of the wall's two layers, or null to draw it the old way — no
	 *  country-wide layer baked yet, or not the wall. */
	function moveBlend(cfg: FieldConfig, t: Transform): MoveBlend | null {
		if (cfg.variant !== "screen" || cfg.moving !== true) return null;
		const wide = bakedLayer("wide", cfg);
		if (!wide) return null;
		const close = bakedLayer("close", cfg);
		// The close-up fades in only once its picture reaches the frame's edges, so no layer's
		// border is ever on the glass half-transparent: moving in, near the end of the move;
		// moving out, near the start. Everywhere else the frame is the country's layer magnified
		// — the same map, a little soft while it moves.
		const closeAlpha = close ? Math.min(1, Math.max(0, 1 - layerGap(close, t) / LAYER_FEATHER)) : 0;
		return { wide, close, closeAlpha, wideGap: layerGap(wide, t) };
	}

	/**
	 * The map under the wash, the lines and the names.
	 *
	 * On the wall it is a copy. Its detailed ground — ~110 000 points of land, parks, lakes and
	 * borders, and the relief — used to be re-filled into a screen-sized canvas whenever the
	 * camera was somewhere new: ~230 ms a repaint by the CPU profile at 1920x1080, including the
	 * frame every move settles on. Each of the wall's two frames is now baked once into its own
	 * layer, ahead of time while the screen is idle, and every settled repaint copies it; a move
	 * scales the two layers into place instead (moveBlend). Only a camera that is neither frame
	 * — reduced motion stopping part-way, a wall that has not said what its frames are — draws
	 * the ground live.
	 *
	 * Returns the paths the article maps stroke later, or null when a layer was used.
	 */
	function paintGround(
		cfg: FieldConfig,
		detail: MapDetail | undefined,
		t: Transform,
		m: Metrics,
		carto: Cartography,
		blend: MoveBlend | null,
	): { sweden: Path2D; neighbors: Path2D; borders: Path2D | null } | null {
		if (blend) {
			// Wherever even the widened country-wide layer falls short, the coarse outline is
			// under it, so no part of the frame is ever empty.
			if (blend.wideGap > 0) drawGround(undefined, cfg.variant, cfg.scheme, t, m, carto);
			blitLayer(blend.wide, t);
			if (blend.close && blend.closeAlpha > 0) blitLayer(blend.close, t, blend.closeAlpha);
			return null;
		}
		const resting =
			cfg.variant === "screen" && cfg.moving !== true && detail ? restingLayer(cfg, t) : null;
		if (resting) {
			blitLayer(resting, t);
			return null;
		}
		const ground = drawGround(detail, cfg.variant, cfg.scheme, t, m, carto);
		if (cfg.variant === "screen") strokeCoasts(cfg.variant, cfg.scheme, m, carto, ground);
		return ground;
	}

	/** The layer of the frame the camera is resting on, baked now if it has to be — the first
	 *  settled paint after boot, or after the relief arrives. Null at any other camera. */
	function restingLayer(cfg: FieldConfig, t: Transform): GroundLayer | null {
		if (!cfg.frames) return null;
		for (const slot of ["wide", "close"] as const) {
			const frame = transformForCamera(cfg.frames[slot], t.w, t.h);
			if (frame.scale !== t.scale || frame.mxMin !== t.mxMin || frame.myMin !== t.myMin) continue;
			if (!bakedLayer(slot, cfg)) bakeLayer(slot, cfg);
			return bakedLayer(slot, cfg);
		}
		return null;
	}

	/** Everything under the wash: sea, the neighbours, Sweden, and their water. Returns the
	 *  two coast paths, which paint strokes later, above the prayer lines. */
	function drawGround(
		detail: MapDetail | undefined,
		variant: Variant,
		scheme: Scheme,
		t: Transform,
		m: Metrics,
		carto: Cartography,
	): { sweden: Path2D; neighbors: Path2D; borders: Path2D | null } {
		const rings = detail ? detailFor(detail, t) : null;
		const sweden = pathFor(rings ? rings.sweden : SWEDEN_OUTLINE, t);
		const neighbors = pathFor(rings ? rings.neighbors : NEIGHBORS_OUTLINE, t);
		// Sea (opaque base), then the surrounding countries in a muted tone, then Sweden in
		// the full land tone on top — so the frame reads as a real Nordic/Baltic map with
		// Sweden as the clear subject, not a lone silhouette in empty sea.
		ctx.fillStyle = carto.sea;
		ctx.fillRect(0, 0, t.w, t.h);
		if (variant === "screen") {
			// The wall's coastline, stroked BEFORE the land is filled: the fill then covers the
			// stroke's inner half and every border two countries share, and what is left is a
			// hairline along the sea alone.
			ctx.lineJoin = "round";
			ctx.lineWidth = 1.6 * Math.sqrt(m.u);
			ctx.strokeStyle = SCREEN_COAST[scheme];
			ctx.stroke(neighbors);
			ctx.stroke(sweden);
		}
		// Nonzero, not evenodd: neighbours share borders, and even-odd cancels the
		// overlaps into holes.
		ctx.fillStyle = carto.neighborLand;
		ctx.fill(neighbors);
		ctx.fillStyle = carto.land;
		ctx.fill(sweden);
		// The app's relief and parks, on the land only. Clipped, because the elevation under
		// the relief also covers the sea floor, and the app hides that under its water fill.
		if (rings && detail) {
			const land = new Path2D();
			land.addPath(neighbors);
			land.addPath(sweden);
			ctx.save();
			ctx.clip(land);
			if (detail.relief) drawRelief(detail.relief, t);
			ctx.fillStyle = APP_MAP[scheme].park;
			ctx.fill(pathFor(rings.parks, t));
			ctx.restore();
		}
		// Lakes and rivers last, in the sea's own colour: they are water, and punching them
		// out of the land after it is filled is what a hole in the polygon would have done
		// if the source had carried one. Each is drawn from the zoom Natural Earth gives it,
		// so the frame around the mosque carries the small lakes and tributaries that the
		// country-wide frame would only turn into noise.
		if (rings) {
			fillLakes(rings.lakes, variant, t, m, carto);
			strokeRivers(rings.rivers, t, m, carto);
		}
		return { sweden, neighbors, borders: rings ? pathFor(rings.borders, t, false) : null };
	}

	/** The baked hillshade: a block of Mercator tiles, so placing it is one scale and one
	 *  offset from the same transform everything else uses. */
	function drawRelief(relief: ReliefImage, t: Transform): void {
		const world = 2 ** relief.z;
		const x = t.ox + (relief.x0 / world - t.mxMin) * t.scale;
		const y = t.oy + (relief.y0 / world - t.myMin) * t.scale;
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = "high";
		ctx.drawImage(
			relief.image,
			x,
			y,
			(relief.cols / world) * t.scale,
			(relief.rows / world) * t.scale,
		);
	}

	/** One full canvas pass. `g` null = the lattice is not ready, so the isolines and
	 *  their labels are skipped; everything else paints. The map therefore appears at
	 *  once and the lines arrive on the second pass, in the correct z-order. */
	function paint(cfg: FieldConfig, now: Date, g: SolarGrid | null): void {
		const { w, h, dpr } = frameSize(cfg.variant);
		inMove = cfg.moving === true;
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
		t.safeLeft = cfg.occludedLeft ?? 0;
		// A move takes the cheap path: the held isolines, the wash re-projected rather than
		// solved, no halos — and for its ground the wall's two baked frames scaled into place
		// (moveBlend), or the coarse outline every article page uses where no layer is baked
		// yet. Nothing in a move draws `detail` live; ~110 000 points a frame is what it could
		// never afford.
		const detail = cfg.moving === true ? undefined : cfg.detail;
		const blend = moveBlend(cfg, t);

		// 1. Sea, land and water.
		const carto = cartographyFor(cfg.variant, cfg.scheme);
		const ground = paintGround(cfg, detail, t, m, carto, blend);

		// 2. Wash over the WHOLE stage (sea + land), like the app — the night darkens
		//    everything by the sun's depression, not just the land.
		drawWash(t, now, cfg.scheme, cfg.moving === true, cfg.variant);

		// 2b. The mosques, as light: over the night the wash has just laid down, under the lines
		//     and the names.
		drawLights(cfg, t, m);

		// 3. Prayer isolines — drawn across the whole stage (sea included), like the app, so
		//    every line is visible and matches its label. (Clipping them to land used to hide
		//    lines that run mostly over sea while their label still showed.)
		const times = computePrayerTimes(cfg.location, now, cfg.settings);
		const nextKey = nextPrayerKeyAt(times, now.getTime());
		const solar = g ? linesFor(g, now, cfg.moving === true) : null;
		if (solar && cfg.variant === "screen")
			drawAppLines(t, solar.lines, cfg.scheme, nextKey, m, cfg.moving === true);
		else if (solar) drawLines(t, solar.lines, cfg.scheme, nextKey, m, cfg.moving === true);

		// 4. Coastlines and borders. The wall's are part of its ground, under the wash and the
		//    lines, as the app's basemap is under its overlays.
		//    Everything from here down is drawn ON the wash, so it takes the ink the washed
		//    ground can carry rather than the page's — see inkSchemeFor.
		const ink = inkSchemeFor(now, cfg.scheme);
		if (ground && cfg.variant !== "screen")
			strokeCoasts(cfg.variant, cfg.scheme, m, carto, ground, ink);

		// 5. Standing geography — present at every hour, unlike the sweeping lines.
		drawGraticule(t, ink, cfg.variant, m);
		const layout = layoutLabels(cfg, t, m, solar ? solar.labels : []);
		drawPlaces(cfg, t, m, carto, detail, layout, blend, ink);

		// 6. Place marker.
		drawMarker(t, cfg.location, cfg.scheme, cfg.variant, m);

		// 7. Line labels (over everything) so each isoline names its prayer.
		drawLabels(layout.placed, cfg.scheme, m, carto, nextKey);

		// 8. At rest, make sure both of the wall's frames are finished before the next move.
		if (cfg.variant === "screen" && !inMove) scheduleBakes(cfg);
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
