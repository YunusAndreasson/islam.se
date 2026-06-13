import { describe, expect, it } from "vitest";
import { placeFacts } from "./place-facts";

// Representative Swedish latitudes (lon is irrelevant to day length).
const MALMO = { lat: 55.60587, lon: 13.00073 };
const STOCKHOLM = { lat: 59.32938, lon: 18.06871 };
const KIRUNA = { lat: 67.85572, lon: 20.22513 };

describe("placeFacts", () => {
	it("summer days lengthen with latitude; winter days shorten", () => {
		const malmo = placeFacts(MALMO.lat, MALMO.lon);
		const sthlm = placeFacts(STOCKHOLM.lat, STOCKHOLM.lon);
		// Further north → more summer daylight, less winter daylight.
		expect(sthlm.summerDayHours).toBeGreaterThan(malmo.summerDayHours);
		expect(sthlm.winterDayHours).toBeLessThan(malmo.winterDayHours);
		// Sanity: a Malmö midsummer day is long but not endless.
		expect(malmo.summerDayHours).toBeGreaterThan(16);
		expect(malmo.summerDayHours).toBeLessThan(18);
	});

	it("flags midnight sun and polar night north of the Arctic Circle", () => {
		const kiruna = placeFacts(KIRUNA.lat, KIRUNA.lon);
		expect(kiruna.midnightSun).toBe(true);
		expect(kiruna.polarNight).toBe(true);
		expect(kiruna.summerDayText).toBe("Midnattssol");
		expect(kiruna.winterDayText).toBe("Polarnatt");
		// Under midnight sun the sun never dips below the horizon → no depression.
		expect(kiruna.summerMidnightDepressionDeg).toBe(0);
		expect(kiruna.summerDayHours).toBeCloseTo(24, 1);
		expect(kiruna.winterDayHours).toBeCloseTo(0, 1);
	});

	it("matches the analytic solstice depression (90 − lat − 23.44°)", () => {
		// At the summer-solstice solar midnight the sun sits at lat + decl − 90, so the
		// depression is 90 − lat − 23.44. This is the number the prayer-schedule prose
		// leans on, so pin it independently of the sampling loop.
		const malmo = placeFacts(MALMO.lat, MALMO.lon);
		const analytic = 90 - MALMO.lat - 23.44;
		expect(malmo.summerMidnightDepressionDeg).toBeCloseTo(analytic, 0);
		// Crucially: nowhere in Sweden reaches true (astronomical, 18°) night at the
		// solstice — which is the whole reason the high-latitude rule exists here.
		expect(malmo.summerMidnightDepressionDeg).toBeLessThan(18);
	});
});
