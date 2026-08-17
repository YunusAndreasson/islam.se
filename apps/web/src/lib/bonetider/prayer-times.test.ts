import { describe, expect, it } from "vitest";

import { computePrayerTimes, nextPrayerKeyAt, stockholmDayKey } from "./prayer-times";
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
		const nk = nextPrayerKeyAt(today, now.getTime());
		if (nk) return { nextKey: nk, target: today[nk].getTime() };
		const fajr = computePrayerTimes(
			stockholm,
			new Date(now.getTime() + 86_400_000),
			settings,
		).fajr.getTime();
		return { nextKey: "fajr" as const, target: fajr };
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
