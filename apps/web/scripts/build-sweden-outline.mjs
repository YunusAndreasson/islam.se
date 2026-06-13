// Regenerates src/lib/bonetider/sweden-outline.ts — the simplified Sweden silhouette
// the Bönetider map draws. One-off / occasional: run `node scripts/build-sweden-outline.mjs`.
//
// Source: georgique/world-geojson (public data). We keep only landmasses that read at
// country scale (area ≥ 0.02 deg²: mainland + Gotland + Öland), Douglas–Peucker simplify
// to ~2 km, and round coordinates to 3 decimals — a ~9 KB silhouette with no runtime deps.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC =
	"https://raw.githubusercontent.com/georgique/world-geojson/develop/countries/sweden.json";
const EPS = 0.018; // degrees (~2 km)
const MIN_AREA = 0.02; // deg² — drop islets below this

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
	if (max > eps)
		return rdp(pts.slice(0, idx + 1), eps)
			.slice(0, -1)
			.concat(rdp(pts.slice(idx), eps));
	return [pts[0], pts[pts.length - 1]];
}
const shoelace = (ring) => {
	let a = 0;
	for (let k = 0; k < ring.length - 1; k++)
		a += ring[k][0] * ring[k + 1][1] - ring[k + 1][0] * ring[k][1];
	return Math.abs(a / 2);
};
const round = (p) => [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000];

const g = await (await fetch(SRC)).json();
const rings = g.features
	.filter((f) => f.geometry.type === "Polygon")
	.map((f) => f.geometry.coordinates[0]);
const kept = rings
	.map((r) => ({ r, area: shoelace(r) }))
	.filter((s) => s.area >= MIN_AREA)
	.sort((a, b) => b.area - a.area);
const outRings = kept.map(({ r }) => {
	const s = rdp(r, EPS).map(round);
	if (s[0][0] !== s.at(-1)[0] || s[0][1] !== s.at(-1)[1]) s.push(s[0]);
	return s;
});
const pts = outRings.flat();
const bbox = [
	Math.min(...pts.map((p) => p[0])),
	Math.min(...pts.map((p) => p[1])),
	Math.max(...pts.map((p) => p[0])),
	Math.max(...pts.map((p) => p[1])),
];

const body = `// AUTO-GENERATED — simplified Sweden silhouette for the Bönetider map.
// Source: georgique/world-geojson (public data), Douglas–Peucker @ ${EPS}° (~2 km),
// coords rounded to 3 decimals, islets dropped (mainland + Gotland + Öland).
// Regenerate with: node scripts/build-sweden-outline.mjs
export const SWEDEN_BBOX: readonly [number, number, number, number] = [${bbox.join(", ")}];

export const SWEDEN_OUTLINE: readonly (readonly [number, number])[][] = ${JSON.stringify(outRings)};
`;
const dest = join(
	dirname(fileURLToPath(import.meta.url)),
	"../src/lib/bonetider/sweden-outline.ts",
);
writeFileSync(dest, body);
console.log(`wrote ${dest}: ${outRings.length} rings, ${pts.length} pts, bbox ${bbox.join(",")}`);
