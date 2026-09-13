// Regenerates src/lib/bonetider/map-detail.ts — the moskéskärm's detailed map.
//
// The wall used to draw Sweden from the same silhouette as the 304 px article cards:
// georgique/world-geojson, 1 202 points, simplified to 2 km with every islet dropped.
// When the camera closes in on a mosque one pixel is about a kilometre, so that outline
// read as a cartoon — no archipelago on the west coast, no Orust or Tjörn, the Stockholm
// skärgård a smooth curve — and the neighbours came from the same coarse source.
//
// Land and water are Natural Earth 1:10m, which is public domain and needs no attribution
// on the screen. The towns are the site's own place list, credited on /bonetider/metod/.
//
//   SWEDEN_DETAIL     admin-0 Sweden, 4 665 points
//   ISLANDS_DETAIL    the minor islands, each given to the nearest coast, with min_zoom —
//                     at the country-wide frame their outlines were a grey fuzz along
//                     Norway and round Åland, and they belong to the close frame only
//   NEIGHBORS_DETAIL  every other admin-0 country in the window, sharing Sweden's borders
//                     exactly — two sources would leave slivers along the Norwegian border
//   LAKES_DETAIL      ne_10m_lakes + the European supplement, each with its min_zoom
//   RIVERS_DETAIL     river centrelines + the European supplement, each with its min_zoom
//   TOWNS_DETAIL      places.ts (GeoNames names, SCB tätort populations), tiered by size
//   BORDERS_DETAIL    land borders, which the wall draws dashed as the app does
//   COUNTRIES_DETAIL  country names in Swedish, at Natural Earth's own label points
//   SEAS_DETAIL       sea and great-lake names, placed by hand
//   CITIES_DETAIL     the neighbours' cities, by their Swedish names (Helsingfors, Åbo)
//   PARKS_DETAIL      national parks and nature reserves — OpenStreetMap, see below
//
// min_zoom is what lets the map get more detailed as the camera closes in: the renderer
// works out the web-map zoom it is drawing at and keeps only what Natural Earth itself
// says belongs at that scale. The widest frame shows the great lakes and main rivers;
// the frame around the mosque shows the rest.
//
// ⚠️ For the moskéskärm ONLY, dynamically imported by bonetider-skarm.ts. render-field.ts
// is bundled into all 2 128 city pages and must never import this file.
//
// (The 1:1M EuroGeographics countries on Eurostat's GISCO are finer still, but licensed
// for non-commercial use only and with a credit required on the map.)
//
// One-off: `node scripts/build-map-detail.mjs`
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/";
// The wall's widest frame, the same window as its prayer-line lattice (render-field.ts
// GRID_BOUNDS.screen), so land, water and lines all end together, well past the edge.
const CLIP = [-26, 44, 46, 78];
// ~200 m: a fifth of a pixel at the closest camera. It removes the source's redundant
// points and nothing that could be seen.
const EPS = 0.002;

async function load(name) {
	const res = await fetch(`${NE}${name}.geojson`);
	if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
	return res.json();
}

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
		const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
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

const round = (p) => [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000];
const inside = (p) => p[0] >= CLIP[0] && p[0] <= CLIP[2] && p[1] >= CLIP[1] && p[1] <= CLIP[3];

const outerRings = (geom) =>
	geom
		? geom.type === "Polygon"
			? [geom.coordinates[0]]
			: geom.type === "MultiPolygon"
				? geom.coordinates.map((poly) => poly[0])
				: []
		: [];

const lineStrings = (geom) =>
	geom
		? geom.type === "LineString"
			? [geom.coordinates]
			: geom.type === "MultiLineString"
				? geom.coordinates
				: []
		: [];

/** Sutherland–Hodgman against the window. Russia's European polygon runs to the Pacific;
 *  keeping the whole ring because its bbox touches the window would ship Siberia. */
function clipRing(ring, [w, s, e, n] = CLIP) {
	const lerp = (a, b, t) => [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
	const edges = [
		[(p) => p[0] >= w, (a, b) => lerp(a, b, (w - a[0]) / (b[0] - a[0]))],
		[(p) => p[0] <= e, (a, b) => lerp(a, b, (e - a[0]) / (b[0] - a[0]))],
		[(p) => p[1] >= s, (a, b) => lerp(a, b, (s - a[1]) / (b[1] - a[1]))],
		[(p) => p[1] <= n, (a, b) => lerp(a, b, (n - a[1]) / (b[1] - a[1]))],
	];
	let out = ring.slice(0, -1);
	for (const [isIn, cross] of edges) {
		const input = out;
		out = [];
		if (input.length === 0) break;
		let prev = input[input.length - 1];
		for (const cur of input) {
			if (isIn(cur)) {
				if (!isIn(prev)) out.push(cross(prev, cur));
				out.push(cur);
			} else if (isIn(prev)) out.push(cross(prev, cur));
			prev = cur;
		}
	}
	if (out.length < 3) return null;
	out.push(out[0]);
	return out;
}

/** A ring ready to ship: clipped, simplified, rounded, closed. */
function shipRing(ring) {
	const clipped = clipRing(ring);
	if (!clipped) return null;
	const s = rdp(clipped, EPS).map(round);
	if (s.length < 4) return null;
	if (s[0][0] !== s.at(-1)[0] || s[0][1] !== s.at(-1)[1]) s.push(s[0]);
	return s;
}

/** Runs of a polyline inside the window, each simplified and rounded. */
function shipLine(line) {
	const runs = [];
	let run = [];
	for (let i = 0; i < line.length; i++) {
		const keep =
			inside(line[i]) ||
			(i > 0 && inside(line[i - 1])) ||
			(i < line.length - 1 && inside(line[i + 1]));
		if (keep) run.push(line[i]);
		else {
			if (run.length > 1) runs.push(run);
			run = [];
		}
	}
	if (run.length > 1) runs.push(run);
	return runs.map((r) => rdp(r, EPS).map(round)).filter((r) => r.length > 1);
}

const [admin0, islands, lakes, lakesEurope, rivers, riversEurope, boundaryLines, places] =
	await Promise.all([
		load("ne_10m_admin_0_countries"),
		load("ne_10m_minor_islands"),
		load("ne_10m_lakes"),
		load("ne_10m_lakes_europe"),
		load("ne_10m_rivers_lake_centerlines"),
		load("ne_10m_rivers_europe"),
		load("ne_10m_admin_0_boundary_lines_land"),
		load("ne_10m_populated_places"),
	]);

/** The web-map zoom Natural Earth says a feature first belongs at. */
const zoomOf = (f) => Number(f.properties.min_zoom ?? f.properties.MIN_ZOOM ?? 0);

// ---- land ------------------------------------------------------------------
const sweden = [];
const neighbors = [];
for (const f of admin0.features) {
	const isSweden = f.properties.ADM0_A3 === "SWE";
	for (const r of outerRings(f.geometry)) {
		const s = shipRing(r);
		if (s) (isSweden ? sweden : neighbors).push(s);
	}
}

// Minor islands carry no country. Each goes to whichever coast it lies nearest, so the
// Bohuslän skerries take Sweden's land tone and the Norwegian ones the neighbours'.
const vertices = (rings) =>
	rings
		.flatMap((r) => r.filter((_, i) => i % 2 === 0))
		.filter(([x, y]) => x > 4 && x < 32 && y > 53 && y < 71);
const seV = vertices(sweden);
const nbV = vertices(neighbors);
const nearest = (p, vs) => {
	const k = Math.cos((p[1] * Math.PI) / 180);
	let best = Number.POSITIVE_INFINITY;
	for (const v of vs) {
		const d = ((v[0] - p[0]) * k) ** 2 + (v[1] - p[1]) ** 2;
		if (d < best) best = d;
	}
	return best;
};
const islandDetail = [];
for (const f of islands.features) {
	for (const r of outerRings(f.geometry)) {
		const s = shipRing(r);
		if (s)
			islandDetail.push({ z: zoomOf(f), se: nearest(s[0], seV) < nearest(s[0], nbV), ring: s });
	}
}

// ---- water -----------------------------------------------------------------
const lakeDetail = [];
for (const f of [...lakes.features, ...lakesEurope.features]) {
	for (const r of outerRings(f.geometry)) {
		const s = shipRing(r);
		if (s) lakeDetail.push({ z: zoomOf(f), ring: s });
	}
}
const riverDetail = [];
for (const f of [...rivers.features, ...riversEurope.features]) {
	// A centreline through a lake is drawn in the lake's own colour on top of it.
	if (f.properties.featurecla === "Lake Centerline") continue;
	for (const l of lineStrings(f.geometry))
		for (const run of shipLine(l)) riverDetail.push({ z: zoomOf(f), line: run });
}

// ---- towns -----------------------------------------------------------------
// The site's own place list, not Natural Earth's, which knows 34 Swedish towns. Official
// SCB tätorter only: GeoNames also lists suburbs SCB folds into a city — Sollentuna,
// Rinkeby, Öjersjö — and at the country-wide frame those would crowd round the capital.
// z is the zoom a town first appears at. drawTowns places them largest first and drops any
// that would collide, so the density at each zoom takes care of itself.
const { PLACES } = await import("../src/lib/bonetider/places.ts");
const TOWN_TIERS = [
	[40_000, 4.5],
	[15_000, 5.2],
	[7_000, 6],
	[3_000, 6.6],
];
const towns = PLACES.filter((p) => (p.scbPopulation ?? 0) >= TOWN_TIERS.at(-1)[0])
	.sort((a, b) => b.scbPopulation - a.scbPopulation)
	.map((p) => ({
		name: p.name,
		lat: Math.round(p.lat * 1000) / 1000,
		lon: Math.round(p.lon * 1000) / 1000,
		z: TOWN_TIERS.find(([min]) => p.scbPopulation >= min)[1],
	}));

// ---- the app's cartography ----------------------------------------------------
// What the app's map shows at country zoom that the wall did not: dashed land borders,
// country names, sea names and the neighbours' cities (nordicStyle.ts). All Natural Earth,
// with its Swedish names, except the parks.
const r3 = (v) => Math.round(v * 1000) / 1000;
const inWindow = (lon, lat) => lon >= CLIP[0] && lon <= CLIP[2] && lat >= CLIP[1] && lat <= CLIP[3];

const borderDetail = [];
for (const f of boundaryLines.features)
	for (const l of lineStrings(f.geometry)) for (const run of shipLine(l)) borderDetail.push(run);

const countries = admin0.features
	.filter(
		(f) => f.properties.ADM0_A3 !== "SWE" && inWindow(f.properties.LABEL_X, f.properties.LABEL_Y),
	)
	.map((f) => ({
		name: f.properties.NAME_SV,
		lat: r3(f.properties.LABEL_Y),
		lon: r3(f.properties.LABEL_X),
		z: f.properties.MIN_LABEL,
	}));

// By hand: Natural Earth's sea polygons carry Swedish names but no label points, and it
// has only one »Bottniska viken« where a Swedish map names two basins.
const seas = [
	["Östersjön", 56.5, 19.6, 4],
	["Nordsjön", 57.0, 3.5, 4],
	["Norska havet", 67.5, 5.5, 4],
	["Bottenhavet", 61.8, 19.5, 5],
	["Bottenviken", 64.8, 22.8, 5],
	["Finska viken", 59.8, 26.2, 5.7],
	["Rigabukten", 57.6, 23.5, 6],
	["Kattegatt", 56.9, 11.6, 6],
	["Skagerrak", 57.95, 9.2, 6],
	["Vänern", 58.9, 13.3, 5.5],
	["Ladoga", 60.8, 31.5, 5],
].map(([name, lat, lon, z]) => ({ name, lat, lon, z }));

// The Nordic and Baltic core only: over the whole window the wall's east edge filled with
// Tver, Brjansk and Smolensk. Every capital from z4, as the app names Oslo and Helsingfors
// before it names any town.
const CITY_WINDOW = [4, 53.2, 31, 71.5];
const inCityWindow = ([lon, lat]) =>
	lon >= CITY_WINDOW[0] && lon <= CITY_WINDOW[2] && lat >= CITY_WINDOW[1] && lat <= CITY_WINDOW[3];
const cities = places.features
	.filter(
		(f) =>
			f.properties.ADM0_A3 !== "SWE" &&
			inCityWindow(f.geometry.coordinates) &&
			f.properties.MIN_ZOOM <= 6.1,
	)
	.sort((a, b) => b.properties.POP_MAX - a.properties.POP_MAX)
	.map((f) => ({
		name: f.properties.NAME_SV || f.properties.NAME,
		lat: r3(f.geometry.coordinates[1]),
		lon: r3(f.geometry.coordinates[0]),
		z: /Admin-0 capital/.test(f.properties.FEATURECLA)
			? Math.min(4, f.properties.MIN_ZOOM)
			: f.properties.MIN_ZOOM,
	}));

// ---- parks (OpenStreetMap, via OpenFreeMap) -------------------------------------
// The green-grey patches all over the app's map at country zoom are its `park` layer:
// national parks and nature reserves, thickest along the Scandes. Natural Earth has no
// European parks, so these are read once, here, from the vector tiles the app streams.
// © OpenStreetMap contributors, ODbL — credited on /bonetider/metod/ and in the wall's
// corner. Only a tile's `park` layer is decoded, so a few lines of protobuf reading do
// instead of a dependency.
const PARK_Z = 6;
const PARK_BOUNDS = [3, 53.5, 32, 71.5]; // the Nordic and Baltic land the wall frames
const PARK_EPS = 0.004;
const MIN_PARK_AREA = 0.002; // deg², ~10 km² at 60°N — a few pixels at the closest camera

const tileX = (lon) => Math.floor(((lon + 180) / 360) * 2 ** PARK_Z);
const tileY = (lat) => {
	const r = (lat * Math.PI) / 180;
	return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** PARK_Z);
};
const mercLat = (my) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * my))) * 180) / Math.PI;

function varint(buf, at) {
	let value = 0;
	let shift = 0;
	let byte;
	do {
		byte = buf[at.pos++];
		value += (byte & 0x7f) * 2 ** shift;
		shift += 7;
	} while (byte >= 0x80);
	return value;
}

/** A protobuf message's fields: [field, varint] or [field, [start, end]] for bytes. */
function* fields(buf, start, end) {
	const at = { pos: start };
	while (at.pos < end) {
		const tag = varint(buf, at);
		const wire = tag % 8;
		const field = (tag - wire) / 8;
		if (wire === 0) yield [field, varint(buf, at)];
		else if (wire === 2) {
			const len = varint(buf, at);
			yield [field, [at.pos, at.pos + len]];
			at.pos += len;
		} else if (wire === 5) at.pos += 4;
		else if (wire === 1) at.pos += 8;
		else throw new Error(`protobuf wire type ${wire}`);
	}
}

/** MVT geometry commands → rings in tile coordinates. */
function decodeRings(cmds) {
	const out = [];
	let [x, y, i, ring] = [0, 0, 0, null];
	const zigzag = (n) => (n % 2 === 0 ? n / 2 : -(n + 1) / 2);
	while (i < cmds.length) {
		const id = cmds[i] & 7;
		const count = cmds[i] >> 3;
		i++;
		if (id === 7) {
			if (ring) ring.push(ring[0]);
			continue;
		}
		for (let k = 0; k < count; k++) {
			x += zigzag(cmds[i++]);
			y += zigzag(cmds[i++]);
			if (id === 1) {
				ring = [[x, y]];
				out.push(ring);
			} else ring?.push([x, y]);
		}
	}
	return out;
}

/** A tile layer's name, extent and feature byte ranges. */
function readLayer(buf, [start, end]) {
	let [name, extent] = ["", 4096];
	const features = [];
	for (const [f, v] of fields(buf, start, end)) {
		if (f === 1) name = new TextDecoder().decode(buf.subarray(v[0], v[1]));
		else if (f === 5) extent = v;
		else if (f === 2) features.push(v);
	}
	return { name, extent, features };
}

function parkRingsOf(buf, tx, ty) {
	const out = [];
	for (const [field, range] of fields(buf, 0, buf.length)) {
		if (field !== 3) continue;
		const { name, extent, features } = readLayer(buf, range);
		if (name !== "park") continue;
		for (const [fs, fe] of features) {
			const cmds = polygonCommands(buf, fs, fe);
			if (!cmds) continue;
			for (const ring of decodeRings(cmds)) {
				const s = shipParkRing(ring, extent, tx, ty);
				if (s) out.push(s);
			}
		}
	}
	return out;
}

/** A feature's geometry commands, or null unless it is a polygon. */
function polygonCommands(buf, start, end) {
	let [type, geom] = [0, null];
	for (const [f, v] of fields(buf, start, end)) {
		if (f === 3) type = v;
		else if (f === 4) geom = v;
	}
	if (type !== 3 || !geom) return null;
	const cmds = [];
	const at = { pos: geom[0] };
	while (at.pos < geom[1]) cmds.push(varint(buf, at));
	return cmds;
}

const shoelace = (ring) => {
	let a = 0;
	for (let k = 0; k < ring.length - 1; k++)
		a += ring[k][0] * ring[k + 1][1] - ring[k + 1][0] * ring[k][1];
	return a / 2;
};

/** One park ring in tile coordinates → a shippable lon/lat ring, or null. */
function shipParkRing(ring, extent, tx, ty) {
	// Exterior rings have positive area in tile coordinates (MVT spec); holes go.
	if (shoelace(ring) <= 0) return null;
	// Tiles carry a buffer past their edge; clipped to the tile, neighbouring tiles'
	// pieces meet exactly and fill as one shape.
	const clipped = clipRing(ring, [0, 0, extent, extent]);
	if (!clipped) return null;
	const lonLat = clipped.map(([px, py]) => [
		((tx + px / extent) / 2 ** PARK_Z) * 360 - 180,
		mercLat((ty + py / extent) / 2 ** PARK_Z),
	]);
	const s = rdp(lonLat, PARK_EPS).map(round);
	if (s.length < 4) return null;
	if (s[0][0] !== s.at(-1)[0] || s[0][1] !== s.at(-1)[1]) s.push(s[0]);
	return Math.abs(shoelace(s)) >= MIN_PARK_AREA ? s : null;
}

const tileJson = await (await fetch("https://tiles.openfreemap.org/planet")).json();
const parkTiles = [];
for (let ty = tileY(PARK_BOUNDS[3]); ty <= tileY(PARK_BOUNDS[1]); ty++)
	for (let tx = tileX(PARK_BOUNDS[0]); tx <= tileX(PARK_BOUNDS[2]); tx++) parkTiles.push([tx, ty]);
const parkDetail = [];
for (let i = 0; i < parkTiles.length; i += 6) {
	const batch = await Promise.all(
		parkTiles.slice(i, i + 6).map(async ([tx, ty]) => {
			const url = tileJson.tiles[0].replace("{z}", PARK_Z).replace("{x}", tx).replace("{y}", ty);
			const res = await fetch(url);
			if (!res.ok) throw new Error(`park tile ${tx}/${ty}: HTTP ${res.status}`);
			return parkRingsOf(new Uint8Array(await res.arrayBuffer()), tx, ty);
		}),
	);
	for (const rings of batch) parkDetail.push(...rings);
}

// ---- write -----------------------------------------------------------------
const count = (rings) => rings.reduce((a, r) => a + r.length, 0);
const Ring = "readonly (readonly [number, number])[]";
const Label = "readonly { name: string; lat: number; lon: number; z: number }[]";
const body = `// AUTO-GENERATED by scripts/build-map-detail.mjs — do not edit by hand.
// Natural Earth 1:10m (public domain), clipped to [${CLIP}], Douglas–Peucker @ ${EPS}°.
// PARKS_DETAIL: © OpenStreetMap contributors (ODbL), via OpenFreeMap.
//
// ⚠️ DYNAMICALLY imported by the moskéskärm only. Never import this from render-field.ts,
// which every city page bundles.
export const SWEDEN_DETAIL: readonly (${Ring})[] = ${JSON.stringify(sweden)};
export const NEIGHBORS_DETAIL: readonly (${Ring})[] = ${JSON.stringify(neighbors)};
export const ISLANDS_DETAIL: readonly { z: number; se: boolean; ring: ${Ring} }[] = ${JSON.stringify(islandDetail)};
export const LAKES_DETAIL: readonly { z: number; ring: ${Ring} }[] = ${JSON.stringify(lakeDetail)};
export const RIVERS_DETAIL: readonly { z: number; line: ${Ring} }[] = ${JSON.stringify(riverDetail)};
export const TOWNS_DETAIL: ${Label} = ${JSON.stringify(towns)};
export const BORDERS_DETAIL: readonly (${Ring})[] = ${JSON.stringify(borderDetail)};
export const COUNTRIES_DETAIL: ${Label} = ${JSON.stringify(countries)};
export const SEAS_DETAIL: ${Label} = ${JSON.stringify(seas)};
export const CITIES_DETAIL: ${Label} = ${JSON.stringify(cities)};
export const PARKS_DETAIL: readonly (${Ring})[] = ${JSON.stringify(parkDetail)};
`;
const dest = join(dirname(fileURLToPath(import.meta.url)), "../src/lib/bonetider/map-detail.ts");
writeFileSync(dest, body);
console.log(`wrote ${dest} (${Math.round(body.length / 1024)} kB)`);
console.log(`  sweden    ${sweden.length} rings, ${count(sweden)} pts`);
console.log(
	`  islands   ${islandDetail.length} (${islandDetail.filter((i) => i.se).length} Swedish), ${count(islandDetail.map((i) => i.ring))} pts`,
);
console.log(`  neighbors ${neighbors.length} rings, ${count(neighbors)} pts`);
console.log(`  lakes     ${lakeDetail.length}, ${count(lakeDetail.map((l) => l.ring))} pts`);
console.log(`  rivers    ${riverDetail.length}, ${count(riverDetail.map((l) => l.line))} pts`);
console.log(`  towns     ${towns.length}`);
console.log(`  borders   ${borderDetail.length}, ${count(borderDetail)} pts`);
console.log(
	`  labels    ${countries.length} countries, ${seas.length} seas, ${cities.length} cities`,
);
console.log(
	`  parks     ${parkDetail.length} rings, ${count(parkDetail)} pts from ${parkTiles.length} tiles`,
);
