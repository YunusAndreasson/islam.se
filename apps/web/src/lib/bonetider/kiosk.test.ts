import { describe, expect, it } from "vitest";
import {
	driftMessage,
	driftVerdict,
	groundFor,
	inQuietWindow,
	isReloadSafe,
	nightlyReloadMinute,
	pixelShiftAt,
	type ReloadContext,
} from "./kiosk";

const MIN = 60_000;

describe("the ground follows the sun over the mosque", () => {
	const sunrise = new Date(Date.UTC(2026, 8, 12, 3, 58));
	const maghrib = new Date(Date.UTC(2026, 8, 12, 17, 12));

	it("is parchment between sunrise and sunset, near-black outside it", () => {
		expect(groundFor(new Date(Date.UTC(2026, 8, 12, 10, 0)), sunrise, maghrib, true)).toBe("day");
		expect(groundFor(new Date(Date.UTC(2026, 8, 12, 20, 0)), sunrise, maghrib, false)).toBe(
			"night",
		);
		expect(groundFor(new Date(Date.UTC(2026, 8, 12, 2, 0)), sunrise, maghrib, false)).toBe("night");
	});

	it("turns at the moment the sun actually sets, not on a clock hour", () => {
		expect(groundFor(new Date(maghrib.getTime() - 1), sunrise, maghrib, true)).toBe("day");
		expect(groundFor(maghrib, sunrise, maghrib, false)).toBe("night");
	});

	it("falls back to the sun's altitude under the midnight sun and the polar night", () => {
		// Kiruna in June has no sunset and in December no sunrise, so adhan hands back
		// Invalid Date and a naive comparison would silently pick "night" all summer.
		const none = new Date(Number.NaN);
		expect(groundFor(new Date(Date.UTC(2026, 5, 21, 23, 0)), none, none, true)).toBe("day");
		expect(groundFor(new Date(Date.UTC(2026, 11, 21, 12, 0)), none, none, false)).toBe("night");
	});
});

describe("the quiet state", () => {
	const iqama = Date.UTC(2026, 8, 12, 14, 5);

	it("holds from the iqāma until the window closes", () => {
		expect(inQuietWindow(iqama - 1, iqama, 10)).toBe(false);
		expect(inQuietWindow(iqama, iqama, 10)).toBe(true);
		expect(inQuietWindow(iqama + 9 * MIN, iqama, 10)).toBe(true);
		expect(inQuietWindow(iqama + 10 * MIN, iqama, 10)).toBe(false);
	});

	it("never fires for a prayer the mosque holds no congregation for", () => {
		expect(inQuietWindow(iqama, null, 10)).toBe(false);
	});

	it("can be switched off entirely", () => {
		expect(inQuietWindow(iqama, iqama, 0)).toBe(false);
	});
});

describe("the reload guard", () => {
	const now = Date.UTC(2026, 8, 13, 1, 20);
	const base: ReloadContext = {
		prayerTimesMs: [Date.UTC(2026, 8, 13, 2, 10)],
		guardBeforeMs: 20 * MIN,
		guardAfterMs: 10 * MIN,
		cameraMoving: false,
		uptimeMs: 5 * 60 * MIN,
		minUptimeMs: 30 * MIN,
		lastReloadMs: null,
		minSinceLastReloadMs: 30 * MIN,
	};

	it("allows a reload in the small hours, far from any prayer", () => {
		expect(isReloadSafe(now, base)).toBe(true);
	});

	it("refuses near a prayer, on either side of it", () => {
		const fajr = Date.UTC(2026, 8, 13, 2, 10);
		expect(isReloadSafe(fajr - 19 * MIN, base)).toBe(false);
		expect(isReloadSafe(fajr + 9 * MIN, base)).toBe(false);
		expect(isReloadSafe(fajr - 21 * MIN, base)).toBe(true);
	});

	it("refuses mid-move, so the wall never blanks in the middle of a camera move", () => {
		expect(isReloadSafe(now, { ...base, cameraMoving: true })).toBe(false);
	});

	it("refuses twice in a row — the guard that stops a boot loop", () => {
		// Without this, one wrong clock or one bad deploy reloads the wall every minute
		// forever, and a congregation watches a page load animation instead of times.
		expect(isReloadSafe(now, { ...base, lastReloadMs: now - 5 * MIN })).toBe(false);
		expect(isReloadSafe(now, { ...base, lastReloadMs: now - 31 * MIN })).toBe(true);
	});

	it("refuses before the screen has been up long enough to be worth recycling", () => {
		expect(isReloadSafe(now, { ...base, uptimeMs: 2 * MIN })).toBe(false);
	});

	it("ignores prayers that do not occur at this latitude", () => {
		// A Kiruna summer hands back NaN for Fajr and ʿIshāʾ; NaN comparisons are all
		// false, so an unguarded loop would silently treat them as safe — which they are,
		// but only by accident. Pinned so a refactor cannot turn it into "never safe".
		expect(isReloadSafe(now, { ...base, prayerTimesMs: [Number.NaN, Number.NaN] })).toBe(true);
	});
});

describe("the nightly reload slot", () => {
	it("lands inside the small-hours window", () => {
		for (const seed of ["ort=goteborg", "ort=malmo&namn=X", "", "ort=kiruna"]) {
			const m = nightlyReloadMinute(seed);
			expect(m, seed).toBeGreaterThanOrEqual(190); // 03:10
			expect(m, seed).toBeLessThan(230); // 03:50
		}
	});

	it("is stable for one screen and spread across many", () => {
		// A hundred mosque screens pointed at the same deploy must not all hit the origin
		// in the same second.
		expect(nightlyReloadMinute("ort=goteborg")).toBe(nightlyReloadMinute("ort=goteborg"));
		const spread = new Set(
			Array.from({ length: 60 }, (_, i) => nightlyReloadMinute(`ort=plats-${i}`)),
		);
		expect(spread.size).toBeGreaterThan(10);
	});
});

describe("burn-in shift", () => {
	it("stays within amplitude and always lands on whole pixels", () => {
		// A fractional translate resamples every glyph on the wall and the type goes soft.
		for (let k = 0; k < 40; k++) {
			const { x, y } = pixelShiftAt(k * 60_000, 6);
			expect(Number.isInteger(x) && Number.isInteger(y), `step ${k}`).toBe(true);
			expect(Math.hypot(x, y)).toBeLessThanOrEqual(6.5);
		}
	});

	it("returns to where it started, so nothing drifts over a month", () => {
		expect(pixelShiftAt(0)).toEqual(pixelShiftAt(8 * 60_000));
		expect(pixelShiftAt(3 * 60_000)).toEqual(pixelShiftAt(11 * 60_000));
	});

	it("actually moves", () => {
		const seen = new Set(
			Array.from({ length: 8 }, (_, k) => JSON.stringify(pixelShiftAt(k * 60_000))),
		);
		expect(seen.size).toBeGreaterThan(3);
	});
});

describe("clock drift", () => {
	it("ignores the noise in a one-second Date header", () => {
		expect(driftVerdict(20_000)).toBe("ok");
		expect(driftMessage(20_000)).toBe("");
	});

	it("corrects a drifting clock rather than displaying the wrong Maghrib", () => {
		expect(driftVerdict(5 * MIN)).toBe("corrected");
		expect(driftMessage(5 * MIN)).toContain("korrigerade");
		expect(driftVerdict(-5 * MIN)).toBe("corrected");
	});

	it("asks for help when the clock is far enough out to be a broken NTP", () => {
		expect(driftVerdict(3 * 60 * MIN)).toBe("broken");
		expect(driftMessage(3 * 60 * MIN)).toContain("Ställ om klockan");
	});
});
