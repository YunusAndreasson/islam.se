// Data layer for the /moskeer feature. The committed JSON (src/data/moskeer-sverige.json,
// produced by scripts/build-moskeer.ts) is the source of truth; everything here is pure
// and build-time, mirroring the shape of src/lib/bonetider/places-index.ts.

import mosquesRaw from "../../data/moskeer-sverige.json";
import { slugify } from "../bonetider/slug";
import { SITE_URL } from "../config";
import { talord } from "../format";
import { byDistance } from "../geom";

export interface Mosque {
	readonly id: string;
	readonly name: string;
	readonly lat: number;
	readonly lng: number;
	readonly city: string;
	/** Bönetider place slug for this city — the /moskeer/[stad] and /bonetider/[stad] segment. */
	readonly citySlug: string;
	readonly kommun: string;
	/** Län, short form matching places.ts `county` (e.g. "Stockholm"). Use lanDisplay() for UI. */
	readonly lan: string;
	readonly opened?: number;
	readonly organisation?: string;
	/** Cleaned street/area line, e.g. "Rosentorpsvägen, Lunnahus, Bjuv" (admin tail stripped). */
	readonly address?: string;
	/** Swedish postal code, e.g. "267 39". */
	readonly postalCode?: string;
}

const MOSQUES = mosquesRaw as unknown as readonly Mosque[];

export function getMosques(): readonly Mosque[] {
	return MOSQUES;
}

// Short county form (from the GeoNames spine) → the proper Swedish län name. Keeping
// this explicit avoids brittle genitive-suffix guessing ("Skåne län", not "Skånes län").
const LAN_DISPLAY: Record<string, string> = {
	Stockholm: "Stockholms län",
	Uppsala: "Uppsala län",
	Södermanland: "Södermanlands län",
	Östergötland: "Östergötlands län",
	Jönköping: "Jönköpings län",
	Kronoberg: "Kronobergs län",
	Kalmar: "Kalmar län",
	Gotland: "Gotlands län",
	Blekinge: "Blekinge län",
	Skåne: "Skåne län",
	Halland: "Hallands län",
	"Västra Götaland": "Västra Götalands län",
	Värmland: "Värmlands län",
	Örebro: "Örebro län",
	Västmanland: "Västmanlands län",
	Dalarna: "Dalarnas län",
	Gävleborg: "Gävleborgs län",
	Västernorrland: "Västernorrlands län",
	Jämtland: "Jämtlands län",
	Västerbotten: "Västerbottens län",
	Norrbotten: "Norrbottens län",
};

export function lanDisplay(county: string): string {
	return LAN_DISPLAY[county] ?? `${county} län`;
}

/** Where the mosque is, for the card/callout: "Botkyrka · Stockholms län". */
export function locationLabel(m: Pick<Mosque, "kommun" | "lan">): string {
	return `${m.kommun} · ${lanDisplay(m.lan)}`;
}

export interface LanGroup {
	lan: string;
	lanLabel: string;
	mosques: Mosque[];
}

/** Mosques grouped by län for the browse-by-region list — län alphabetical (Swedish),
 *  mosques by name. Mirrors placesByCounty() in the Bönetider index. */
export function mosquesByLan(): LanGroup[] {
	return [...Map.groupBy(MOSQUES, (m) => m.lan).entries()]
		.map(([lan, mosques]) => ({
			lan,
			lanLabel: lanDisplay(lan),
			mosques: mosques.slice().sort((a, b) => a.name.localeCompare(b.name, "sv")),
		}))
		.sort((a, b) => a.lanLabel.localeCompare(b.lanLabel, "sv"));
}

/** URL segment for a county page, e.g. "Västra Götaland" → "vastra-gotaland". County
 *  pages live under /moskeer/lan/ to avoid colliding with city slugs (stockholm,
 *  uppsala, kalmar and orebro are each both a city and a county short-name). */
export function lanSlug(lan: string): string {
	return slugify(lan);
}

export interface MosqueCityGroup {
	citySlug: string;
	city: string;
	kommun: string;
	lan: string;
	lanLabel: string;
	mosques: Mosque[];
}

/** Mosques grouped by their (bönetider) city slug, cities alphabetical, mosques by name.
 *  The slug is the /moskeer/[stad] route segment and pairs 1:1 with /bonetider/[stad]. */
export function mosquesByCity(): MosqueCityGroup[] {
	return [...Map.groupBy(MOSQUES, (m) => m.citySlug).values()]
		.map((mosques) => {
			const first = mosques[0];
			if (!first) throw new Error("Map.groupBy produced an empty mosque group");
			return {
				citySlug: first.citySlug,
				city: first.city,
				kommun: first.kommun,
				lan: first.lan,
				lanLabel: lanDisplay(first.lan),
				mosques: mosques.slice().sort((a, b) => a.name.localeCompare(b.name, "sv")),
			};
		})
		.sort((a, b) => a.city.localeCompare(b.city, "sv"));
}

const BY_CITY_SLUG = new Map<string, MosqueCityGroup>(mosquesByCity().map((g) => [g.citySlug, g]));

export function cityBySlug(slug: string): MosqueCityGroup | undefined {
	return BY_CITY_SLUG.get(slug);
}

/** Mosques near a point (for the Bönetider city pages), nearest first. Distance-based so
 *  it doesn't depend on kommun-name matching: a city "has a mosque" if one sits within
 *  `maxKm`. */
export function nearestMosques(lat: number, lng: number, count = 3, maxKm = 20): Mosque[] {
	return byDistance(MOSQUES, { lat, lon: lng }, (m) => ({ lat: m.lat, lon: m.lng }))
		.filter((x) => x.km <= maxKm)
		.slice(0, count)
		.map((x) => x.item);
}

function mosquesInKommun(kommun?: string): Mosque[] {
	if (!kommun) return [];
	return MOSQUES.filter((m) => m.kommun === kommun);
}

/** Earliest-founded mosque in a set, or undefined if none carry an `opened` year. */
export function oldestMosque(mosques: readonly Mosque[]): Mosque | undefined {
	const years = mosques.map((m) => m.opened).filter((y) => y !== undefined);
	if (years.length === 0) return undefined;
	const earliest = Math.min(...years);
	return mosques.find((m) => m.opened === earliest);
}

/** "1 moské" / "12 moskéer", optionally "1 registrerad moské" / "12 registrerade moskéer".
 *  `ord` for running text: »fyra registrerade moskéer« (see `talord`); titles, meta
 *  lines and descriptions keep the digit. */
export function pluralMoske(n: number, registered = false, ord = false): string {
	const adj = registered ? (n === 1 ? "registrerad " : "registrerade ") : "";
	const noun = n === 1 ? "moské" : "moskéer";
	return `${ord ? talord(n) : n} ${adj}${noun}`;
}

/** "1 ort" / "12 orter"; `ord` as for `pluralMoske`. */
export function pluralOrt(n: number, ord = false): string {
	return `${ord ? talord(n) : n} ${n === 1 ? "ort" : "orter"}`;
}

/** The OTHER city pages in the same kommun — the stadsdelar a metro page hands off to.
 *  Stockholm's own page keeps 4 mosques once Järva, Skärholmen and Vällingby have their
 *  own; without this the page that answers "moskéer i stockholm" would list a fifth of
 *  the kommun's mosques. Cities alphabetical, mosques by name. */
export function siblingCityGroups(kommun: string, citySlug: string): MosqueCityGroup[] {
	const slugs = new Set(
		mosquesInKommun(kommun)
			.filter((m) => m.citySlug !== citySlug)
			.map((m) => m.citySlug),
	);
	return [...slugs]
		.map((slug) => cityBySlug(slug))
		.filter((g): g is MosqueCityGroup => g !== undefined)
		.sort((a, b) => a.city.localeCompare(b.city, "sv"));
}

export interface DirectionsLinks {
	google: string;
	apple: string;
	geo: string;
}

/** Deep links that open the NATIVE Maps app for turn-by-turn on mobile (and the web map
 *  on desktop). Google's `dir/?api=1` and Apple's `maps.apple.com` both hand off to the
 *  installed app; `geo:` is the Android fallback. */
export function directionsLinks(m: Pick<Mosque, "lat" | "lng" | "name">): DirectionsLinks {
	const dest = `${m.lat},${m.lng}`;
	const q = encodeURIComponent(m.name);
	return {
		google: `https://www.google.com/maps/dir/?api=1&destination=${dest}`,
		apple: `https://maps.apple.com/?daddr=${dest}&q=${q}`,
		geo: `geo:${dest}?q=${dest}(${q})`,
	};
}

/** The address split the Swedish way. The scraped `address` is OpenStreetMap's reverse
 *  geocode, most specific first and number before street: »34, Apelbergsgatan, Norrmalm,
 *  Norra innerstadens stadsdelsområde, Stockholm« — printed as it stood on every mosque
 *  row. A Swedish address is »Apelbergsgatan 34, 111 38 Stockholm« (PostNord's order). A
 *  leading place name (the mosque's own, from the geocoder) is dropped; the postort is the
 *  last part that is not an administrative district. The data stays as scraped. */
function addressParts(
	m: Pick<Mosque, "address" | "city">,
): { street: string; postort: string } | null {
	if (!m.address) return null;
	const parts = m.address
		.split(",")
		.map((p) => p.trim())
		.filter(Boolean);
	if (parts.length === 1) return { street: parts[0] as string, postort: "" };
	const isNumber = (p: string | undefined) => p !== undefined && /^\d+\s?[A-Za-z]?$/.test(p);
	let at = !isNumber(parts[0]) && isNumber(parts[1]) && parts.length > 2 ? 1 : 0;
	// A run of numbers is one building the geocoder matched on every entrance
	// (»1, 3, 5, … 23, Sikvägen«): no single number is the address, so none is shown.
	const numbers: string[] = [];
	while (isNumber(parts[at])) numbers.push(parts[at++] as string);
	const street = parts[at] as string;
	const rest = parts.slice(at + 1).filter((p) => !/(distrikt|stadsdelsområde|kommun)$/i.test(p));
	const nr = numbers.length === 1 ? numbers[0] : null;
	return { street: nr ? `${street} ${nr}` : street, postort: rest.at(-1) ?? m.city };
}

/** »Apelbergsgatan 34« — the street line alone (schema.org streetAddress). */
function streetLine(m: Pick<Mosque, "address" | "city">): string | null {
	return addressParts(m)?.street ?? null;
}

/** »Apelbergsgatan 34, 111 38 Stockholm«, for display. An address that was already one
 *  free-text line (»Vintergatan 1E 66132 Säffle«) is shown as it stands. */
export function swedishAddress(m: Pick<Mosque, "address" | "city" | "postalCode">): string | null {
	const a = addressParts(m);
	if (!a) return null;
	if (!a.postort) return m.postalCode ? `${a.street}, ${m.postalCode}` : a.street;
	return `${a.street}, ${m.postalCode ? `${m.postalCode} ` : ""}${a.postort}`;
}

const SITE = SITE_URL;

/** Canonical /moskeer/[stad] anchor for a mosque — its stable schema @id and the deep
 *  link both the hub map and the bönetider pages point at. */
export function mosqueUrl(m: Mosque): string {
	return `${SITE}/moskeer/${m.citySlug}/#${m.id}`;
}

/** A schema.org Mosque node (already a PlaceOfWorship → CivicStructure → Place subtype).
 *  The stable @id (anchored on the city page) lets the city-page and county-page
 *  emissions of the same mosque merge into one entity rather than competing nodes. */
function mosqueSchema(m: Mosque): Record<string, unknown> {
	const url = mosqueUrl(m);
	return {
		"@type": "Mosque",
		"@id": url,
		name: m.name,
		url,
		address: {
			"@type": "PostalAddress",
			...(m.address ? { streetAddress: streetLine(m) } : {}),
			addressLocality: m.kommun,
			addressRegion: lanDisplay(m.lan),
			...(m.postalCode ? { postalCode: m.postalCode } : {}),
			addressCountry: "SE",
		},
		geo: { "@type": "GeoCoordinates", latitude: m.lat, longitude: m.lng },
		containedInPlace: { "@type": "AdministrativeArea", name: lanDisplay(m.lan) },
		hasMap: directionsLinks(m).google,
		...(m.opened ? { foundingDate: String(m.opened) } : {}),
		...(m.organisation ? { funder: { "@type": "Organization", name: m.organisation } } : {}),
	};
}

/** ItemList of full Mosque nodes for a county/city page's mosque set. */
export function mosqueItemList(mosques: readonly Mosque[], name: string): Record<string, unknown> {
	return {
		"@context": "https://schema.org",
		"@type": "ItemList",
		name,
		numberOfItems: mosques.length,
		itemListElement: mosques.map((m, i) => ({
			"@type": "ListItem",
			position: i + 1,
			item: mosqueSchema(m),
		})),
	};
}
