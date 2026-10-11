// The year as a line, on the front page: twelve Umm al-Qura months from the first day of
// the month we are in, the months as ticks on it, Ramadan drawn heavier, the two eids and
// Ashura as marks, the turn of the year where it falls, and today as a point.
//
// The companion of the prayer-day horizon (lib/bonetider/horizon.ts), in the same grammar:
// that line runs from midnight to midnight with the islamic date turning at maghrib, this
// one from new moon to the same new moon a year on with the islamic year turning at
// 1 Muḥarram. Positions are FRACTIONS of the line; the SVG sets them as percentages, so
// nothing here knows how wide it is drawn.
//
// A window that slides, not »the year 1448«: a fixed hijri year would show eleven months
// of the past by Dhū al-ḥijja and nothing of what is coming, and what is coming is the
// reason to look. Starting at the month's first day keeps the months whole and puts today
// in the first twelfth, so every yearly observance lies ahead on the line exactly once.

import { MS_PER_DAY } from "./daily";
import {
	getMarkesdagar,
	gregorianShort,
	gregorianToHijri,
	hijriMonthLabel,
	stockholmNoon,
} from "./markesdagar";

/** The observances the line names, by the names lib/markesdagar.ts gives them. The rest
 *  of the calendar (the last ten nights, the six days of Shawwal, Arafa, Hajj) falls on or
 *  beside one of these and is the calendar page's to list. arslinje.test.ts fails if a
 *  name here stops matching, so a rename there cannot silently empty the line. */
export const ARSLINJENS_MARKEN = ["Ashura", "Ramadan", "Eid al-fitr", "Eid al-adha"] as const;

/** The one drawn as a stretch rather than a point. */
const STRACKA = "Ramadan";

export type MarkState = "passed" | "next" | "later";

export interface YearMark {
	name: string;
	/** Where it begins on the line. */
	x: number;
	/** Where a period ends (the day after its last), for the heavier stretch. */
	x2?: number;
	startISO: string;
	/** Its last day, inclusive. */
	endISO: string;
	/** »8 februari«: the day it begins, for the line under its name. */
	date: string;
	state: MarkState;
}

export interface YearLine {
	startISO: string;
	/** The first day past the line: the same month's first day, a year on. */
	endISO: string;
	/** »Rabīʿ al-thānī 1448«: the month the line opens on. */
	opens: string;
	/** The first day of each month after the first, eleven of them. */
	months: number[];
	/** 1 Muḥarram, with the year that begins there; null when the line opens on it. */
	newYear: { x: number; year: number } | null;
	marks: YearMark[];
	today: number;
}

const iso = (date: Date) => date.toISOString().slice(0, 10);
const noonOf = (isoDate: string) => Date.parse(`${isoDate}T12:00:00Z`);

/** `mark`'s state on `todayISO`: the first one not yet over is the next. Shared with the
 *  client (scripts/arslinje.ts), which asks again with the reader's own today. */
export function markStates(
	marks: readonly Pick<YearMark, "endISO">[],
	todayISO: string,
): MarkState[] {
	let found = false;
	return marks.map((mark) => {
		if (mark.endISO < todayISO) return "passed";
		if (found) return "later";
		found = true;
		return "next";
	});
}

/** Today's place on a line between two ISO days, held to the line. */
export function fractionOf(todayISO: string, startISO: string, endISO: string): number {
	const span = noonOf(endISO) - noonOf(startISO);
	if (!(span > 0)) return 0;
	return Math.min(1, Math.max(0, (noonOf(todayISO) - noonOf(startISO)) / span));
}

export function yearLine(now = new Date()): YearLine {
	const noon = stockholmNoon(now);
	const todayISO = iso(noon);
	const start = noon.getTime() - (gregorianToHijri(noon).d - 1) * MS_PER_DAY;

	// The first day of each of the next thirteen months, read off the calendar day by day
	// so a 29- or 30-day month cannot be guessed wrong. The thirteenth is the line's end.
	const firsts: { at: number; m: number; y: number }[] = [];
	for (let t = start; firsts.length < 13 && t < start + 400 * MS_PER_DAY; t += MS_PER_DAY) {
		const h = gregorianToHijri(new Date(t));
		if (h.d === 1) firsts.push({ at: t, m: h.m, y: h.y });
	}
	const end = firsts.at(-1)?.at ?? start + 354 * MS_PER_DAY;
	const startISO = iso(new Date(start));
	const endISO = iso(new Date(end));
	const at = (isoDate: string) => (noonOf(isoDate) - noonOf(startISO)) / (end - start);

	const wanted: readonly string[] = ARSLINJENS_MARKEN;
	const onLine = getMarkesdagar(now)
		.filter((e) => wanted.includes(e.name) && e.startISO >= startISO && e.startISO < endISO)
		.map((e) => ({ ...e, endISO: e.endISO ?? e.startISO }));
	const states = markStates(onLine, todayISO);
	const marks = onLine.map((e, i): YearMark => {
		const dayAfter = iso(new Date(noonOf(e.endISO) + MS_PER_DAY));
		return {
			name: e.name,
			x: at(e.startISO),
			...(e.name === STRACKA ? { x2: Math.min(1, at(dayAfter)) } : {}),
			startISO: e.startISO,
			endISO: e.endISO,
			date: gregorianShort(e.startISO),
			state: states[i] ?? "later",
		};
	});

	const turn = firsts.find((f, i) => i > 0 && i < 12 && f.m === 1);
	return {
		startISO,
		endISO,
		opens: hijriMonthLabel(new Date(start)),
		months: firsts.slice(1, 12).map((f) => (f.at - start) / (end - start)),
		newYear: turn ? { x: (turn.at - start) / (end - start), year: turn.y } : null,
		marks,
		today: fractionOf(todayISO, startISO, endISO),
	};
}

/** How a label stands on its mark: centred, or ranged from the line's end near one. */
export function anchorOf(x: number): "start" | "middle" | "end" {
	if (x < 0.12) return "start";
	if (x > 0.88) return "end";
	return "middle";
}

/** A label's width at the line's 12px sans, from its longer line, for the build, which
 *  cannot measure text. On the wide side: a label dropped for a few pixels it would have
 *  had is a smaller fault than two that touch, and the client measures the real ones. */
const CHAR_PX = 6.2;
export const labelWidth = (mark: Pick<YearMark, "name" | "date">) =>
	Math.max(mark.name.length, mark.date.length) * CHAR_PX;

/**
 * Which marks keep their label on a line `widthPx` wide, so no two touch: the indexes of
 * the ones that do. Greedy, the horizon's rule: the next observance first (it is the reason
 * to look), then the rest from the left; a label is kept if it clears every one already
 * kept by `gapPx`.
 */
export function labelsThatFit(
	marks: readonly Pick<YearMark, "x" | "state">[],
	widthPx: number,
	widthOf: (index: number) => number,
	gapPx = 10,
): Set<number> {
	const order = marks
		.map((mark, index) => ({ mark, index }))
		.sort(
			(a, b) =>
				Number(b.mark.state === "next") - Number(a.mark.state === "next") || a.mark.x - b.mark.x,
		);
	const kept: { left: number; right: number }[] = [];
	const shown = new Set<number>();
	for (const { mark, index } of order) {
		const w = widthOf(index);
		const centre = mark.x * widthPx;
		const anchor = anchorOf(mark.x);
		const left = anchor === "start" ? centre : anchor === "end" ? centre - w : centre - w / 2;
		const right = left + w;
		if (kept.every((k) => right + gapPx <= k.left || left >= k.right + gapPx)) {
			kept.push({ left, right });
			shown.add(index);
		}
	}
	return shown;
}
