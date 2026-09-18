import { describe, expect, it } from "vitest";
import { asrShadow, SHADOW_LENGTH } from "./asr-shadow";
import { computePrayerTimes, dateForStockholmDay } from "./prayer-times";
import { DEFAULT_SETTINGS } from "./settings";
import { altAt, minuteOnCurve, sunDayCurve } from "./sun-day-curve";

const MALMO = { name: "Malmö", latitude: 55.60587, longitude: 13.00073 };
const STOCKHOLM = { name: "Stockholm", latitude: 59.32938, longitude: 18.06871 };

// Vernal equinox — the date the /bonetider/metod/ figure is drawn for.
const EQUINOX = dateForStockholmDay(2025, 2, 20);
const MIDSUMMER = dateForStockholmDay(2025, 5, 21);

describe("asrShadow", () => {
	it("stacks the two madhhabs one object-length apart on top of the noon shadow", () => {
		const s = asrShadow(STOCKHOLM.latitude, EQUINOX);
		// The rule is "noon shadow PLUS one (or two) object lengths" — never the bare
		// ratio. At Swedish latitudes the noon shadow alone is already longer than the
		// object, which is exactly why the drawing has to show it.
		expect(s.shafiRatio - s.noonRatio).toBeCloseTo(SHADOW_LENGTH.shafi, 10);
		expect(s.hanafiRatio - s.shafiRatio).toBeCloseTo(1, 10);
		expect(s.noonRatio).toBeGreaterThan(1);
	});

	it("puts the sun lower the longer the shadow", () => {
		const s = asrShadow(STOCKHOLM.latitude, EQUINOX);
		expect(s.noonAltDeg).toBeGreaterThan(s.shafiAltDeg);
		expect(s.shafiAltDeg).toBeGreaterThan(s.hanafiAltDeg);
		expect(s.hanafiAltDeg).toBeGreaterThan(0); // ʿAṣr is before sunset, always
	});

	it("casts longer noon shadows further north", () => {
		// Same date, higher latitude → sun lower at noon → longer shadow → later ʿAṣr.
		expect(asrShadow(STOCKHOLM.latitude, EQUINOX).noonRatio).toBeGreaterThan(
			asrShadow(MALMO.latitude, EQUINOX).noonRatio,
		);
	});

	it("matches the equinox noon shadow tan(latitude) analytically", () => {
		// Declination is ~0 at the equinox, so the noon zenith angle collapses to the
		// latitude itself. Pins the geometry against a closed form, not against a
		// restatement of the code.
		const s = asrShadow(STOCKHOLM.latitude, EQUINOX);
		expect(s.noonRatio).toBeCloseTo(Math.tan((STOCKHOLM.latitude * Math.PI) / 180), 1);
	});

	// The contract the /bonetider/metod/ figure depends on: the shadow marks it draws
	// and the clock times it prints beside them must describe the same instant. The
	// drawing comes from this module, the times from adhan via computePrayerTimes.
	// If the two ever drift, the figure starts lying — and nothing else would catch it.
	it.each([
		{ madhab: "shafi" as const, alt: "shafiAltDeg" as const },
		{ madhab: "hanafi" as const, alt: "hanafiAltDeg" as const },
	])("agrees with the published $madhab ʿAṣr time", ({ madhab, alt }) => {
		for (const date of [EQUINOX, MIDSUMMER]) {
			const times = computePrayerTimes(STOCKHOLM, date, { ...DEFAULT_SETTINGS, madhab });
			const curve = sunDayCurve(STOCKHOLM.latitude, STOCKHOLM.longitude, date);
			const altAtPublishedAsr = altAt(curve, minuteOnCurve(curve, times.asr));
			// Within a degree: adhan rounds ʿAṣr to the minute and the sun moves a few
			// tenths of a degree per minute, so exact equality is not on offer.
			expect(altAtPublishedAsr).toBeCloseTo(asrShadow(STOCKHOLM.latitude, date)[alt], 0);
		}
	});
});
