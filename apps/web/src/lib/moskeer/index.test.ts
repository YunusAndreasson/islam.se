import { describe, expect, it } from "vitest";
import { placeBySlug } from "../bonetider/places-index";
import { haversineKm } from "../geom";
import { getMosques, mosquesByCity, siblingCityGroups } from "./index";

// Every mosque is filed under a bönetider place, and that slug is both its page URL and
// the anchor in its schema.org @id. The address matcher used to scan address components
// back-to-front, so "…, Husby, Järva stadsdelsområde, Stockholm" resolved to the postal
// town: 22 mosques sat 8–13 km from the city page claiming to list them.
describe("mosque → city assignment", () => {
	const mosques = getMosques();

	it("resolves every citySlug to a real bönetider place", () => {
		const orphans = mosques
			.filter((m) => placeBySlug(m.citySlug) === undefined)
			.map((m) => `${m.name} → "${m.citySlug}"`);
		expect(
			orphans,
			`citySlug must be a routable /bonetider slug — these break the page pairing and the City @id:\n${orphans.join("\n")}`,
		).toEqual([]);
	});

	it("keeps each mosque within 8 km of the town whose page lists it", () => {
		const far = mosques
			.map((m) => {
				const place = placeBySlug(m.citySlug);
				if (!place) return undefined;
				return { m, km: haversineKm(m.lat, m.lng, place.lat, place.lon) };
			})
			.filter((x): x is { m: (typeof mosques)[number]; km: number } => x !== undefined && x.km > 8)
			.map((x) => `${x.m.name} is ${x.km.toFixed(1)} km from ${x.m.city}`);
		expect(
			far,
			`a mosque this far from its city page is filed under the wrong town:\n${far.join("\n")}`,
		).toEqual([]);
	});

	it("files the Järva mosques under their own stadsdel, not Stockholm", () => {
		const expected: [name: string, citySlug: string][] = [
			["Husby Islamiska Kulturcenter", "husby"],
			["Tensta Moskén", "tensta"],
			["Akalla Moské", "akalla"],
			["Skärholmens moské", "skarholmen"],
			["Hammarkullens moské", "hammarkullen"],
			["Angered Islamiska Församling", "angered"],
		];
		for (const [name, citySlug] of expected) {
			const mosque = mosques.find((m) => m.name === name);
			expect(mosque, `"${name}" is gone from the dataset`).toBeDefined();
			expect(mosque?.citySlug, `"${name}" should be listed under /moskeer/${citySlug}/`).toBe(
				citySlug,
			);
		}
	});

	it("records a real kommun, never a stadsdel name", () => {
		// The kommun fallback used to be the city name, which wrote "Hammarkullen" and
		// "Lövgärdet" into a field the JSON-LD publishes as addressLocality.
		const districtNames = new Set(["Hammarkullen", "Lövgärdet", "Husby", "Tensta", "Akalla"]);
		const wrong = mosques
			.filter((m) => districtNames.has(m.kommun))
			.map((m) => `${m.name}: kommun "${m.kommun}"`);
		expect(wrong, `stadsdel used as kommun:\n${wrong.join("\n")}`).toEqual([]);
	});
});

describe("metro hand-off", () => {
	it("lets Stockholm's page still reach every mosque in the kommun", () => {
		const stockholm = mosquesByCity().find((g) => g.citySlug === "stockholm");
		expect(stockholm, "Stockholm has no mosque city page").toBeDefined();
		const siblings = siblingCityGroups("Stockholm", "stockholm");
		const own = stockholm?.mosques.length ?? 0;
		const reachable = own + siblings.reduce((n, g) => n + g.mosques.length, 0);
		const inKommun = getMosques().filter((m) => m.kommun === "Stockholm").length;
		expect(
			reachable,
			"the page answering 'moskéer i stockholm' must list or link every mosque in the kommun",
		).toBe(inKommun);
	});

	it("never lists a city as its own sibling", () => {
		for (const g of mosquesByCity()) {
			const siblings = siblingCityGroups(g.kommun, g.citySlug);
			expect(siblings.map((s) => s.citySlug)).not.toContain(g.citySlug);
		}
	});
});
