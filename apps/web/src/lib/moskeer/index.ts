// Data layer for the /moskeer feature. The committed JSON (src/data/moskeer-sverige.json,
// produced by scripts/build-moskeer.ts) is the source of truth; everything here is pure
// and build-time, mirroring the shape of src/lib/bonetider/places-index.ts.

import mosquesRaw from "../../data/moskeer-sverige.json";
import { slugify } from "../bonetider/slug";
import { SITE_URL } from "../config";
import { haversineKm } from "../geom";

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
export function locationLabel(m: Mosque): string {
	return `${m.kommun} · ${lanDisplay(m.lan)}`;
}

/** Mosques grouped by län for the browse-by-region list — län alphabetical (Swedish),
 *  mosques by name. Mirrors placesByCounty() in the Bönetider index. */
export function mosquesByLan(): { lan: string; lanLabel: string; mosques: Mosque[] }[] {
	const groups = new Map<string, Mosque[]>();
	for (const m of MOSQUES) {
		const arr = groups.get(m.lan);
		if (arr) arr.push(m);
		else groups.set(m.lan, [m]);
	}
	return [...groups.entries()]
		.map(([lan, mosques]) => ({
			lan,
			lanLabel: lanDisplay(lan),
			mosques: mosques.slice().sort((a, b) => a.name.localeCompare(b.name, "sv")),
		}))
		.sort((a, b) => a.lanLabel.localeCompare(b.lanLabel, "sv"));
}

export interface LanGroup {
	lan: string;
	lanLabel: string;
	mosques: Mosque[];
}

/** URL segment for a county page, e.g. "Västra Götaland" → "vastra-gotaland". County
 *  pages live under /moskeer/lan/ to avoid colliding with city slugs (stockholm,
 *  uppsala, kalmar and orebro are each both a city and a county short-name). */
export function lanSlug(lan: string): string {
	return slugify(lan);
}

const BY_LAN_SLUG = new Map<string, LanGroup>(mosquesByLan().map((g) => [lanSlug(g.lan), g]));

export function lanBySlug(slug: string): LanGroup | undefined {
	return BY_LAN_SLUG.get(slug);
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
	const groups = new Map<string, Mosque[]>();
	for (const m of MOSQUES) {
		const arr = groups.get(m.citySlug);
		if (arr) arr.push(m);
		else groups.set(m.citySlug, [m]);
	}
	return [...groups.values()]
		.map((mosques) => {
			const first = mosques[0];
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

export interface MosqueFeatureCollection {
	type: "FeatureCollection";
	features: {
		type: "Feature";
		geometry: { type: "Point"; coordinates: [number, number] };
		properties: { id: string; name: string };
	}[];
}

/** GeoJSON for the MapLibre clustered source. Heavy per-mosque detail stays in the
 *  inlined client payload (looked up by id on click), so the source stays lean. */
export function toFeatureCollection(mosques: readonly Mosque[] = MOSQUES): MosqueFeatureCollection {
	return {
		type: "FeatureCollection",
		features: mosques.map((m) => ({
			type: "Feature",
			geometry: { type: "Point", coordinates: [m.lng, m.lat] },
			properties: { id: m.id, name: m.name },
		})),
	};
}

/** Mosques near a point (for the Bönetider city pages), nearest first. Distance-based so
 *  it doesn't depend on kommun-name matching: a city "has a mosque" if one sits within
 *  `maxKm`. */
export function nearestMosques(lat: number, lng: number, count = 3, maxKm = 20): Mosque[] {
	return MOSQUES.map((m) => ({ m, d: haversineKm(lat, lng, m.lat, m.lng) }))
		.filter((x) => x.d <= maxKm)
		.sort((a, b) => a.d - b.d)
		.slice(0, count)
		.map((x) => x.m);
}

export function mosquesInKommun(kommun?: string): Mosque[] {
	if (!kommun) return [];
	return MOSQUES.filter((m) => m.kommun === kommun);
}

export interface DirectionsLinks {
	google: string;
	apple: string;
	geo: string;
}

/** Deep links that open the NATIVE Maps app for turn-by-turn on mobile (and the web map
 *  on desktop). Google's `dir/?api=1` and Apple's `maps.apple.com` both hand off to the
 *  installed app; `geo:` is the Android fallback. */
export function directionsLinks(m: Mosque): DirectionsLinks {
	const dest = `${m.lat},${m.lng}`;
	const q = encodeURIComponent(m.name);
	return {
		google: `https://www.google.com/maps/dir/?api=1&destination=${dest}`,
		apple: `https://maps.apple.com/?daddr=${dest}&q=${q}`,
		geo: `geo:${dest}?q=${dest}(${q})`,
	};
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
export function mosqueSchema(m: Mosque): Record<string, unknown> {
	const url = mosqueUrl(m);
	return {
		"@type": "Mosque",
		"@id": url,
		name: m.name,
		url,
		address: {
			"@type": "PostalAddress",
			...(m.address ? { streetAddress: m.address } : {}),
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
