import { describe, expect, it } from "vitest";
import { hijriAt, hijriAtLabel } from "../markesdagar";
import { anchorFor, horizon, labelsThatFit, stockholmMinuteOfDay } from "./horizon";
import { computePrayerTimes, nextPrayerKeyAt, PRAYER_ORDER, type PrayerKey } from "./prayer-times";
import { DEFAULT_COORDS, DEFAULT_SETTINGS } from "./settings";

// The front page's prayer-day horizon. What it must never do: draw the day's times out
// of order, put a mark off the line, or say a new islamic day has begun anywhere but at
// maghrib.

const DAYS = {
	autumn: new Date("2026-09-25T17:00:00Z"), // 19:00 in Stockholm, just after maghrib
	midsummer: new Date("2026-06-21T10:00:00Z"),
	midwinter: new Date("2026-12-21T10:00:00Z"),
};

function modelFor(now: Date) {
	const times = computePrayerTimes(DEFAULT_COORDS, now, DEFAULT_SETTINGS);
	const next = nextPrayerKeyAt(times, now.getTime());
	return { times, model: horizon(times, now, next) };
}

describe("horizon", () => {
	it.each(Object.entries(DAYS))("keeps every mark on the line on a %s day", (_, now) => {
		const { model } = modelFor(now);
		for (const t of model.ticks) {
			expect(t.x, `${t.key} drawn at ${t.x}, off the 0–1 line`).toBeGreaterThanOrEqual(0);
			expect(t.x, `${t.key} drawn at ${t.x}, off the 0–1 line`).toBeLessThanOrEqual(1);
		}
		expect(model.sun).toBeGreaterThanOrEqual(0);
		expect(model.sun).toBeLessThanOrEqual(1);
	});

	it.each(Object.entries(DAYS))(
		"draws the %s day's times left to right in prayer order",
		(_, now) => {
			const { model } = modelFor(now);
			const keys = model.ticks.map((t) => t.key);
			expect(keys, "ticks must follow PRAYER_ORDER").toEqual(
				PRAYER_ORDER.filter((k) => keys.includes(k)),
			);
			const xs = model.ticks.map((t) => t.x);
			expect(xs, "a later prayer was drawn left of an earlier one").toEqual(
				[...xs].sort((a, b) => a - b),
			);
		},
	);

	it("puts the sun at the Swedish wall-clock minute, whatever zone the reader is in", () => {
		const { model } = modelFor(DAYS.autumn);
		expect(model.sun * 1440).toBeCloseTo(stockholmMinuteOfDay(DAYS.autumn), 5);
		expect(stockholmMinuteOfDay(DAYS.autumn)).toBe(19 * 60);
	});

	it("marks exactly one tick as next while a prayer is still due today, none after Isha", () => {
		const { model } = modelFor(new Date("2026-09-25T10:00:00Z"));
		expect(model.ticks.filter((t) => t.state === "next")).toHaveLength(1);
		const late = modelFor(new Date("2026-09-25T21:50:00Z")).model; // 23:50 in Stockholm
		expect(
			late.ticks.some((t) => t.state === "next"),
			"after Isha the next prayer is tomorrow's",
		).toBe(false);
		expect(late.ticks.every((t) => t.state === "passed")).toBe(true);
	});

	it("stretches daylight from sunrise to maghrib", () => {
		const { model } = modelFor(DAYS.autumn);
		const x = (k: PrayerKey) => model.ticks.find((t) => t.key === k)?.x;
		expect(model.daylight).toEqual([x("sunrise"), x("maghrib")]);
	});
});

describe("hijriAt — the islamic day begins at maghrib", () => {
	const now = DAYS.autumn;
	const { maghrib } = computePrayerTimes(DEFAULT_COORDS, now, DEFAULT_SETTINGS);

	it("gives the civil Umm al-Qura date until maghrib, and the next date from it", () => {
		const before = new Date(maghrib.getTime() - 60_000);
		expect(hijriAt(before, maghrib)).toEqual({ y: 1448, m: 4, d: 14 });
		expect(hijriAt(maghrib, maghrib)).toEqual({ y: 1448, m: 4, d: 15 });
		expect(hijriAtLabel(maghrib, maghrib, false)).toBe("15 Rabīʿ al-thānī");
	});

	it("falls back to the civil date on a day with no maghrib", () => {
		expect(hijriAt(now, new Date(Number.NaN))).toEqual({ y: 1448, m: 4, d: 14 });
	});
});

describe("labelsThatFit", () => {
	const ticks = [
		{ key: "fajr" as const, x: 0.2 },
		{ key: "sunrise" as const, x: 0.23 },
		{ key: "dhuhr" as const, x: 0.54 },
	];
	const width = () => 50;

	it("always keeps the priority label, even where a neighbour is closer to the left", () => {
		const shown = labelsThatFit(ticks, 400, width, "sunrise");
		expect(shown.has("sunrise")).toBe(true);
		expect(shown.has("fajr"), "fajr overlaps sunrise at 400px and must yield").toBe(false);
	});

	it("never keeps two labels whose boxes overlap", () => {
		for (const w of [300, 600, 1000]) {
			const shown = [...labelsThatFit(ticks, w, width, null)];
			const boxes = ticks
				.filter((t) => shown.includes(t.key))
				.map((t) => [t.x * w - 25, t.x * w + 25] as const);
			for (let i = 1; i < boxes.length; i++) {
				expect(boxes[i]?.[0], `labels collide at ${w}px`).toBeGreaterThanOrEqual(
					(boxes[i - 1]?.[1] ?? 0) + 10,
				);
			}
		}
	});

	it("anchors a label at either end so it is never cut off", () => {
		expect(anchorFor(0.01, 400, 60)).toBe("start");
		expect(anchorFor(0.99, 400, 60)).toBe("end");
		expect(anchorFor(0.5, 400, 60)).toBe("middle");
	});
});
