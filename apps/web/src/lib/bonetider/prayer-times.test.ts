import { describe, expect, it } from "vitest";

import {
	computePrayerTimes,
	countdownLabel,
	formatTime,
	nextPrayer,
	stockholmDayKey,
	stockholmMonthLabel,
	stockholmWeekdayLabel,
} from "./prayer-times";
import { DEFAULT_COORDS, DEFAULT_SETTINGS, type PrayerSettings } from "./settings";

// Every instant here is written as an absolute UTC timestamp on purpose: the whole point of
// stockholmDayKey is that the answer must not depend on where the reader is sitting, so a
// test written in local wall-clock time would assert nothing.
//
// ⚠️ HONEST LIMITATION: run on a host that is already Europe/Stockholm, these cases pass
// under the OLD (visitor-local) implementation too — that is precisely why the bug survived
// so long. They fail under it on any host with a different offset, including a UTC CI box.
describe("stockholmDayKey", () => {
	it("names the Swedish calendar day, not the reader's", () => {
		// 22:30 UTC in August is 00:30 the NEXT day in Stockholm (CEST, UTC+2). A reader in
		// London, New York or Riyadh is still on the previous date; Sweden is not.
		expect(stockholmDayKey(new Date("2026-08-17T22:30:00Z"))).toBe("2026-7-18");
		expect(stockholmDayKey(new Date("2026-08-17T21:30:00Z"))).toBe("2026-7-17");
		// Winter is UTC+1 (CET), so the rollover sits an hour later.
		expect(stockholmDayKey(new Date("2026-01-15T23:30:00Z"))).toBe("2026-0-16");
		expect(stockholmDayKey(new Date("2026-01-15T22:30:00Z"))).toBe("2026-0-15");
	});

	it("holds one value across a whole Swedish day, however the reader's day falls", () => {
		// 00:30 and 21:00 Stockholm on 18 August — one Swedish day, but they straddle both
		// UTC midnight and the local midnight of every timezone west of Sweden. A key built
		// from the reader's own date splits them, and the split is the bug: the second half
		// of the day kept serving prayer times computed for 17 August.
		const earlyStockholm = new Date("2026-08-17T22:30:00Z");
		const lateStockholm = new Date("2026-08-18T19:00:00Z");
		expect(stockholmDayKey(earlyStockholm)).toBe(stockholmDayKey(lateStockholm));
	});

	it("changes exactly once per Swedish day across the autumn 25-hour day", () => {
		// 25 October 2026: the clocks go back 03:00 CEST → 02:00 CET. A day key that stepped
		// by a fixed 24 h would land on the wrong side of this; deriving it from the zone does
		// not. Walk 26 October-hours from Stockholm midnight and count distinct keys.
		const start = new Date("2026-10-24T22:00:00Z"); // 00:00 CEST on the 25th
		const keys = new Set<string>();
		for (let h = 0; h < 25; h++) {
			keys.add(stockholmDayKey(new Date(start.getTime() + h * 3600_000)));
		}
		// 25 civil hours all inside 25 October, so exactly one key.
		expect([...keys]).toEqual(["2026-9-25"]);
		// The 26th hour is the next day.
		expect(stockholmDayKey(new Date(start.getTime() + 25 * 3600_000))).toBe("2026-9-26");
	});
});

// The consequence the key exists to prevent. This is the shape of the cache in
// scripts/bonetider-field.ts: hold a day's times, and roll to tomorrow's Fajr once they are
// all past. Keyed on the Swedish day it agrees with a from-scratch computation at every
// instant; keyed on the reader's day it did not — from Riyadh it disagreed about two-thirds
// of the day, at worst announcing Fajr 22.8 hours out while Sweden was mid-morning.
describe("a day-keyed prayer cache agrees with recomputing from scratch", () => {
	// The shipped defaults, so the drift this pins is the one a real reader would have seen.
	const settings: PrayerSettings = DEFAULT_SETTINGS;
	const stockholm = { latitude: DEFAULT_COORDS.latitude, longitude: DEFAULT_COORDS.longitude };

	function resolveNext(today: ReturnType<typeof computePrayerTimes>, now: Date) {
		const next = nextPrayer(stockholm, today, now, settings);
		return { nextKey: next.key, target: next.at.getTime() };
	}

	it("never drifts from the truth over a week, at 15-minute resolution", () => {
		type Cached = { key: string; today: ReturnType<typeof computePrayerTimes>; target: number };
		let cached: Cached | null = null;
		const start = Date.UTC(2026, 7, 17, 0, 0, 0);
		const drift: string[] = [];
		for (let i = 0; i < 7 * 24 * 4; i++) {
			const now = new Date(start + i * 15 * 60_000);
			const key = stockholmDayKey(now);
			if (!cached || cached.key !== key) {
				const today = computePrayerTimes(stockholm, now, settings);
				cached = { key, today, ...resolveNext(today, now) };
			} else if (now.getTime() >= cached.target) {
				Object.assign(cached, resolveNext(cached.today, now));
			}
			const truth = resolveNext(computePrayerTimes(stockholm, now, settings), now);
			if (truth.target !== cached.target) {
				drift.push(
					`${now.toISOString()}: cache says next prayer at ${new Date(cached.target).toISOString()}, truth says ${new Date(truth.target).toISOString()} (${((cached.target - truth.target) / 3_600_000).toFixed(1)} h out)`,
				);
			}
		}
		expect(drift, `${drift.length} instants where the cached next prayer was wrong`).toEqual([]);
	});
});

describe("Stockholm display formatting", () => {
	it("follows the spring and autumn clock changes", () => {
		expect(formatTime(new Date("2026-03-29T00:59:00Z"))).toBe("01:59");
		expect(formatTime(new Date("2026-03-29T01:00:00Z"))).toBe("03:00");
		expect(formatTime(new Date("2026-10-25T00:59:00Z"))).toBe("02:59");
		expect(formatTime(new Date("2026-10-25T01:00:00Z"))).toBe("02:00");
	});
	it("labels the Swedish day and month when UTC is still in the previous month", () => {
		const date = new Date("2026-08-31T22:30:00Z");
		expect(stockholmMonthLabel(date)).toBe("september 2026");
		expect(stockholmWeekdayLabel(date)).toBe("tis");
	});
	it("preserves missing and unresolved prayer times as dashes", () => {
		for (const value of [null, undefined, new Date(Number.NaN)]) {
			expect(formatTime(value)).toBe("—");
		}
	});
});

describe("nextPrayer", () => {
	const stockholm = { latitude: DEFAULT_COORDS.latitude, longitude: DEFAULT_COORDS.longitude };

	it("counts down to the next calendar day's Fajr on the night the clocks go forward", () => {
		// Saturday 28 March 2026, 23:30 in Stockholm (22:30 UTC). Summer time starts at 02:00
		// that night, so `now` + 24 hours is Monday 00:30 — the copy that rolled over that
		// way counted down to Monday's Fajr. Sunday's is the next prayer.
		const now = new Date("2026-03-28T22:30:00Z");
		const today = computePrayerTimes(stockholm, now, DEFAULT_SETTINGS);
		const next = nextPrayer(stockholm, today, now, DEFAULT_SETTINGS);
		const sunday = computePrayerTimes(
			stockholm,
			new Date("2026-03-29T10:00:00Z"),
			DEFAULT_SETTINGS,
		);
		expect(next.key).toBe("fajr");
		expect(next.at.toISOString(), "Sunday's Fajr, not Monday's").toBe(sunday.fajr.toISOString());
	});

	it("names the day's next prayer while there is one", () => {
		const now = new Date("2026-08-17T08:00:00Z");
		const today = computePrayerTimes(stockholm, now, DEFAULT_SETTINGS);
		const next = nextPrayer(stockholm, today, now, DEFAULT_SETTINGS);
		expect(next.at.getTime()).toBeGreaterThanOrEqual(now.getTime());
		expect(next.at).toBe(today[next.key]);
	});
});

describe("countdownLabel", () => {
	const MIN = 60_000;

	it("agrees with the clocks: a 12:05 prayer is five minutes off all through 12:00", () => {
		// THE BUG: the prayer field floored and the moskéskärm rounded, so ten seconds into
		// 12:00 a phone said »om 4 min« and the wall »om 5 min« about the same prayer.
		expect(countdownLabel(5 * MIN)).toBe("om 5 min");
		expect(countdownLabel(5 * MIN - 10_000)).toBe("om 5 min");
		expect(countdownLabel(4 * MIN + 1)).toBe("om 5 min");
		expect(countdownLabel(4 * MIN)).toBe("om 4 min");
	});

	it("says whole hours without a zero", () => {
		expect(countdownLabel(180 * MIN), "never »om 3 tim 0 min«").toBe("om 3 tim");
		expect(countdownLabel(72 * MIN)).toBe("om 1 tim 12 min");
	});

	it("counts seconds in the last minute and says »nu« when it is due", () => {
		expect(countdownLabel(34_000)).toBe("om 34 sek");
		expect(countdownLabel(59_500), "a late tick must not read »om 60 sek«").toBe("om 1 min");
		expect(countdownLabel(0)).toBe("nu");
		expect(countdownLabel(-5_000)).toBe("nu");
	});
});
