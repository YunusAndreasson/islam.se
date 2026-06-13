// Turns the raw GeoNames dataset (places.ts) into routable, de-duplicated city
// entries for the /bonetider/[stad] pages and the ⌘K palette. Pure + build-time:
// the slug uniqueness guard runs at module load, so a routing regression fails the
// build with a clear message instead of silently dropping a page.
import { PLACES, type SwedishPlace } from "./places";
import { slugify } from "./slug";

export interface IndexedPlace extends SwedishPlace {
	/** URL segment, unique across the whole index (see disambiguation below). */
	readonly slug: string;
}

// Page coverage knob: a place gets its own page when its population is at least this.
// The dataset bottoms out near 200, so 200 = "every locality". Raise it to trim the
// long tail to fewer, higher-demand towns — this single constant is the whole dial.
export const MIN_POPULATION = 200;

// Above this population a place gets a personalised satori OG card; below it the
// shared /bonetider silhouette card is used, so the long-tail build stays cheap.
export const OG_POPULATION = 5000;

function buildIndex(): IndexedPlace[] {
	const taken = new Set<string>();
	const out: IndexedPlace[] = [];
	// PLACES is sorted by population descending, so the larger town deterministically
	// wins the clean slug and smaller same-name towns get the disambiguated form.
	for (const p of PLACES) {
		if (p.population < MIN_POPULATION) continue;
		const base = slugify(p.name);
		if (!base) continue; // a name that slugs to nothing (shouldn't happen) is skipped
		let slug = base;
		if (taken.has(slug)) {
			// Same name, different county (e.g. several "Kärna"): qualify with the county,
			// then a numeric suffix only if even that collides.
			slug = `${base}-${slugify(p.county)}`;
			let n = 2;
			while (taken.has(slug)) slug = `${base}-${slugify(p.county)}-${n++}`;
		}
		taken.add(slug);
		out.push({ ...p, slug });
	}
	return out;
}

export const INDEXED_PLACES: readonly IndexedPlace[] = buildIndex();

// Build-time invariant: slugs are page routes, so they MUST be unique. buildIndex
// already disambiguates; a duplicate here would mean a logic regression. Fail loudly.
{
	const seen = new Set<string>();
	for (const p of INDEXED_PLACES) {
		if (seen.has(p.slug)) {
			throw new Error(`bonetider: duplicate city slug "${p.slug}" (${p.name}, ${p.county})`);
		}
		seen.add(p.slug);
	}
}

const BY_SLUG = new Map(INDEXED_PLACES.map((p) => [p.slug, p]));

export function placeBySlug(slug: string): IndexedPlace | undefined {
	return BY_SLUG.get(slug);
}

/** The population to display: the official SCB tätort figure when we matched one,
 *  otherwise the GeoNames estimate. Pair with `place.scbPopulation != null` to know
 *  which it is (and to decide whether to cite SCB / show the stat block). */
export function officialPopulation(place: SwedishPlace): number {
	return place.scbPopulation ?? place.population;
}

// Great-circle distance (km) — for "nearby towns" cross-links.
function haversineKm(a: SwedishPlace, b: SwedishPlace): number {
	const R = 6371;
	const dLat = ((b.lat - a.lat) * Math.PI) / 180;
	const dLon = ((b.lon - a.lon) * Math.PI) / 180;
	const la1 = (a.lat * Math.PI) / 180;
	const la2 = (b.lat * Math.PI) / 180;
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
	return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Precomputed k-nearest neighbours per place. Without this, every one of the 2000+
// /bonetider/[stad] pages re-scanned and re-sorted the *entire* index (an O(n²)
// haversine sweep across the whole build); now the neighbour lists are computed once,
// lazily, on first use and looked up by slug. NEIGHBOUR_K caps each list — callers
// ask for ≤8, so 8 covers every current need.
const NEIGHBOUR_K = 8;
let neighbourCache: Map<string, IndexedPlace[]> | null = null;

function buildNeighbours(): Map<string, IndexedPlace[]> {
	const map = new Map<string, IndexedPlace[]>();
	for (const a of INDEXED_PLACES) {
		const nearest = INDEXED_PLACES.filter((b) => b.slug !== a.slug)
			.map((b) => ({ b, d: haversineKm(a, b) }))
			.sort((x, y) => x.d - y.d)
			.slice(0, NEIGHBOUR_K)
			.map((x) => x.b);
		map.set(a.slug, nearest);
	}
	return map;
}

/** The `count` nearest other places, for the per-city "närliggande orter" links that
 *  web the pages together (good for crawl depth and for users). */
export function nearbyPlaces(place: IndexedPlace, count = 6): IndexedPlace[] {
	neighbourCache ??= buildNeighbours();
	return (neighbourCache.get(place.slug) ?? []).slice(0, count);
}

/** Places grouped by county (län), counties alphabetical, places by population desc —
 *  for the /bonetider hub's browse-by-region list. */
export function placesByCounty(): { county: string; places: IndexedPlace[] }[] {
	const groups = new Map<string, IndexedPlace[]>();
	for (const p of INDEXED_PLACES) {
		const arr = groups.get(p.county);
		if (arr) arr.push(p);
		else groups.set(p.county, [p]);
	}
	return [...groups.entries()]
		.map(([county, places]) => ({ county: county || "Övriga", places }))
		.sort((a, b) => a.county.localeCompare(b.county, "sv"));
}
