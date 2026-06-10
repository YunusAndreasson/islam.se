// Regenerates src/lib/bonetider/neighbors-outline.ts — the faint surrounding-country
// landmasses the Bönetider map draws BEHIND Sweden, so the (zoomed-out) frame reads as a
// real Nordic/Baltic map instead of Sweden floating alone in empty sea. The sweeping
// prayer lines spend most of the day out over these neighbours' longitudes, so they need
// land under them to make sense. One-off: `node scripts/build-neighbors-outline.mjs`.
//
// Source: georgique/world-geojson (public data, same as the Sweden silhouette). Aggressively
// simplified (these are background context, not the subject), islets dropped, and clipped by
// ring bbox to the map's view so we don't ship the whole of Norway/Finland/etc.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE = "https://raw.githubusercontent.com/georgique/world-geojson/develop/countries/";
const COUNTRIES = [
	"norway",
	"finland",
	"denmark",
	"estonia",
	"latvia",
	"lithuania",
	"poland",
	"germany",
	"russia",
	"belarus",
	"united_kingdom",
	"ireland",
	"netherlands",
];
const EPS = 0.06; // degrees (~6 km) — coarse; these are faint background blobs
const MIN_AREA = 0.06; // deg² — drop anything smaller than a readable landmass
// Keep only rings whose bbox intersects the map view (with a margin); the canvas clips
// the rest. Mirrors render-field's VIEW_BBOX, grown a little — wide enough west (the
// North Sea + Britain) that a prayer line trailing off to the west still has land under
// it instead of running into empty ocean.
const CLIP = [-11, 48, 36, 74];

function rdp(pts, eps) {
	if (pts.length < 3) return pts;
	let idx = -1;
	let max = 0;
	const [ax, ay] = pts[0];
	const [bx, by] = pts[pts.length - 1];
	for (let i = 1; i < pts.length - 1; i++) {
		const [px, py] = pts[i];
		const dx = bx - ax;
		const dy = by - ay;
		const len2 = dx * dx + dy * dy || 1e-12;
		const t = ((px - ax) * dx + (py - ay) * dy) / len2;
		const cx = ax + t * dx;
		const cy = ay + t * dy;
		const d = Math.hypot(px - cx, py - cy);
		if (d > max) {
			max = d;
			idx = i;
		}
	}
	if (max > eps) return rdp(pts.slice(0, idx + 1), eps).slice(0, -1).concat(rdp(pts.slice(idx), eps));
	return [pts[0], pts[pts.length - 1]];
}
const shoelace = (ring) => {
	let a = 0;
	for (let k = 0; k < ring.length - 1; k++) a += ring[k][0] * ring[k + 1][1] - ring[k + 1][0] * ring[k][1];
	return Math.abs(a / 2);
};
const round = (p) => [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000];
const ringBbox = (r) => [
	Math.min(...r.map((p) => p[0])),
	Math.min(...r.map((p) => p[1])),
	Math.max(...r.map((p) => p[0])),
	Math.max(...r.map((p) => p[1])),
];
const intersects = (b) => b[0] <= CLIP[2] && b[2] >= CLIP[0] && b[1] <= CLIP[3] && b[3] >= CLIP[1];

const allRings = [];
for (const name of COUNTRIES) {
	const res = await fetch(BASE + name + ".json");
	if (!res.ok) {
		console.log(`${name}: HTTP ${res.status} — skipped`);
		continue;
	}
	const g = await res.json();
	const outers = g.features.flatMap((f) =>
		f.geometry.type === "Polygon"
			? [f.geometry.coordinates[0]]
			: f.geometry.type === "MultiPolygon"
				? f.geometry.coordinates.map((poly) => poly[0])
				: [],
	);
	let kept = 0;
	for (const r of outers) {
		if (shoelace(r) < MIN_AREA) continue;
		if (!intersects(ringBbox(r))) continue;
		const s = rdp(r, EPS).map(round);
		if (s.length < 4) continue;
		if (s[0][0] !== s.at(-1)[0] || s[0][1] !== s.at(-1)[1]) s.push(s[0]);
		allRings.push(s);
		kept++;
	}
	console.log(`${name}: kept ${kept} rings`);
}

const pts = allRings.flat().length;
const body = `// AUTO-GENERATED — faint surrounding-country landmasses for the Bönetider map, drawn
// behind the Sweden silhouette so the (zoomed-out) frame reads as a Nordic/Baltic map
// rather than Sweden alone in empty sea. Source: georgique/world-geojson (public data),
// Douglas–Peucker @ ${EPS}° (~6 km), islets dropped, clipped to the map view.
// Regenerate with: node scripts/build-neighbors-outline.mjs
export const NEIGHBORS_OUTLINE: readonly (readonly [number, number])[][] = ${JSON.stringify(allRings)};
`;
const dest = join(dirname(fileURLToPath(import.meta.url)), "../src/lib/bonetider/neighbors-outline.ts");
writeFileSync(dest, body);
console.log(`wrote ${dest}: ${allRings.length} rings, ${pts} pts`);
