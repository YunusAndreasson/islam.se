// The front page's map of Sweden: one silhouette and two layers of points, built at
// build time into three SVG path strings (PraktisktHome.astro). Pure — no DOM, no
// canvas, no MapLibre — so the whole map ships as a few kilobytes of inline markup.
//
// PROJECTION. Equirectangular, with longitude scaled by cos(mid-latitude): at 62° N a
// degree of longitude is less than half a degree of latitude, and an unscaled plot draws
// Sweden twice as fat as it is. One scale for the whole country is exact enough at
// 100 units across; the error from 55° to 69° is a few percent at the extremes.
//
// POINTS AS ONE PATH. Every point is a zero-length subpath (`M x y h0`); drawn with
// `stroke-linecap: round` each becomes a dot. Because it is ONE path, the stroke is
// rasterised once as a union: two mosques 300 m apart in Stockholm merge into a
// slightly larger mark at the same strength instead of a brighter one. That is the
// standing rule for this site's maps — even points, no per-item glow, density shown as
// area rather than as brightness.
import { SWEDEN_BBOX, SWEDEN_OUTLINE } from "./bonetider/sweden-outline";

type Pt = readonly [number, number];

const [WEST, SOUTH, EAST, NORTH] = SWEDEN_BBOX;
const K = Math.cos((((SOUTH + NORTH) / 2) * Math.PI) / 180);

/** Width of the map's coordinate space. Height follows from the country's shape. */
export const KARTA_WIDTH = 100;
const SCALE = KARTA_WIDTH / ((EAST - WEST) * K);
/** Height of the coordinate space: Sweden is ~2.2 times taller than it is wide. */
export const KARTA_HEIGHT = Math.ceil((NORTH - SOUTH) * SCALE * 10) / 10;

/** Longitude/latitude → map units. North is up (y grows southward), east is right. */
export function project(lon: number, lat: number): [number, number] {
	return [(lon - WEST) * K * SCALE, (NORTH - lat) * SCALE];
}

/** One decimal: 0.1 unit is ~0.15 px at the size the map is drawn. */
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Shortest decimal spelling: "0.5" → ".5", "-0.5" → "-.5", "3" → "3". */
function num(n: number): string {
	const s = String(r1(n) === 0 ? 0 : r1(n));
	return s.replace(/^(-?)0\./, "$1.");
}

/** Join coordinate pairs the way SVG path data allows: a minus sign is its own
 *  separator, so "1.2-3" needs no space. */
function pair(x: number, y: number): string {
	const ys = num(y);
	return `${num(x)}${ys.startsWith("-") ? "" : " "}${ys}`;
}

function perpDist(p: Pt, a: Pt, b: Pt): number {
	const dx = b[0] - a[0];
	const dy = b[1] - a[1];
	const len = Math.hypot(dx, dy);
	if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
	return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len;
}

/** Douglas–Peucker on an open polyline, in map units. */
function simplify(points: readonly Pt[], tolerance: number): Pt[] {
	if (points.length <= 2) return [...points];
	const first = points[0] as Pt;
	const last = points[points.length - 1] as Pt;
	let maxD = 0;
	let idx = 0;
	for (let i = 1; i < points.length - 1; i++) {
		const d = perpDist(points[i] as Pt, first, last);
		if (d > maxD) {
			maxD = d;
			idx = i;
		}
	}
	if (maxD <= tolerance) return [first, last];
	const left = simplify(points.slice(0, idx + 1), tolerance);
	const right = simplify(points.slice(idx), tolerance);
	return [...left.slice(0, -1), ...right];
}

/** A closed ring, simplified: split at the vertex farthest from the start so the
 *  open-polyline algorithm never sees a zero-length base line. */
function simplifyRing(ring: readonly Pt[], tolerance: number): Pt[] {
	const open = ring.slice(0, -1);
	const start = open[0] as Pt;
	let far = 0;
	let farD = -1;
	open.forEach((p, i) => {
		const d = Math.hypot(p[0] - start[0], p[1] - start[1]);
		if (d > farD) {
			farD = d;
			far = i;
		}
	});
	const a = simplify(open.slice(0, far + 1), tolerance);
	const b = simplify([...open.slice(far), start], tolerance);
	return [...a.slice(0, -1), ...b.slice(0, -1)];
}

/** The silhouette as path data. Relative segments between ROUNDED absolute points,
 *  so the deltas carry no rounding drift and the ring closes exactly. The default
 *  tolerance, 0.25 units (~1.7 km), is below what the eye resolves at this size and
 *  keeps the coast's character — the Bothnian bays, the Skåne corner, Gotland. */
export function outlinePath(tolerance = 0.25): string {
	return SWEDEN_OUTLINE.map((ring) => {
		const pts = simplifyRing(
			ring.map(([lon, lat]) => project(lon, lat)),
			tolerance,
		).map(([x, y]) => [r1(x), r1(y)] as const);
		const [x0, y0] = pts[0] as Pt;
		// One `l`, then bare pairs: SVG repeats the last command implicitly, and a
		// minus sign separates numbers on its own.
		let d = `M${pair(x0, y0)}l`;
		let first = true;
		for (let i = 1; i < pts.length; i++) {
			const [px, py] = pts[i - 1] as Pt;
			const [x, y] = pts[i] as Pt;
			const dx = r1(x - px);
			const dy = r1(y - py);
			if (dx === 0 && dy === 0) continue;
			const seg = pair(dx, dy);
			d += first || seg.startsWith("-") ? seg : ` ${seg}`;
			first = false;
		}
		return `${d}z`;
	}).join("");
}

/** Points as zero-length subpaths — one `M`/`m` per point, each followed by `h0`.
 *  Relative moves between rounded positions keep the string short without drift. */
export function dotsPath(points: readonly { lat: number; lng: number }[]): string {
	let d = "";
	let prev: Pt | null = null;
	for (const p of points) {
		const [x, y] = project(p.lng, p.lat).map(r1) as [number, number];
		d += prev ? `m${pair(r1(x - prev[0]), r1(y - prev[1]))}h0` : `M${pair(x, y)}h0`;
		prev = [x, y];
	}
	return d;
}
