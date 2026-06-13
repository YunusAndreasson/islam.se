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

import { invMercY, mercX, mercY } from "./map/projection";
import { NEIGHBORS_OUTLINE } from "./neighbors-outline";
import { computePrayerTimes, nextPrayerKeyAt, PRAYER_LABELS, type PrayerKey } from "./prayer-times";
import type { PrayerSettings } from "./settings";
import {
	buildGrid,
	buildLines,
	type PrayerLineLabel,
	type SolarGrid,
	type SolarLines,
} from "./solar/field";
import { PRAYER_COLORS, washStopsDark, washStopsLight } from "./solar/palette";
import { solarParams, sunPositionAt } from "./solar/sun";
import { washColorAt } from "./solar/washColor";
import { SWEDEN_OUTLINE } from "./sweden-outline";

const invMercX = (mx: number): number => mx * 360 - 180;

export type Scheme = "light" | "dark";
export type Variant = "home" | "full";

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
}

// Land + edge colours — the app's nordicStyle land tones (warm parchment / deep navy).
const LAND = { light: "#ece6d8", dark: "#1d2333" } as const;
const EDGE = { light: "rgba(26,23,18,0.20)", dark: "rgba(164,173,214,0.28)" } as const;
const SEA = { light: "#dfe7ec", dark: "#141a26" } as const;
const BRASS = { light: "#b8862f", dark: "#c89a48" } as const;
const ON_MARK = { light: "#fffdf8", dark: "#161a26" } as const;
// Surrounding countries — a muted tone between sea and Sweden's land, plus a barely-there
// coast, so the neighbours read as quiet context and Sweden stays the clear subject.
const NEIGHBOR_LAND = { light: "#e6e0d2", dark: "#171d2b" } as const;
const NEIGHBOR_EDGE = { light: "rgba(26,23,18,0.10)", dark: "rgba(164,173,214,0.13)" } as const;

// The visible map AND the line grid both span Sweden plus a generous margin of
// surrounding sea and neighbours, so the sweeping prayer isolines read as full lines
// across the map (as in the app) — not stubs clipped at the coast. A prayer's line is
// the locus where that prayer happens *right now*; for most of the day it sits out over
// the sea east or west of Sweden, so a frame that hugged the country (the old
// [8,54.5,25.6,69.6]) cut those lines to a short streak at the edge. The silhouette
// still marks Sweden inside this wider frame; everything past its coast is open water
// the lines sweep across.
const VIEW_BBOX: [number, number, number, number] = [-8, 50, 30, 72];
const GRID_BOUNDS: [number, number, number, number] = VIEW_BBOX;
const GRID_STEP: Record<Variant, { latStep: number; lonStep: number }> = {
	home: { latStep: 0.6, lonStep: 0.95 },
	full: { latStep: 0.4, lonStep: 0.6 },
};

interface Transform {
	scale: number;
	ox: number;
	oy: number;
	mxMin: number;
	myMin: number;
	w: number;
	h: number;
}

// padTop/padBottom can differ so a band at the bottom is reserved for the floating
// readout — the silhouette is fitted into the space ABOVE it, never under it.
function fitTransform(
	w: number,
	h: number,
	padX: number,
	padTop: number,
	padBottom: number,
): Transform {
	const [W, S, E, N] = VIEW_BBOX;
	const mxMin = mercX(W);
	const mxMax = mercX(E);
	const myMin = mercY(N); // north → smaller mercator y
	const myMax = mercY(S);
	const availW = w - 2 * padX;
	const availH = h - padTop - padBottom;
	const scale = Math.min(availW / (mxMax - mxMin), availH / (myMax - myMin));
	const ox = padX + (availW - (mxMax - mxMin) * scale) / 2;
	const oy = padTop + (availH - (myMax - myMin) * scale) / 2;
	return { scale, ox, oy, mxMin, myMin, w, h };
}

const projX = (lon: number, t: Transform): number => t.ox + (mercX(lon) - t.mxMin) * t.scale;
const projY = (lat: number, t: Transform): number => t.oy + (mercY(lat) - t.myMin) * t.scale;
const unLon = (x: number, t: Transform): number => invMercX(t.mxMin + (x - t.ox) / t.scale);
const unLat = (y: number, t: Transform): number => invMercY(t.myMin + (y - t.oy) / t.scale);

function pathFor(rings: readonly (readonly [number, number])[][], t: Transform): Path2D {
	const p = new Path2D();
	for (const ring of rings) {
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
	// Resolved once: ctx.font can't read custom properties.
	const labelFontFamily = (() => {
		const fam = getComputedStyle(canvas).getPropertyValue("--font-heading").trim();
		return fam || "ui-sans-serif, system-ui, -apple-system, sans-serif";
	})();

	let grid: SolarGrid | null = null;
	let gridKey = "";

	function ensureGrid(now: Date, settings: PrayerSettings, variant: Variant): SolarGrid {
		const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}|${variant}|${JSON.stringify(settings)}`;
		if (!grid || key !== gridKey) {
			grid = buildGrid(now, settings, { bounds: GRID_BOUNDS, ...GRID_STEP[variant] });
			gridKey = key;
		}
		return grid;
	}

	function drawWash(t: Transform, now: Date, scheme: Scheme): void {
		const stops = scheme === "dark" ? washStopsDark : washStopsLight;
		const { declRad, eotMin } = solarParams(now);
		const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes() + now.getUTCSeconds() / 60;
		const sw = Math.max(48, Math.round(t.w / 4));
		const sh = Math.max(48, Math.round(t.h / 4));
		offscreen.width = sw;
		offscreen.height = sh;
		const octx = offscreen.getContext("2d");
		if (!octx) return;
		const img = octx.createImageData(sw, sh);
		const d = img.data;
		for (let j = 0; j < sh; j++) {
			const lat = unLat(((j + 0.5) / sh) * t.h, t);
			for (let i = 0; i < sw; i++) {
				const lon = unLon(((i + 0.5) / sw) * t.w, t);
				const { altDeg, haDeg } = sunPositionAt(lat, lon, utcMin, declRad, eotMin);
				const [r, g, b, a] = washColorAt(altDeg, haDeg, stops);
				const k = (j * sw + i) * 4;
				d[k] = r;
				d[k + 1] = g;
				d[k + 2] = b;
				d[k + 3] = Math.round(a * 255);
			}
		}
		octx.putImageData(img, 0, 0);
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = "high";
		ctx.drawImage(offscreen, 0, 0, t.w, t.h);
	}

	function drawLines(
		t: Transform,
		lines: SolarLines["lines"],
		scheme: Scheme,
		nextKey: PrayerKey | null,
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
				// Soft glow.
				ctx.save();
				ctx.strokeStyle = color;
				ctx.globalAlpha = isNext ? 0.32 : 0.2;
				ctx.lineWidth = isNext ? 6 : 4;
				ctx.shadowColor = color;
				ctx.shadowBlur = isNext ? 12 : 8;
				ctx.stroke(path);
				ctx.restore();
				// Crisp core.
				ctx.save();
				ctx.strokeStyle = color;
				ctx.globalAlpha = 0.96;
				ctx.lineWidth = isNext ? 2.2 : 1.5;
				ctx.stroke(path);
				ctx.restore();
			}
		}
	}

	// Name each visible isoline so it reads as "Maghrib is happening along this line right
	// now", not an unlabelled stroke. Positions come from buildLines' labelPlacement; the
	// label is pushed perpendicular to the line so the sweep never crosses the text.
	function drawLabels(t: Transform, labels: PrayerLineLabel[], scheme: Scheme): void {
		if (labels.length === 0) return;
		ctx.save();
		ctx.font = `600 11px ${labelFontFamily}`;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.lineJoin = "round";
		const halo = scheme === "dark" ? "rgba(8,10,18,0.88)" : "rgba(255,253,248,0.92)";
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
			const off = 11;
			const lx = x - dy * off;
			const ly = y + dx * off;
			const text = PRAYER_LABELS[lab.prayer];
			ctx.lineWidth = 3;
			ctx.strokeStyle = halo;
			ctx.strokeText(text, lx, ly);
			ctx.fillStyle = color;
			ctx.fillText(text, lx, ly);
		}
		ctx.restore();
	}

	function drawMarker(t: Transform, loc: FieldLocation, scheme: Scheme): void {
		const x = projX(loc.longitude, t);
		const y = projY(loc.latitude, t);
		ctx.save();
		ctx.beginPath();
		ctx.arc(x, y, 8, 0, Math.PI * 2);
		ctx.fillStyle = scheme === "dark" ? "rgba(200,154,72,0.22)" : "rgba(184,134,47,0.20)";
		ctx.fill();
		ctx.beginPath();
		ctx.arc(x, y, 3.4, 0, Math.PI * 2);
		ctx.fillStyle = BRASS[scheme];
		ctx.fill();
		ctx.lineWidth = 1.5;
		ctx.strokeStyle = ON_MARK[scheme];
		ctx.stroke();
		ctx.restore();
	}

	function render(cfg: FieldConfig, now: Date): void {
		const w = canvas.clientWidth || canvas.width;
		const h = canvas.clientHeight || canvas.height;
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
			canvas.width = Math.round(w * dpr);
			canvas.height = Math.round(h * dpr);
		}
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, w, h);

		// Reserve a clear band at the bottom for the floating readout so the silhouette
		// never sits under it — the glass dock floats over open sea, not over land.
		const reserveBottom = Math.max(74, h * 0.14);
		const t = fitTransform(w, h, w * 0.05, h * 0.04, h * 0.04 + reserveBottom);
		const path = pathFor(SWEDEN_OUTLINE, t);
		const neighbors = pathFor(NEIGHBORS_OUTLINE, t);

		// 1. Sea (opaque base), then the surrounding countries in a muted tone, then Sweden
		//    in the full land tone on top — so the frame reads as a real Nordic/Baltic map
		//    with Sweden as the clear subject, not a lone silhouette in empty sea.
		ctx.fillStyle = SEA[cfg.scheme];
		ctx.fillRect(0, 0, w, h);
		ctx.fillStyle = NEIGHBOR_LAND[cfg.scheme];
		ctx.fill(neighbors, "evenodd");
		ctx.fillStyle = LAND[cfg.scheme];
		ctx.fill(path);

		// 2. Wash over the WHOLE stage (sea + land), like the app — the night darkens
		//    everything by the sun's depression, not just the land.
		drawWash(t, now, cfg.scheme);

		// 3. Prayer isolines — drawn across the whole stage (sea included), like the app, so
		//    every line is visible and matches its label. (Clipping them to land used to hide
		//    lines that run mostly over sea while their label still showed.)
		const g = ensureGrid(now, cfg.settings, cfg.variant);
		const times = computePrayerTimes(cfg.location, now, cfg.settings);
		const nextKey = nextPrayerKeyAt(times, now.getTime());
		const solar = buildLines(g, now.getTime());
		drawLines(t, solar.lines, cfg.scheme, nextKey);

		// 4. Coastlines — neighbours barely there, Sweden crisp on top.
		ctx.lineJoin = "round";
		ctx.lineWidth = 1;
		ctx.strokeStyle = NEIGHBOR_EDGE[cfg.scheme];
		ctx.stroke(neighbors);
		ctx.strokeStyle = EDGE[cfg.scheme];
		ctx.stroke(path);

		// 5. Place marker.
		drawMarker(t, cfg.location, cfg.scheme);

		// 6. Line labels (over everything) so each isoline names its prayer.
		drawLabels(t, solar.labels, cfg.scheme);
	}

	return { render };
}
