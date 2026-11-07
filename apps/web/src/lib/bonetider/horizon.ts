// The prayer-day horizon on the front page: today as one line from Swedish midnight to
// midnight, the six times as ticks on it, the sun as a point at the current minute.
//
// Pure geometry, shared by the build (PrayerHorizon.astro, which serves a true line for
// Stockholm) and the browser (scripts/prayer-horizon.ts, which moves it to the reader's
// place and the real now). Positions are FRACTIONS of the day; the SVG sets them as
// percentages, so nothing here knows how wide the line is drawn.
//
// No solar maths lives here on purpose: the day's times come from prayer-times, which the
// mast already ships to every page. The horizon is a straight line, not the altitude
// curve, so it costs the client a few hundred bytes rather than the contour renderer.

import { PRAYER_ORDER, type PrayerKey } from "./prayer-times";

export type DayTimes = Record<PrayerKey, Date>;

const STOCKHOLM_CLOCK = new Intl.DateTimeFormat("en-GB", {
	timeZone: "Europe/Stockholm",
	hour: "2-digit",
	minute: "2-digit",
	second: "2-digit",
	hourCycle: "h23",
});

/** Minutes since Swedish midnight for an instant, whatever the reader's own zone. */
export function stockholmMinuteOfDay(instant: Date): number {
	const parts = STOCKHOLM_CLOCK.formatToParts(instant);
	const n = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
	return n("hour") * 60 + n("minute") + n("second") / 60;
}

/** The instant of Swedish midnight that opens `now`'s day. Off by the DST hour only on the
 *  two nights a year the clocks change, which moves every tick by 4% of a day for one day —
 *  the same error a printed almanac makes, and invisible at the horizon's scale. */
function stockholmDayStart(now: Date): number {
	return now.getTime() - stockholmMinuteOfDay(now) * 60_000;
}

const DAY_MS = 86_400_000;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

type TickState = "passed" | "next" | "later";

interface HorizonTick {
	key: PrayerKey;
	/** Position on the day, 0 = midnight, 1 = the next midnight. */
	x: number;
	state: TickState;
}

export interface Horizon {
	ticks: HorizonTick[];
	/** Sunrise → maghrib: the stretch of the line the sun is above the horizon. Null on a
	 *  day the calculation has no sunrise or sunset (never in Sweden's populated south,
	 *  but the north has midnight sun and polar night). */
	daylight: [number, number] | null;
	/** The current minute on the line. */
	sun: number;
	/** Where the islamic day turns over, or null if there is no maghrib today. */
	maghrib: number | null;
}

/**
 * Lay today's times out on the line.
 *
 * `nextToday` is the next prayer if it falls TODAY; once Isha has passed the next prayer
 * is tomorrow's Fajr, which is not on this line, so every tick reads as passed.
 * A time that is not a number (a high-latitude day with no true Fajr or Isha) is left
 * off the line rather than drawn at midnight.
 */
export function horizon(times: DayTimes, now: Date, nextToday: PrayerKey | null): Horizon {
	const start = stockholmDayStart(now);
	const at = (d: Date) => clamp01((d.getTime() - start) / DAY_MS);
	const nowMs = now.getTime();

	const ticks: HorizonTick[] = [];
	for (const key of PRAYER_ORDER) {
		const t = times[key].getTime();
		if (!Number.isFinite(t)) continue;
		const state: TickState = key === nextToday ? "next" : t < nowMs ? "passed" : "later";
		ticks.push({ key, x: at(times[key]), state });
	}

	const up = times.sunrise.getTime();
	const down = times.maghrib.getTime();
	const daylight: [number, number] | null =
		Number.isFinite(up) && Number.isFinite(down) ? [at(times.sunrise), at(times.maghrib)] : null;

	return {
		ticks,
		daylight,
		sun: at(now),
		maghrib: Number.isFinite(down) ? at(times.maghrib) : null,
	};
}

/** A fraction as an SVG length. Two decimals is a tenth of a pixel on a 1 000px line. */
export function pct(x: number): string {
	return `${(x * 100).toFixed(2)}%`;
}

/**
 * Which tick labels to draw on a line `widthPx` wide, so no two collide.
 *
 * Greedy, in priority order: the next prayer first (it is the reason to look), then the
 * rest from the left. A label is kept if its box clears every label already kept by
 * `gapPx`. On a desktop line all six fit on any Swedish day; on a phone usually only the
 * next one does, which is the point — the mast already names it, the horizon shows where
 * it falls in the day.
 */
export function labelsThatFit(
	ticks: readonly { key: PrayerKey; x: number }[],
	widthPx: number,
	labelWidthPx: (key: PrayerKey) => number,
	priority: PrayerKey | null,
	gapPx = 10,
): Set<PrayerKey> {
	const order = [...ticks].sort((a, b) => {
		if (a.key === priority) return -1;
		if (b.key === priority) return 1;
		return a.x - b.x;
	});
	const kept: { left: number; right: number }[] = [];
	const shown = new Set<PrayerKey>();
	for (const t of order) {
		const w = labelWidthPx(t.key);
		const centre = t.x * widthPx;
		// Labels are centred on their tick but never pushed past the line's ends, the same
		// clamp the SVG applies with text-anchor start/end at the edges.
		const left = Math.min(Math.max(centre - w / 2, 0), widthPx - w);
		const right = left + w;
		if (kept.every((k) => right + gapPx <= k.left || left >= k.right + gapPx)) {
			kept.push({ left, right });
			shown.add(t.key);
		}
	}
	return shown;
}

/** Text anchor for a label at `x`: centred, unless that would run it off either end. */
export function anchorFor(x: number, widthPx: number, labelPx: number): "start" | "middle" | "end" {
	const half = labelPx / 2;
	if (x * widthPx < half) return "start";
	if ((1 - x) * widthPx < half) return "end";
	return "middle";
}
