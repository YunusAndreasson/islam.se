import { describe, expect, it } from "vitest";
import {
	DEFAULT_SCREEN_CONFIG,
	decodeClockOffset,
	decodeScreenConfig,
	encodeScreenConfig,
	IQAMA_KEYS,
	normalizeClockTime,
	pinnedDriftMinutes,
	resolveIqama,
	type ScreenConfig,
} from "./screen-config";
import { DEFAULT_SETTINGS } from "./settings";

const TZ = "Europe/Stockholm";

/** A config differing from the default in every field, so a round-trip that silently
 *  drops one is caught rather than passing because the default happened to match. */
function fullConfig(): ScreenConfig {
	return {
		ort: "goteborg",
		ortName: "Göteborg",
		name: "Bellevuemoskén",
		place: "Hisingen, Göteborg",
		lat: 57.7343,
		lon: 11.9821,
		iqama: {
			fajr: { offset: 30 },
			dhuhr: { offset: 20 },
			asr: { offset: 10 },
			maghrib: { offset: 3 },
			isha: { offset: 15, at: "21:00" },
		},
		jumua: "13:30",
		notice: "Koranskola lördag 10.00",
		quietMinutes: 12,
		settings: {
			...DEFAULT_SETTINGS,
			calculationMethod: "Turkey",
			madhab: "hanafi",
			highLatitudeRule: "middleOfTheNight",
			rounding: "up",
			hijriOffset: -1,
			adjustments: { fajr: 2, sunrise: 0, dhuhr: -1, asr: 3, maghrib: 0, isha: 4 },
		},
	};
}

describe("screen config hash", () => {
	it("round-trips every field a mosque can set", () => {
		const before = fullConfig();
		const after = decodeScreenConfig(encodeScreenConfig(before)).config;
		expect(after, "a field lost in the hash is a setting the mosque re-enters").toEqual(before);
	});

	it("keeps a default config down to the one thing that identifies it", () => {
		// The zero-config screen linked from a city page is just the ort. If this grows,
		// the QR code on the setup page grows with it.
		const hash = encodeScreenConfig({ ...DEFAULT_SCREEN_CONFIG, ort: "goteborg" });
		expect(hash).toBe("ort=goteborg");
	});

	it("stays inside the QR code the setup page hands the mosque", () => {
		// The setup page's whole output is a QR code pointed at a television. A version
		// 13 symbol at L correction holds 425 bytes in byte mode, which is the largest
		// that still scans reliably off a laptop screen from arm's length. Everything
		// beyond the mosque's own name and notice is ours to keep small.
		const url = `https://islam.se/bonetider/skarm/visa/#${encodeScreenConfig(fullConfig())}`;
		expect(url.length, `url was ${url.length} bytes: ${url}`).toBeLessThan(425);
	});

	it("leaves fragment-legal punctuation unescaped so the link stays readable", () => {
		const hash = encodeScreenConfig({ ...DEFAULT_SCREEN_CONFIG, ort: "x", jumua: "13:30" });
		expect(hash).toContain("jumua=13:30");
	});

	it("falls back to a working screen when the hash is mangled", () => {
		// A URL that survived a mail client's line-wrapping must still light the wall.
		const { config: c, issues } = decodeScreenConfig(
			"#ort=&iq=abc-@99:99-&lat=200&lon=hej&tyst=-5&metod=Pluto",
		);
		expect(c.ort).toBe(DEFAULT_SCREEN_CONFIG.ort);
		expect(c.lat).toBe(DEFAULT_SCREEN_CONFIG.lat);
		expect(c.lon).toBe(DEFAULT_SCREEN_CONFIG.lon);
		expect(c.quietMinutes).toBe(0);
		// The screen has to be able to say it fell back, or it shows Stockholm's
		// Maghrib in Kiruna and looks perfectly healthy doing it.
		expect(issues.map((i) => i.key)).toContain("lat/lon");
		expect(c.settings.calculationMethod).toBe(DEFAULT_SETTINGS.calculationMethod);
		for (const key of IQAMA_KEYS)
			expect(c.iqama[key], `${key} fell back`).toEqual(DEFAULT_SCREEN_CONFIG.iqama[key]);
	});

	it("refuses a coordinate no Swedish mosque could have", () => {
		// A mangled URL that lands the marker in the Atlantic must fall back loudly,
		// not quietly compute Reykjavík's times under a Swedish mosque's name.
		const { config, issues } = decodeScreenConfig("ort=goteborg&lat=64.1&lon=-21.9");
		expect(config.lat).toBe(DEFAULT_SCREEN_CONFIG.lat);
		expect(issues).toHaveLength(1);
	});

	it("refuses half a coordinate pair rather than pinning the marker to null island", () => {
		expect(decodeScreenConfig("ort=goteborg&lat=57.73").config.lat).toBe(DEFAULT_SCREEN_CONFIG.lat);
		expect(decodeScreenConfig("ort=goteborg&lon=11.98").config.lon).toBe(DEFAULT_SCREEN_CONFIG.lon);
	});

	it("reads the debug clock as an offset from the real now", () => {
		const realNow = Date.UTC(2026, 8, 12, 10, 0, 0);
		const offset = decodeClockOffset("#ort=x&nu=2026-09-12T12:00:00Z", realNow);
		expect(offset).toBe(2 * 60 * 60 * 1000);
		expect(decodeClockOffset("#ort=x", realNow)).toBe(0);
		expect(decodeClockOffset("#ort=x&nu=inte-en-tid", realNow)).toBe(0);
	});
});

describe("iqāma resolution", () => {
	// 2026-09-12 is a Saturday in CEST (UTC+2); 15:47 local is 13:47Z.
	const asr = new Date(Date.UTC(2026, 8, 12, 13, 47));

	it("adds the offset to the calculated time", () => {
		const iqama = resolveIqama({ offset: 18 }, asr, TZ);
		expect(iqama?.toISOString()).toBe("2026-09-12T14:05:00.000Z");
	});

	it("shows no iqāma for a prayer the mosque leaves at zero", () => {
		// Zero means "we hold no congregation for this one", not "at the adhān minute".
		expect(resolveIqama({ offset: 0 }, asr, TZ)).toBeNull();
	});

	it("pins to the local clock on the prayer's own Stockholm day", () => {
		const pinned = resolveIqama({ offset: 15, at: "16:30" }, asr, TZ);
		// 16:30 CEST is 14:30Z — not 16:30Z, which is the bug this test exists for.
		expect(pinned?.toISOString()).toBe("2026-09-12T14:30:00.000Z");
	});

	it("pins correctly on the winter side of the DST changeover", () => {
		// 2026-12-12, CET (UTC+1). The same "16:30" must now be 15:30Z.
		const winterAsr = new Date(Date.UTC(2026, 11, 12, 12, 0));
		const pinned = resolveIqama({ offset: 15, at: "16:30" }, winterAsr, TZ);
		expect(pinned?.toISOString()).toBe("2026-12-12T15:30:00.000Z");
	});

	it("survives a prayer that does not occur at this latitude", () => {
		// Kiruna under the midnight sun can yield Invalid Date; the row blanks.
		expect(resolveIqama({ offset: 15 }, new Date(Number.NaN), TZ)).toBeNull();
	});

	it("measures how far a pinned time has drifted from the sun", () => {
		// The builder warns on this; the screen never does.
		expect(pinnedDriftMinutes({ offset: 15, at: "16:30" }, asr, TZ)).toBe(43);
		expect(pinnedDriftMinutes({ offset: 15 }, asr, TZ)).toBeNull();
	});
});

describe("clock times", () => {
	it("pads so the screen's tabular figures line up", () => {
		expect(normalizeClockTime("9:05")).toBe("09:05");
		expect(normalizeClockTime(" 13:30 ")).toBe("13:30");
	});

	it("discards anything it cannot read rather than guessing", () => {
		for (const bad of ["", "25:00", "12:60", "12", "12:5", "middag"])
			expect(normalizeClockTime(bad), `${bad} should not parse`).toBe("");
	});
});
