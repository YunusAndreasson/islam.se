import { describe, expect, it } from "vitest";
import { INDEXED_PLACES, placeBySlug } from "./places-index";
import { slugify } from "./slug";

// /bonetider/[stad] carries ~86 % of the site's search clicks, and which place owns a
// contested slug is decided implicitly by population order. Nothing asserted it, so
// /bonetider/husby/ served Husby i Hedemora (250 inhabitants) to the ~1 200 monthly
// searches meaning Husby i Järva — at 0.7 % CTR against Rinkeby's 5.5 %, with prayer
// times ~8 minutes off. These tests pin the outcome, not the algorithm.
describe("contested bönetider slugs", () => {
	const owners: [slug: string, name: string, county: string][] = [
		["husby", "Husby", "Stockholm"],
		["husby-dalarna", "Husby", "Dalarna"],
		["solberga", "Solberga", "Stockholm"],
		["solberga-dalarna", "Solberga", "Dalarna"],
		["alby", "Alby", "Stockholm"],
		["alby-vasternorrland", "Alby", "Västernorrland"],
		["rinkeby", "Rinkeby", "Stockholm"],
		["kista", "Kista", "Stockholm"],
		["varberg", "Varberg", "Halland"],
	];

	it.each(owners)("/bonetider/%s/ is %s in %s", (slug, name, county) => {
		const place = placeBySlug(slug);
		expect(
			place,
			`no place owns the slug "${slug}" — a page that ranks today is gone`,
		).toBeDefined();
		expect({ name: place?.name, county: place?.county }).toEqual({ name, county });
	});

	it("gives the bare slug to the larger place, never the hamlet", () => {
		const byName = new Map<string, typeof INDEXED_PLACES>();
		for (const p of INDEXED_PLACES) {
			byName.set(p.name, [...(byName.get(p.name) ?? []), p] as typeof INDEXED_PLACES);
		}
		const stolen: string[] = [];
		for (const [name, places] of byName) {
			if (places.length < 2) continue;
			const bare = places.find((p) => p.slug === slugify(name));
			if (!bare) continue;
			const largest = places.reduce((a, b) => (b.population > a.population ? b : a));
			if (bare !== largest) {
				stolen.push(
					`"${slugify(name)}" went to ${name} (${bare.county}, ${bare.population}) instead of ${name} (${largest.county}, ${largest.population})`,
				);
			}
		}
		expect(stolen, `a smaller place holds a bare slug:\n${stolen.join("\n")}`).toEqual([]);
	});
});

describe("place index invariants", () => {
	it("has unique slugs — a duplicate silently drops a live page", () => {
		const seen = new Map<string, string>();
		const clashes: string[] = [];
		for (const p of INDEXED_PLACES) {
			const previous = seen.get(p.slug);
			if (previous) clashes.push(`${p.slug}: ${previous} vs ${p.name} (${p.county})`);
			seen.set(p.slug, `${p.name} (${p.county})`);
		}
		expect(clashes, `duplicate slugs:\n${clashes.join("\n")}`).toEqual([]);
	});

	it("keeps every coordinate inside Sweden", () => {
		const outside = INDEXED_PLACES.filter(
			(p) => p.lat < 55 || p.lat > 69.5 || p.lon < 10.5 || p.lon > 24.5,
		).map((p) => `${p.name} (${p.county}) @ ${p.lat},${p.lon}`);
		expect(outside, `prayer times would be wrong for:\n${outside.join("\n")}`).toEqual([]);
	});

	it("never claims an SCB figure for a hand-curated stadsdel", () => {
		// districts.ts records carry no SCB match; a scbPopulation would make the page
		// print "Orten har N invånare (SCB)" for a number SCB never published.
		const districts = [
			"husby",
			"tensta",
			"akalla",
			"skarholmen",
			"bredang",
			"ragsved",
			"hasselby-gard",
			"vallingby",
			"solberga",
			"norsborg",
		];
		for (const slug of districts) {
			const place = placeBySlug(slug);
			expect(place, `district "${slug}" is missing from the index`).toBeDefined();
			expect(
				place?.scbPopulation,
				`${slug} would cite SCB for an unofficial figure`,
			).toBeUndefined();
		}
	});
});
