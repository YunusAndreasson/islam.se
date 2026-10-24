import { describe, expect, it } from "vitest";
import { byDistance, type LatLon, nearest } from "./geom";

const self = (p: LatLon) => p;

// Near Kiruna a degree of longitude is about 43 km and a degree of latitude 111 km. EAST
// is 0.8° away and NORTH 0.4°, so a flat lat/lon comparison picks NORTH; on the ground
// EAST is about 35 km off and NORTH about 44.
const here = { lat: 67.0, lon: 20.0 };
const east = { lat: 67.0, lon: 20.8 };
const north = { lat: 67.4, lon: 20.0 };

describe("nearest", () => {
	it("goes by distance on the ground, not by degrees", () => {
		expect(
			nearest([north, east], here, self),
			"a flat comparison picks the wrong town in the north",
		).toBe(east);
	});

	it("has no answer for an empty list", () => {
		expect(nearest([], here, self)).toBeUndefined();
	});

	it("reads each item's point through the accessor", () => {
		const mosques = [
			{ id: "n", lat: north.lat, lng: north.lon },
			{ id: "e", lat: east.lat, lng: east.lon },
		];
		expect(nearest(mosques, here, (m) => ({ lat: m.lat, lon: m.lng }))?.id).toBe("e");
	});
});

describe("byDistance", () => {
	it("orders nearest first, with the distance in km", () => {
		const far = { lat: 59.33, lon: 18.07 };
		const ranked = byDistance([far, north, east], here, self);
		expect(ranked.map((r) => r.item)).toEqual([east, north, far]);
		expect(ranked[0]?.km).toBeGreaterThan(30);
		expect(ranked[0]?.km).toBeLessThan(40);
	});
});
