// Regenerates src/lib/bonetider/map-detail-page.ts — the prayer-time map's detail on the
// web pages (the hub and every city page), cut from the wall's own map-detail.ts.
//
// The page map drew Sweden's outline, the neighbours' and seven city dots, and on
// 2026-11-21 the user found it »very boring without detail« beside the mosque map, which
// shows lakes, rivers and the names of countries, seas and cities. The wall already had
// all of that (map-detail.ts, Natural Earth 1:10m), but at 3 MB — 2 MB in a bundle — it is
// for the wall alone. This is the same data at the page's scale:
//
//   - only what Natural Earth gives a zoom of Z_MAX or less. The page frames Sweden at
//     about z4.4 and the renderer draws a feature from LOD_LEAD (0.6) before its zoom, so
//     anything later than ~z5 would never be drawn;
//   - only what lies in WINDOW, the widest frame a page can show, clipped to it;
//   - simplified per layer (EPS), to between half a pixel and one at that scale;
//   - no parks: they are OpenStreetMap's (ODbL), which would need a credit drawn on the
//     map, and Natural Earth's land and water need none; no islands (Natural Earth puts
//     them at z6.5+); no relief (the wall's is baked as a blue-grey for its dark screen,
//     and over the light page it would be a haze).
//
// Loaded by scripts/bonetider-field.ts with a dynamic import after the map's first paint,
// so the coarse outline still paints at once and the detail arrives a moment later.
//
//   node scripts/build-map-detail-page.mjs        (after build-map-detail.mjs, if ever rerun)
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = await import(join(here, "../src/lib/bonetider/map-detail.ts"));

const Z_MAX = 5.4;
// Sweden is always fitted by its height (it is taller than any stage is narrow), so the
// latitudes are fixed; the longitudes are the widest stage, the full-width map on a
// tablet, 736 x 420 px, which reaches about 15°W–50°E.
const WINDOW = [-16, 52, 52, 72];
// Degrees. A page pixel is about 2.5 km (0.02° of latitude) where Sweden is framed whole,
// so Sweden and its lakes keep half a pixel and the neighbours, whose fjords were most of
// the weight, keep about one.
const EPS = { sweden: 0.01, neighbors: 0.04, lakes: 0.02, rivers: 0.015, borders: 0.02 };

function rdp(pts, eps) {
	if (pts.length < 3) return pts;
	let idx = -1;
	let max = 0;
	const [ax, ay] = pts[0];
	const [bx, by] = pts[pts.length - 1];
	const dx = bx - ax;
	const dy = by - ay;
	const len = Math.hypot(dx, dy) || 1e-12;
	for (let i = 1; i < pts.length - 1; i++) {
		const [px, py] = pts[i];
		const d = Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
		if (d > max) {
			max = d;
			idx = i;
		}
	}
	if (max <= eps) return [pts[0], pts[pts.length - 1]];
	return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)];
}

const r3 = (v) => Math.round(v * 1000) / 1000;
const extent = (ring) => {
	let w = 180;
	let s = 90;
	let e = -180;
	let n = -90;
	for (const [x, y] of ring) {
		w = Math.min(w, x);
		e = Math.max(e, x);
		s = Math.min(s, y);
		n = Math.max(n, y);
	}
	return [w, s, e, n];
};
const inWindow = (ring) => {
	const [w, s, e, n] = extent(ring);
	return w <= WINDOW[2] && e >= WINDOW[0] && s <= WINDOW[3] && n >= WINDOW[1];
};
// A closed ring starts and ends on one point, which gives rdp a zero-length baseline and
// leaves nothing: split it at the point farthest from its start and simplify the halves.
const rdpRing = (pts, eps) => {
	let k = 0;
	let far = -1;
	for (let i = 1; i < pts.length; i++) {
		const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]);
		if (d > far) {
			far = d;
			k = i;
		}
	}
	if (k === 0) return pts;
	return [...rdp(pts.slice(0, k + 1), eps).slice(0, -1), ...rdp(pts.slice(k), eps)];
};
const simplify = (ring, closed, eps) => {
	const out = (closed ? rdpRing(ring, eps) : rdp(ring, eps)).map(([x, y]) => [r3(x), r3(y)]);
	return closed ? (out.length >= 4 ? out : null) : out.length >= 2 ? out : null;
};
// An island under ISLET deg² is a speck under a pixel or two on the page; the wall keeps
// them for its close-up round a mosque.
const ISLET = 0.004;
const big = (ring) => {
	const [w, s, e, n] = extent(ring);
	return (e - w) * (n - s) >= ISLET;
};
// Sutherland–Hodgman against WINDOW: Russia's and the continent's outlines run on far
// past anything a page can show, and every point out there was weight for nothing. The
// cut edge lies outside the frame, so it is never seen.
const clip = (ring) => {
	const [W, S, E, N] = WINDOW;
	const edges = [
		[(p) => p[0] >= W, (a, b) => [W, a[1] + ((b[1] - a[1]) * (W - a[0])) / (b[0] - a[0])]],
		[(p) => p[0] <= E, (a, b) => [E, a[1] + ((b[1] - a[1]) * (E - a[0])) / (b[0] - a[0])]],
		[(p) => p[1] >= S, (a, b) => [a[0] + ((b[0] - a[0]) * (S - a[1])) / (b[1] - a[1]), S]],
		[(p) => p[1] <= N, (a, b) => [a[0] + ((b[0] - a[0]) * (N - a[1])) / (b[1] - a[1]), N]],
	];
	let pts = ring;
	for (const [inside, cut] of edges) {
		const out = [];
		for (let i = 0; i < pts.length; i++) {
			const a = pts[i];
			const b = pts[(i + 1) % pts.length];
			if (inside(a)) {
				out.push(a);
				if (!inside(b)) out.push(cut(a, b));
			} else if (inside(b)) out.push(cut(a, b));
		}
		pts = out;
		if (pts.length < 3) return null;
	}
	return pts;
};
const rings = (list, eps, closed = true) =>
	list
		.filter((r) => inWindow(r) && (!closed || big(r)))
		.map((r) => (closed ? clip(r) : r))
		.filter(Boolean)
		.map((r) => simplify(r, closed, eps))
		.filter(Boolean);
const tagged = (list, key, closed, eps) =>
	list
		.filter((f) => f.z <= Z_MAX && inWindow(f[key]))
		.map((f) => ({ z: f.z, [key]: simplify(f[key], closed, eps) }))
		.filter((f) => f[key]);
const labels = (list) =>
	list
		.filter(
			(l) =>
				l.z <= Z_MAX &&
				l.lon >= WINDOW[0] &&
				l.lon <= WINDOW[2] &&
				l.lat >= WINDOW[1] &&
				l.lat <= WINDOW[3],
		)
		.map((l) => ({ ...l, lat: r3(l.lat), lon: r3(l.lon) }));

// A suburb is a town of its own in the place list (Sollentuna, Upplands Väsby, Timrå), and
// at the page's scale it took the name space of Västerås or Örebro beside the city it
// belongs to. A town is kept only if none listed before it, the larger, is within `km`.
const spaced = (list, km) => {
	const kept = [];
	for (const l of list) {
		const near = kept.some((k) => {
			const dy = (l.lat - k.lat) * 111.2;
			const dx = (l.lon - k.lon) * 111.2 * Math.cos((l.lat * Math.PI) / 180);
			return Math.hypot(dx, dy) < km;
		});
		if (!near) kept.push(l);
	}
	return kept;
};

const out = {
	SWEDEN_DETAIL: rings(src.SWEDEN_DETAIL, EPS.sweden),
	NEIGHBORS_DETAIL: rings(src.NEIGHBORS_DETAIL, EPS.neighbors),
	ISLANDS_DETAIL: [],
	LAKES_DETAIL: tagged(src.LAKES_DETAIL, "ring", true, EPS.lakes),
	RIVERS_DETAIL: tagged(src.RIVERS_DETAIL, "line", false, EPS.rivers),
	TOWNS_DETAIL: spaced(labels(src.TOWNS_DETAIL), 35),
	BORDERS_DETAIL: rings(src.BORDERS_DETAIL, EPS.borders, false),
	COUNTRIES_DETAIL: labels(src.COUNTRIES_DETAIL),
	SEAS_DETAIL: labels(src.SEAS_DETAIL),
	CITIES_DETAIL: labels(src.CITIES_DETAIL),
	PARKS_DETAIL: [],
};

const TYPES = {
	SWEDEN_DETAIL: "readonly (readonly (readonly [number, number])[])[]",
	NEIGHBORS_DETAIL: "readonly (readonly (readonly [number, number])[])[]",
	ISLANDS_DETAIL:
		"readonly { z: number; se: boolean; ring: readonly (readonly [number, number])[] }[]",
	LAKES_DETAIL: "readonly { z: number; ring: readonly (readonly [number, number])[] }[]",
	RIVERS_DETAIL: "readonly { z: number; line: readonly (readonly [number, number])[] }[]",
	TOWNS_DETAIL: "readonly { name: string; lat: number; lon: number; z: number }[]",
	BORDERS_DETAIL: "readonly (readonly (readonly [number, number])[])[]",
	COUNTRIES_DETAIL: "readonly { name: string; lat: number; lon: number; z: number }[]",
	SEAS_DETAIL: "readonly { name: string; lat: number; lon: number; z: number }[]",
	CITIES_DETAIL: "readonly { name: string; lat: number; lon: number; z: number }[]",
	PARKS_DETAIL: "readonly (readonly (readonly [number, number])[])[]",
};

let ts = `// AUTO-GENERATED by scripts/build-map-detail-page.mjs — do not edit by hand.
// The wall's map-detail.ts at the web page's scale: zoom ≤ ${Z_MAX}, window ${JSON.stringify(WINDOW)},
// Douglas–Peucker per layer ${JSON.stringify(EPS)}°. Natural Earth 1:10m (public domain), no
// parks (OpenStreetMap's would need a credit on the map).
//
// ⚠️ DYNAMICALLY imported by scripts/bonetider-field.ts after the map's first paint. Never
// import it statically from render-field.ts, which every city page bundles.
`;
for (const [k, v] of Object.entries(out)) {
	ts += `export const ${k}: ${TYPES[k]} = JSON.parse(${JSON.stringify(JSON.stringify(v))});\n`;
}
const file = join(here, "../src/lib/bonetider/map-detail-page.ts");
writeFileSync(file, ts);
for (const [k, v] of Object.entries(out)) console.log(k.padEnd(18), v.length);
console.log(`${file}: ${Math.round(ts.length / 1024)} KB`);
