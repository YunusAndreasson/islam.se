// The solar field: turn the prayer-times engine into map geometry.
//
// IMPORTANT — validity: every *moment* on this map comes straight from adhan via
// computePrayerTimes(). Nothing here invents a prayer time. The lines are the
// exact locus where a real prayer time equals the chosen instant. (The twilight
// wash that actually renders is independent of this file — pure sun geometry in
// washShader.ts, with its CPU twin in skia/washColor.ts; this file only feeds the
// sweeping prayer LINES.)
//
// We compute a grid of prayer times ONCE per (date, settings) — that's the only
// expensive step — then per displayed instant it's cheap arithmetic on the cache.
import { computePrayerTimes, PRAYER_ORDER, type PrayerKey } from "../prayer-times";
import type { PrayerSettings } from "../settings";
import { solarParams } from "./sun";

// Minimal GeoJSON shapes — the web port carries the few types it needs inline so it
// pulls in no @types/geojson dependency. Matches the subset field.ts actually emits.
type Position = [number, number];
interface MultiLineString {
	type: "MultiLineString";
	coordinates: Position[][];
}
interface Feature<G = unknown, P = unknown> {
	type: "Feature";
	properties: P;
	geometry: G;
}
interface FeatureCollection {
	type: "FeatureCollection";
	features: Feature<MultiLineString, { prayer: PrayerKey }>[];
}

import {
	catmullRom,
	chainSegments,
	labelPlacement,
	marchingSquares,
	type Segment,
	smoothChain,
} from "./contour";

// Generously larger than the camera's Sweden framing so the wash always covers the
// whole viewport — at the locked zoom-out the visible map spills well past Sweden
// (open sea west, Finland/Baltics east, the continent south), and a tighter grid
// left those edges unwashed as a visible rectangular "box". Cells outside Sweden
// carry the wash but need no detail, so the step can stay moderate.
const DEFAULT_GRID_BOUNDS: [number, number, number, number] = [0.0, 50.0, 34.0, 73.0];
// Moderate step: fine enough (with the wash shader's bilinear texture sampling) to read
// as a smooth gradient over Sweden, coarse enough that covering the wider viewport keeps
// the one-time grid build — memoised per (day, settings) — a brief one-off.
const DEFAULT_LAT_STEP = 0.42;
const DEFAULT_LON_STEP = 0.52;

/** Prayer + sun-event times (ms epoch; NaN where adhan can't resolve them) at one point. */
interface PointTimes {
	fajr: number;
	sunrise: number;
	dhuhr: number;
	asr: number;
	maghrib: number;
	isha: number;
	sunset: number;
}

export interface SolarGrid {
	lats: number[];
	lons: number[];
	/** pt[latIdx][lonIdx] */
	pt: PointTimes[][];
}

export interface GridOptions {
	bounds?: [number, number, number, number];
	latStep?: number;
	lonStep?: number;
}

const ms = (d: Date): number => d.getTime();

function axis(min: number, max: number, step: number): number[] {
	const out: number[] = [];
	for (let v = min; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(4)));
	// The stepped loop stops at the last whole step <= max (e.g. 72.68 for [50, 73] step
	// 0.42), leaving an uncovered strip up to the declared bound. Append the exact max so
	// the grid actually spans the bounds it claims; the final cell is just shorter.
	const last = out[out.length - 1];
	if (last === undefined || last < max - 1e-9) out.push(Number(max.toFixed(4)));
	return out;
}

/** Standard refraction + solar-semidiameter allowance: the sun counts as risen when
 *  its centre is 0.833° below the geometric horizon. */
const HORIZON_DEG = -0.833;

/**
 * Does the sun actually rise and set at this latitude on this date?
 *
 * North of the midnight-sun line the answer is no, and that matters here more than
 * it looks. Sweden's default polar rule is Aqrab al-Balad, so `computePrayerTimes`
 * does not fail there — it BORROWS the times of the nearest latitude that still has
 * a night. Measured on 2026-07-25 (declination 19.75°, boundary 69.42°N): 69.0°
 * returns Fajr 01:28, and 69.5°, 70°, 71° and 72° all return exactly 01:05. So the
 * field this file contours is a 23-minute cliff followed by a dead-flat plateau.
 *
 * Marching squares then does precisely what it is asked: it finds a level crossing
 * inside the cliff and wanders along the plateau, which renders as the Fajr line
 * zigzagging back on itself in Norrbotten and Shurūq breaking into stubs, with both
 * labels piling up in the same corner.
 *
 * The honest fix is upstream of the geometry. A sweeping prayer line asserts "this
 * event is crossing the map right now", and north of this boundary there is no such
 * event — the displayed time is a jurisprudential substitute, not an astronomical
 * moment. So those samples are marked NaN, which marchingSquares already drops
 * cleanly (it skips any cell with a NaN corner, by design).
 *
 * Scope is deliberately narrow: ONLY the polar plateau, not the whole high-latitude
 * band. Most of Sweden gets high-latitude-rule Fajr/Isha in summer (Stockholm's sun
 * never reaches 18° in June), but those values are smooth and monotonic in latitude
 * — genuinely contourable. Masking them would erase the lines from the whole
 * country, which is a different and much worse bug.
 */
function sunRisesAndSets(latDeg: number, declDeg: number): boolean {
	// Altitude at local solar midnight and at solar noon, for a given declination.
	const minAlt = latDeg + declDeg - 90;
	const maxAlt = 90 - latDeg + declDeg;
	const midnightSun = minAlt > HORIZON_DEG;
	const polarNight = maxAlt < HORIZON_DEG;
	return !(midnightSun || polarNight);
}

/** One latitude row of the lattice. Split out so the async builder can yield between rows. */
function gridRow(
	lat: number,
	lons: readonly number[],
	date: Date,
	settings: PrayerSettings,
	declDeg: number,
): PointTimes[] {
	// Latitude alone decides this, so it is settled once per row rather than per cell.
	const solarDay = sunRisesAndSets(lat, declDeg);
	return lons.map((lon) => {
		const p = computePrayerTimes({ latitude: lat, longitude: lon }, date, settings);
		// Dhuhr and Asr survive the polar rows: the sun still culminates even when it
		// never sets, so those two remain real events with real loci.
		return {
			fajr: solarDay ? ms(p.fajr) : Number.NaN,
			sunrise: solarDay ? ms(p.sunrise) : Number.NaN,
			dhuhr: ms(p.dhuhr),
			asr: ms(p.asr),
			maghrib: solarDay ? ms(p.maghrib) : Number.NaN,
			isha: solarDay ? ms(p.isha) : Number.NaN,
			sunset: solarDay ? ms(p.sunset) : Number.NaN,
		};
	});
}

/** Solar declination in degrees for `date` — shared by the sync and async grid builders. */
function declDegOf(date: Date): number {
	return (solarParams(date).declRad * 180) / Math.PI;
}

function gridAxes(opts: GridOptions) {
	const [w, s, e, n] = opts.bounds ?? DEFAULT_GRID_BOUNDS;
	return {
		lats: axis(s, n, opts.latStep ?? DEFAULT_LAT_STEP),
		lons: axis(w, e, opts.lonStep ?? DEFAULT_LON_STEP),
	};
}

/** Build the cached prayer-time lattice. Location-independent: it covers the whole map. */
export function buildGrid(date: Date, settings: PrayerSettings, opts: GridOptions = {}): SolarGrid {
	const { lats, lons } = gridAxes(opts);
	const declDeg = declDegOf(date);
	return { lats, lons, pt: lats.map((lat) => gridRow(lat, lons, date, settings, declDeg)) };
}

/** Yield the main thread between row batches so the build never becomes a long task. */
const yieldToMain = (): Promise<void> =>
	"scheduler" in globalThis &&
	typeof (globalThis.scheduler as { yield?: () => Promise<void> })?.yield === "function"
		? (globalThis.scheduler as { yield: () => Promise<void> }).yield()
		: new Promise((r) => setTimeout(r, 0));

/** The same lattice, built in slices.
 *
 *  ⚠️ The `full` variant is 56 × 64 = 3 584 cells and each one runs a complete adhan
 *  solve, which measured as ONE 690 ms main-thread task — the page froze for two
 *  thirds of a second on all 2 128 city pages.
 *
 *  ⚠️ Size this against a THROTTLED row, not a desktop one. A row is ~12 ms here but
 *  ~49 ms on the 4×-slowed CPU that Lighthouse mobile (and a mid-range phone) models,
 *  so one row per slice is already at the 50 ms long-task threshold. Batching four —
 *  which looks harmless on a desktop — put it back to ~190 ms per slice. */
const ROWS_PER_SLICE = 1;

export async function buildGridAsync(
	date: Date,
	settings: PrayerSettings,
	opts: GridOptions = {},
): Promise<SolarGrid> {
	const { lats, lons } = gridAxes(opts);
	const declDeg = declDegOf(date);
	const pt: PointTimes[][] = [];
	for (const [i, lat] of lats.entries()) {
		pt.push(gridRow(lat, lons, date, settings, declDeg));
		if (i % ROWS_PER_SLICE === ROWS_PER_SLICE - 1 && i < lats.length - 1) await yieldToMain();
	}
	return { lats, lons, pt };
}

/** Below this the line is a corner stub, not a sweep worth naming. Measured in
 *  degrees of latitude-equivalent arc; a prayer line crossing Sweden runs 10–20°,
 *  so 3° (~330 km) sits well clear of a real one while catching the fragments. */
const MIN_LABELLED_EXTENT_DEG = 3;

/** Total length of a contour's segments, with longitude compressed by cos(lat) so a
 *  degree means roughly the same distance at 55°N as at 70°N. */
function arcExtentDeg(segments: Segment[]): number {
	let total = 0;
	for (const [a, b] of segments) {
		const midLatRad = (((a[1] + b[1]) / 2) * Math.PI) / 180;
		const dLon = (b[0] - a[0]) * Math.cos(midLatRad);
		const dLat = b[1] - a[1];
		total += Math.hypot(dLon, dLat);
	}
	return total;
}

export interface PrayerLineLabel {
	prayer: PrayerKey;
	lngLat: [number, number];
	/** Unit direction of the line at `lngLat`, in [lon, lat] space. */
	tangent: [number, number];
}

export interface SolarLines {
	lines: FeatureCollection;
	labels: PrayerLineLabel[];
}

/**
 * The sweeping prayer lines: for each prayer, the level-0 contour of
 * (prayerTime − now). A line only exists where that prayer is crossing the map at
 * this instant, so lines appear, sweep, and vanish on their own as time advances.
 */
export function buildLines(
	grid: SolarGrid,
	now: number,
	prayers: readonly PrayerKey[] = PRAYER_ORDER,
): SolarLines {
	const { lats, lons, pt } = grid;
	const features: Feature<MultiLineString, { prayer: PrayerKey }>[] = [];
	const labels: PrayerLineLabel[] = [];
	for (const prayer of prayers) {
		const field = pt.map((row) => row.map((t) => t[prayer] - now));
		const segments: Segment[] = marchingSquares(lats, lons, field, 0);
		if (segments.length === 0) continue;
		// Chain the raw cell segments into paths; de-noise the coarse-grid waviness
		// (smoothChain) and then fit a smooth interpolating curve through each (centripetal
		// Catmull-Rom) so the line reads as a true curve, not the gently faceted polyline the
		// ~40 km lattice leaves behind. Label placement stays on the raw segments — the
		// smoothed line tracks them within a fraction of a cell.
		//
		// 6 de-noising passes (was 3): where a prayer time changes fast with latitude — e.g.
		// Maghrib in the far north near midsummer, whose isoline bends hard — the coarse grid
		// leaves a sharp facet that 3 passes left visible (and Mercator magnifies it up north).
		// Extra passes pull the control polygon onto the smooth underlying curve before
		// Catmull-Rom resamples it; endpoints stay pinned, so open lines still reach the edge.
		const smoothed = chainSegments(segments).map((line) => catmullRom(smoothChain(line, 6)));
		features.push({
			type: "Feature",
			properties: { prayer },
			geometry: { type: "MultiLineString", coordinates: smoothed },
		});
		// Only a line with real presence on the map earns a name. A prayer whose locus
		// has almost left the frame leaves a stub a few pixels long in a corner, and
		// two such stubs (Fajr and Shurūq are close together in the northern summer)
		// put their labels on the same spot, where they overlap into an unreadable
		// pile. The line is still drawn — it is true — it just goes unlabelled until
		// enough of it is on screen to be worth naming.
		if (arcExtentDeg(segments) >= MIN_LABELLED_EXTENT_DEG) {
			const placement = labelPlacement(segments);
			if (placement) labels.push({ prayer, lngLat: placement.point, tangent: placement.tangent });
		}
	}
	return { lines: { type: "FeatureCollection", features }, labels };
}
