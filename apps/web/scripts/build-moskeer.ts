/**
 * build-moskeer — one-off normalizer (run BY HAND: `pnpm tsx scripts/build-moskeer.ts`).
 *
 * Reads the raw scrape `src/data/moskeer-sverige.csv` (merged from migrationskartan +
 * OpenStreetMap + muslimer.se) and writes the CLEAN, committed source of truth
 * `src/data/moskeer-sverige.json` that the /moskeer page reads.
 *
 * After the first run the JSON is canonical — edit it directly. Re-run this only to
 * re-import from an updated CSV (it overwrites the JSON wholesale).
 *
 * What it does, and why:
 *   - Coordinates are the only reliable field (every row sits inside Sweden), so
 *     city / kommun / län are derived from the NEAREST place in the Bönetider
 *     GeoNames+SCB dataset (src/lib/bonetider/places.ts) — fixing the ~39 rows whose
 *     address string is blank or too short to parse a län from.
 *   - denomination ("Sunni" / "Sannolikt Sunni") is DROPPED: it is speculative and
 *     not something we want to publish per-mosque.
 *   - `opened` is kept only when it is a real past year (blanks and the placeholder
 *     2030 "future/unknown" markers are dropped).
 *   - `organisation` is taken from the raw `financier` only when genuinely known
 *     (not "Okänt"/blank), trimmed to a short label.
 *   - A blank name becomes "Moské i {city}".
 *
 * The JSON is validated row-by-row here; a bad row aborts the run with a clear message.
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PLACES, type SwedishPlace } from "../src/lib/bonetider/places";
import { INDEXED_PLACES, type IndexedPlace } from "../src/lib/bonetider/places-index";
import { slugify } from "../src/lib/bonetider/slug";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = join(__dirname, "..");
const csvPath = join(webRoot, "src/data/moskeer-sverige.csv");
const jsonPath = join(webRoot, "src/data/moskeer-sverige.json");

const CURRENT_YEAR = new Date().getFullYear();
const ORG_MAX_LEN = 140;

/** The clean record the site reads. Mirror of the interface in src/lib/moskeer/index.ts. */
interface Mosque {
	id: string;
	name: string;
	lat: number;
	lng: number;
	city: string;
	/** Bönetider place slug for this city, so /moskeer/[stad] pairs 1:1 with /bonetider/[stad]. */
	citySlug: string;
	kommun: string;
	lan: string; // county short form, e.g. "Stockholm" (matches places.ts `county`)
	opened?: number;
	organisation?: string;
	/** Cleaned street/area line (admin tail stripped), e.g. "Rosentorpsvägen, Lunnahus, Bjuv". */
	address?: string;
	/** Swedish postal code, e.g. "267 39". */
	postalCode?: string;
}

// ─── CSV parsing (RFC-4180-ish, quote- and newline-aware; no dependency) ──────────────
function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let inQuotes = false;
	const endField = () => {
		row.push(field);
		field = "";
	};
	const endRow = () => {
		endField();
		if (row.length > 1 || row[0] !== "") rows.push(row);
		row = [];
	};
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (inQuotes) {
			if (c !== '"') field += c;
			else if (text[i + 1] === '"') {
				field += '"'; // doubled "" is a literal quote
				i++;
			} else inQuotes = false; // lone quote closes the field
			continue;
		}
		if (c === '"') inQuotes = true;
		else if (c === ",") endField();
		else if (c === "\n") endRow();
		else if (c === "\r") {
			if (text[i + 1] === "\n") i++; // swallow \r\n as one break
			endRow();
		} else field += c;
	}
	if (field !== "" || row.length) endRow();
	return rows;
}

// ─── Geo: nearest known place gives city / kommun / län ───────────────────────────────
function haversineKm(aLat: number, aLon: number, b: SwedishPlace): number {
	const R = 6371;
	const dLat = ((b.lat - aLat) * Math.PI) / 180;
	const dLon = ((b.lon - aLon) * Math.PI) / 180;
	const la1 = (aLat * Math.PI) / 180;
	const la2 = (b.lat * Math.PI) / 180;
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
	return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** All real SCB municipality names, for de-genitivising the address forms below. */
const KNOWN_KOMMUNS = new Set(PLACES.map((p) => p.kommun).filter((k): k is string => !!k));

/** "Stockholms" → "Stockholm" (address genitive → SCB nominative), but only when the
 *  stripped form is a real kommun, so genuine -s names ("Tranås", "Bollnäs") survive. */
function normalizeKommun(k: string): string {
	if (KNOWN_KOMMUNS.has(k)) return k;
	if (k.endsWith("s") && KNOWN_KOMMUNS.has(k.slice(0, -1))) return k.slice(0, -1);
	return k;
}

// Scan the INDEXED set (every place carries a routable `.slug`), so each mosque's
// citySlug is guaranteed resolvable and is identical to the place's /bonetider slug.
function nearestPlace(lat: number, lng: number): IndexedPlace {
	let best = INDEXED_PLACES[0];
	let bestD = Number.POSITIVE_INFINITY;
	for (const p of INDEXED_PLACES) {
		const d = haversineKm(lat, lng, p);
		if (d < bestD) {
			bestD = d;
			best = p;
		}
	}
	return best;
}

/** Parse "…, X kommun, …" out of the long Nominatim-style address, when present. */
function kommunFromAddress(address: string): string | undefined {
	for (const part of address.split(",").map((s) => s.trim())) {
		if (part.endsWith(" kommun")) return part.slice(0, -" kommun".length).trim();
	}
	return undefined;
}

// ─── Field cleaning ───────────────────────────────────────────────────────────────────
function cleanOpened(raw: string): number | undefined {
	const n = Number.parseInt(raw.trim(), 10);
	if (!Number.isFinite(n)) return undefined;
	// Real, already-built years only: drop blanks and the 2030 "planned/unknown" marker.
	if (n < 1900 || n > CURRENT_YEAR) return undefined;
	return n;
}

function cleanOrganisation(raw: string): string | undefined {
	const t = raw.replace(/\s+/g, " ").trim();
	if (!t || t.toLowerCase() === "okänt") return undefined;
	if (t.length <= ORG_MAX_LEN) return t;
	// Trim long prose to the first sentence, else a word boundary, + ellipsis.
	const firstSentence = t.match(/^.*?[.!?](?=\s|$)/)?.[0];
	if (firstSentence && firstSentence.length <= ORG_MAX_LEN) return firstSentence.trim();
	const cut = t.slice(0, ORG_MAX_LEN);
	return `${cut.slice(0, cut.lastIndexOf(" ")).trim()}…`;
}

/** Strip the fixed Nominatim administrative tail off the reverse-geocoded address and
 *  pull out the postal code. Input is a comma list like
 *    "Rosentorpsvägen, Lunnahus, Bjuv, Bjuvs kommun, Skåne län, 267 39, Sverige"
 *  → { address: "Rosentorpsvägen, Lunnahus, Bjuv", postalCode: "267 39" }.
 *  The leading token is sometimes the mosque's own name — that's fine as a street line. */
function cleanAddress(raw: string): { address?: string; postalCode?: string } {
	const t = raw.replace(/\s+/g, " ").trim();
	if (!t || t.toLowerCase() === "okänt") return {};
	let postalCode: string | undefined;
	const kept: string[] = [];
	for (const part of t
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean)) {
		if (/^\d{3}\s?\d{2}$/.test(part)) {
			postalCode = part;
			continue;
		}
		if (/\skommun$/i.test(part)) continue; // "Bjuvs kommun"
		if (/\slän$/i.test(part)) continue; // "Skåne län"
		if (/^sverige$/i.test(part)) continue; // country
		kept.push(part);
	}
	return { address: kept.join(", ") || undefined, postalCode };
}

/** Stable, unique slug for a mosque: name → kebab, qualified by kommun on collision,
 *  then a numeric suffix. Mutates `taken` to reserve the result. */
function uniqueSlug(name: string, city: string, kommun: string, taken: Set<string>): string {
	let slug = slugify(name) || slugify(`moske-${city}`);
	if (taken.has(slug)) {
		slug = `${slug}-${slugify(kommun)}`;
		let n = 2;
		while (taken.has(slug)) slug = `${slugify(name)}-${slugify(kommun)}-${n++}`;
	}
	taken.add(slug);
	return slug;
}

async function main() {
	const text = await readFile(csvPath, "utf8");
	const rows = parseCsv(text);
	const header = rows[0];
	const expected = [
		"name",
		"denomination",
		"denomination_basis",
		"opened",
		"financier",
		"address",
		"lat",
		"lng",
		"sources",
		"n_records",
	];
	if (header.join(",") !== expected.join(",")) {
		throw new Error(
			`Unexpected CSV header:\n  got: ${header.join(",")}\n  want: ${expected.join(",")}`,
		);
	}

	const col = (r: string[], name: string) => r[expected.indexOf(name)] ?? "";
	const mosques: Mosque[] = [];
	const takenSlugs = new Set<string>();
	let derivedLan = 0;
	let namedFromCity = 0;

	for (let i = 1; i < rows.length; i++) {
		const r = rows[i];
		const lat = Number.parseFloat(col(r, "lat"));
		const lng = Number.parseFloat(col(r, "lng"));
		if (!(Number.isFinite(lat) && Number.isFinite(lng))) {
			throw new Error(`Row ${i + 1}: bad coordinates (${col(r, "lat")}, ${col(r, "lng")})`);
		}
		if (lat < 55 || lat > 70 || lng < 10 || lng > 25) {
			throw new Error(`Row ${i + 1}: coordinates outside Sweden (${lat}, ${lng})`);
		}

		const place = nearestPlace(lat, lng);
		const city = place.name;
		const citySlug = place.slug;
		const lan = place.county || "Övriga";
		const rawAddress = col(r, "address");
		// Prefer the SCB nominative kommun ("Karlshamn") over the address genitive
		// ("Karlshamns kommun"); fall back to the address, then the nearest town name.
		const addressKommun = kommunFromAddress(rawAddress);
		const kommun = normalizeKommun(place.kommun ?? addressKommun ?? city);
		if (!addressKommun) derivedLan++;
		const { address, postalCode } = cleanAddress(rawAddress);

		let name = col(r, "name").replace(/\s+/g, " ").trim();
		if (!name) {
			name = `Moské i ${city}`;
			namedFromCity++;
		}

		const slug = uniqueSlug(name, city, kommun, takenSlugs);

		const mosque: Mosque = {
			id: slug,
			name,
			lat,
			lng,
			city,
			citySlug,
			kommun,
			lan,
		};
		const opened = cleanOpened(col(r, "opened"));
		if (opened !== undefined) mosque.opened = opened;
		const organisation = cleanOrganisation(col(r, "financier"));
		if (organisation !== undefined) mosque.organisation = organisation;
		if (address) mosque.address = address;
		if (postalCode) mosque.postalCode = postalCode;

		mosques.push(mosque);
	}

	// Sort by län (Swedish collation) then name, so JSON diffs stay stable across re-runs.
	mosques.sort((a, b) => a.lan.localeCompare(b.lan, "sv") || a.name.localeCompare(b.name, "sv"));

	await writeFile(jsonPath, `${JSON.stringify(mosques, null, "\t")}\n`);

	const withOpened = mosques.filter((m) => m.opened !== undefined).length;
	const withOrg = mosques.filter((m) => m.organisation !== undefined).length;
	const withAddr = mosques.filter((m) => m.address !== undefined).length;
	const lanCount = new Set(mosques.map((m) => m.lan)).size;
	const cityCount = new Set(mosques.map((m) => m.citySlug)).size;
	console.log(`Wrote ${mosques.length} mosques → ${jsonPath}`);
	console.log(
		`  ${lanCount} län · ${cityCount} orter · ${withAddr} with address · ${withOpened} with opened year · ` +
			`${withOrg} with organisation · ${derivedLan} kommun derived from coords · ${namedFromCity} named from city`,
	);
	console.log("\nCommit src/data/moskeer-sverige.json (the canonical source going forward).");
}

main().catch((err) => {
	console.error("build-moskeer failed:", err);
	process.exit(1);
});
