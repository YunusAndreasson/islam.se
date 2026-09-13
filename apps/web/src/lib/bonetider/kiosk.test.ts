import { describe, expect, it } from "vitest";
import {
	clockStepMs,
	driftMessage,
	driftVerdict,
	heroAt,
	inQuietWindow,
	isReloadSafe,
	nextSkewProbeMs,
	nightlyReloadMinute,
	pixelShiftAt,
	type ReloadContext,
	skewAfterStep,
} from "./kiosk";

const MIN = 60_000;

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

describe("the large row", () => {
	// Göteborg, 12 September 2026, in UTC: Ẓuhr 11:09 and ʿAṣr 14:34, iqāma 15 minutes after.
	const order = ["dhuhr", "asr"] as const;
	const adhan = { dhuhr: Date.UTC(2026, 8, 12, 11, 9), asr: Date.UTC(2026, 8, 12, 14, 34) };
	const withIqama = { dhuhr: adhan.dhuhr + 15 * MIN, asr: adhan.asr + 15 * MIN };
	const hero = (
		now: number,
		iqama: Record<"dhuhr" | "asr", number | null> = withIqama,
		quiet = 10,
	) =>
		heroAt(
			now,
			order,
			(k) => adhan[k],
			(k) => iqama[k],
			quiet,
		);

	it("belongs to the next adhān while that adhān is still ahead", () => {
		expect(hero(adhan.dhuhr - 30 * MIN)).toEqual({
			key: "dhuhr",
			phase: "adhan",
			targetMs: adhan.dhuhr,
		});
	});

	it("stays with a prayer between its adhān and its iqāma", () => {
		// The bug this replaces: six minutes after Ẓuhr's adhān the large row had already
		// moved on to »ʿAṣr, om 3 tim 19 min«, while the foyer waited for Ẓuhr's iqāma.
		expect(hero(adhan.dhuhr + 6 * MIN)).toEqual({
			key: "dhuhr",
			phase: "iqama",
			targetMs: withIqama.dhuhr,
		});
	});

	it("holds through the congregation and hands on when the window closes", () => {
		expect(hero(withIqama.dhuhr + 4 * MIN)?.phase).toBe("praying");
		expect(hero(withIqama.dhuhr + 10 * MIN)).toEqual({
			key: "asr",
			phase: "adhan",
			targetMs: adhan.asr,
		});
	});

	it("moves straight on after the adhān when the mosque holds no congregation", () => {
		expect(hero(adhan.dhuhr + 1, { dhuhr: null, asr: null })?.key).toBe("asr");
	});

	it("is null once the day is spent, so the wall can show tomorrow's Fajr", () => {
		expect(hero(withIqama.asr + 10 * MIN)).toBeNull();
	});

	it("never runs backwards through the day and never counts towards the past", () => {
		let lastIndex = 0;
		for (let t = adhan.dhuhr - 60 * MIN; t < adhan.asr + 60 * MIN; t += 30_000) {
			const h = hero(t);
			const index = h ? order.indexOf(h.key) : order.length;
			expect(
				index,
				`the row stepped back to an earlier prayer at ${new Date(t).toISOString()}`,
			).toBeGreaterThanOrEqual(lastIndex);
			lastIndex = index;
			if (h)
				expect(h.targetMs, "a countdown aimed at a moment already gone").toBeGreaterThanOrEqual(t);
		}
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
		expect(driftMessage(5 * MIN)).toContain("Tiderna visas ändå rätt");
		expect(driftVerdict(-5 * MIN)).toBe("corrected");
	});

	it("asks for help when the clock is far enough out to be a broken NTP", () => {
		expect(driftVerdict(3 * 60 * MIN)).toBe("broken");
		expect(driftMessage(3 * 60 * MIN)).toContain("Ställ klockan rätt");
	});
});

describe("clock steps", () => {
	it("sees the clock being set, either way, and nothing else", () => {
		expect(clockStepMs(1000 + 10 * MIN, 1000)).toBe(10 * MIN);
		expect(clockStepMs(1000 - 3 * MIN, 1000)).toBe(-3 * MIN);
		// A tick that ran late — a throttled timer, a long task — moves both clocks together.
		expect(clockStepMs(47_000, 47_000)).toBe(0);
		expect(clockStepMs(1300, 1000)).toBe(0);
	});

	it("follows NTP correcting a clock the screen had already corrected for", () => {
		// The bug: the box booted ten minutes slow, the probe measured +10 min and the wall was
		// right. Then NTP set the clock, and the old offset added on top put every time on the
		// wall ten minutes out for up to an hour, under a message blaming the now-correct clock.
		const skew = 10 * MIN + 400;
		expect(skewAfterStep(skew, clockStepMs(1000 + 10 * MIN, 1000))).toBe(400);
	});

	it("keeps the offset through a suspend, which looks like a forward step", () => {
		expect(skewAfterStep(0, 3 * 60 * MIN)).toBeNull();
		expect(skewAfterStep(5 * MIN, 40 * MIN)).toBeNull();
		expect(skewAfterStep(20_000, 5 * MIN)).toBeNull();
	});

	it("asks again soon after a failure, backing off, and hourly once answered", () => {
		expect(nextSkewProbeMs(0)).toBe(60 * MIN);
		expect(nextSkewProbeMs(1)).toBe(30_000);
		expect(nextSkewProbeMs(2)).toBe(60_000);
		const delays = Array.from({ length: 12 }, (_, i) => nextSkewProbeMs(i + 1));
		for (let i = 1; i < delays.length; i++)
			expect(delays[i], "the retry got sooner after another failure").toBeGreaterThanOrEqual(
				delays[i - 1] ?? 0,
			);
		expect(Math.max(...delays)).toBe(5 * MIN);
	});
});
