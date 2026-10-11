import { describe, expect, it } from "vitest";
import {
	ARSLINJENS_MARKEN,
	fractionOf,
	labelsThatFit,
	labelWidth,
	markStates,
	yearLine,
} from "./arslinje";
import { getMarkesdagar, gregorianToHijri } from "./markesdagar";

const day = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe("the front page's year line", () => {
	it("names only observances the calendar still has", () => {
		const names = new Set(getMarkesdagar(day("2026-10-10")).map((e) => e.name));
		for (const name of ARSLINJENS_MARKEN) {
			expect(
				names.has(name),
				`»${name}« is drawn on the front page's year line but lib/markesdagar.ts no longer has an observance by that name: the line would silently lose its mark. Rename it in ARSLINJENS_MARKEN too.`,
			).toBe(true);
		}
	});

	it("opens on the first day of the current month and runs twelve whole months", () => {
		for (const today of ["2026-10-10", "2027-02-08", "2027-05-20", "2027-06-06"]) {
			const line = yearLine(day(today));
			const first = gregorianToHijri(day(line.startISO));
			const last = gregorianToHijri(day(line.endISO));
			expect(
				first.d,
				`${today}: the line must open on a month's first day, or its month ticks cut months in two`,
			).toBe(1);
			expect(
				[last.d, last.m, last.y],
				`${today}: the line must end on the same month's first day a year on, so every yearly observance lies on it once`,
			).toEqual([1, first.m, first.y + 1]);
			expect(line.months, `${today}: eleven month ticks between the two ends`).toHaveLength(11);
			expect(line.today).toBeGreaterThanOrEqual(0);
			expect(line.today, `${today}: today stands in the line's first month`).toBeLessThan(1 / 11);
		}
	});

	it("draws every yearly observance it names exactly once, in order, on the line", () => {
		for (const today of ["2026-10-10", "2027-02-20", "2027-06-10"]) {
			const line = yearLine(day(today));
			expect(
				line.marks.map((m) => m.name).sort(),
				`${today}: a twelve-month line holds each yearly observance once; one missing or doubled means the window is not a year`,
			).toEqual([...ARSLINJENS_MARKEN].sort());
			const xs = line.marks.map((m) => m.x);
			expect(xs).toEqual([...xs].sort((a, b) => a - b));
			for (const m of line.marks) {
				expect(m.x).toBeGreaterThanOrEqual(0);
				expect(m.x).toBeLessThan(1);
			}
		}
	});

	it("draws Ramadan as a stretch a month long and the rest as points", () => {
		const line = yearLine(day("2026-10-10"));
		const ramadan = line.marks.find((m) => m.name === "Ramadan");
		const width = (ramadan?.x2 ?? 0) - (ramadan?.x ?? 0);
		expect(width, "Ramadan is 29 or 30 days of about 354").toBeGreaterThan(28 / 356);
		expect(width).toBeLessThan(31 / 353);
		for (const m of line.marks.filter((mark) => mark.name !== "Ramadan")) {
			expect(m.x2, `${m.name} is a day, not a stretch`).toBeUndefined();
		}
	});

	it("marks the turn of the year, unless the line opens on it", () => {
		const autumn = yearLine(day("2026-10-10"));
		expect(autumn.newYear?.year).toBe(1449);
		// 1 Muḥarram 1449 is the line's own first day: the opening label already says so.
		const first = getMarkesdagar(day("2027-05-01")).find(
			(e) => e.hijriYear === 1449 && e.hijriLabel.startsWith("1 Mu"),
		);
		expect(
			first,
			"the calendar must hold 1 Muḥarram 1449 for this test to mean anything",
		).toBeDefined();
		expect(yearLine(day(first?.startISO ?? "")).newYear).toBeNull();
	});

	it("calls the first observance not yet over the next one", () => {
		const marks = [{ endISO: "2026-06-25" }, { endISO: "2027-03-08" }, { endISO: "2027-03-09" }];
		expect(markStates(marks, "2026-10-10")).toEqual(["passed", "next", "later"]);
		// A period is the next one until its last day has passed.
		expect(markStates(marks, "2027-03-08")).toEqual(["passed", "next", "later"]);
		expect(markStates(marks, "2027-03-09")).toEqual(["passed", "passed", "next"]);
	});

	it("keeps today on the line when a build is older than the line", () => {
		expect(fractionOf("2026-01-01", "2026-09-12", "2027-09-01")).toBe(0);
		expect(fractionOf("2028-01-01", "2026-09-12", "2027-09-01")).toBe(1);
	});

	it("never lets two labels touch, and always keeps the next one", () => {
		for (const today of ["2026-10-10", "2027-05-20", "2027-06-10"]) {
			const line = yearLine(day(today));
			const widthOf = (i: number) => {
				const mark = line.marks[i];
				return mark ? labelWidth(mark) : 0;
			};
			for (const width of [280, 590, 800]) {
				const shown = labelsThatFit(line.marks, width, widthOf);
				const next = line.marks.findIndex((m) => m.state === "next");
				if (next >= 0) {
					expect(
						shown.has(next),
						`${today} at ${width}px: the next observance is the reason to look and must keep its label`,
					).toBe(true);
				}
			}
			// Ramadan and Eid al-fitr are a month apart, 23px of a phone's line: it cannot
			// name both.
			const phone = labelsThatFit(line.marks, 280, widthOf);
			const names = line.marks.filter((_, i) => phone.has(i)).map((m) => m.name);
			expect(names.includes("Ramadan") && names.includes("Eid al-fitr")).toBe(false);
		}
	});

	it("names all four on the line a desktop draws, given the widths the browser measures", () => {
		// The bug this pins: with the build's estimate (6.4px a character) Eid al-fitr and
		// Ashura never fitted, at any width, and the line named two observances of four.
		// Measured in Chrome at 12px Source Sans: Ramadan 52, Eid al-fitr 52, Eid al-adha
		// 58, Ashura 37 (the wider of name and date).
		const line = yearLine(day("2026-10-10"));
		const measured: Record<string, number> = {
			Ramadan: 52,
			"Eid al-fitr": 52,
			"Eid al-adha": 58,
			Ashura: 37,
		};
		const shown = labelsThatFit(line.marks, 795, (i) => measured[line.marks[i]?.name ?? ""] ?? 60);
		expect(shown.size, "two thirds of the 76rem canvas is 795px and holds every label").toBe(4);
	});
});
