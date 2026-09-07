import { describe, expect, it } from "vitest";
import { createPlaceSearch, type PlaceSearchEntry } from "./place-search";

const entry = (name: string, county = "Skåne"): PlaceSearchEntry => ({
	name,
	county,
	href: `/bonetider/${name}-${county}/`,
});

describe("place search", () => {
	it("matches accents and ignores case and surrounding whitespace", () => {
		const malmo = entry("Malmö");
		const search = createPlaceSearch([malmo, entry("Göteborg", "Västra Götaland")]);
		expect(search("  MALMO ")).toEqual([malmo]);
		expect(search("goteborg")[0]?.name).toBe("Göteborg");
	});

	it("ranks exact names ahead of prefixes and substring matches without mutating the directory", () => {
		const entries = [entry("Bromölla"), entry("Malmön"), entry("Malmö")];
		const original = [...entries];
		const search = createPlaceSearch(entries);
		expect(search("malmo").map((p) => p.name)).toEqual(["Malmö", "Malmön"]);
		expect(entries).toEqual(original);
	});

	it("uses county qualifiers to distinguish places with the same name", () => {
		const skane = entry("Björkby");
		const other = entry("Björkby", "Stockholm");
		const search = createPlaceSearch([skane, other]);
		expect(search("bjorkby")).toHaveLength(2);
		expect(search("skane  bjorkby")).toEqual([skane]);
	});

	it("returns no results for blank or unmatched queries", () => {
		const search = createPlaceSearch([entry("Malmö")]);
		expect(search("   ")).toEqual([]);
		expect(search("xyzzy")).toEqual([]);
	});
});
