import { describe, expect, it } from "vitest";
import { getFamily } from "./families";
import { passesGate } from "./gate";
import { QUESTIONS, THEME_LABELS, THEME_ORDER } from "./questions";
import { questionKey } from "./types";

describe("question bank", () => {
	it("gives every series a unique key and a URL-safe id", () => {
		const keys = QUESTIONS.map(questionKey);
		expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
		expect(
			QUESTIONS.filter((q) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(q.id)).map((q) => q.id),
		).toEqual([]);
	});

	it("never gives a question an id that a page of the section already uses", () => {
		// Question pages live at /ai-barometern/<id>/, beside the method page, the raw data and the
		// model pages. An id equal to one of those would shadow a route.
		const RESERVED = ["metod", "data", "modell", "og"];
		expect(QUESTIONS.filter((q) => RESERVED.includes(q.id)).map((q) => q.id)).toEqual([]);
	});

	it("keeps one active version per question id", () => {
		// Two active versions of one id would render two series on one URL.
		const active = QUESTIONS.filter((q) => !q.retired).map((q) => q.id);
		expect(active.filter((id, i) => active.indexOf(id) !== i)).toEqual([]);
	});

	it("keeps the bank grouped in theme order", () => {
		// The hub's question list and the previous/next links on a question page follow bank
		// order, while the matrix follows THEME_ORDER. A question appended at the end of the
		// bank would sit in a different place on each of them.
		const positions = QUESTIONS.map((q) => THEME_ORDER.indexOf(q.theme));
		expect(positions.includes(-1), "every theme needs a place in THEME_ORDER").toBe(false);
		expect(positions).toEqual([...positions].sort((a, b) => a - b));
	});

	it("puts every theme in exactly one area", () => {
		// The hub draws one table per area. A theme in no area drops its questions from the
		// matrix without an error; a theme in two areas prints them twice.
		expect([...THEME_ORDER].sort()).toEqual(Object.keys(THEME_LABELS).sort());
	});

	it("keeps every theme small enough to read as a group", () => {
		// On 2026-09-13 »Krig och folkrätt« held 33 active questions and could not be taken in as
		// one group in the matrix. When a theme outgrows the cap, split it (keeping each twin set
		// inside one theme); do not raise the cap.
		const MAX = 8;
		const oversized = THEME_ORDER.map(
			(theme) => `${theme}: ${QUESTIONS.filter((q) => !q.retired && q.theme === theme).length}`,
		).filter((entry) => Number(entry.split(": ")[1]) > MAX);
		expect(oversized).toEqual([]);
	});

	it("names the maker of the family a control question marks as its own", () => {
		// The pages ring the cell where a model judges its own company. A statement about Google
		// marked as Claude's own would put that ring, and the reader's suspicion, on the wrong model.
		const wrong = QUESTIONS.filter(
			(q) => q.aboutFamily && !q.text.includes(getFamily(q.aboutFamily).maker),
		).map((q) => q.id);
		expect(wrong).toEqual([]);
	});

	it("gives every religious question a classical note, and no other question one", () => {
		// CLAUDE.md: on a religious question the classical position gets the last word; on a
		// political question the site takes no position at all.
		const wrong = QUESTIONS.filter((q) => q.religious !== Boolean(q.classicalNote)).map(
			(q) => q.id,
		);
		expect(wrong).toEqual([]);
	});

	it("marks the classical position only on religious statements that set no policy", () => {
		// The marker puts islam.se on the statement's scale beside the models. On »Gud finns« that
		// is the classical creed; on »Samkönade par bör ha rätt att gifta sig« it would be the site
		// voting on Swedish law, which the barometer never does.
		const wrong = QUESTIONS.filter(
			(q) =>
				q.classicalPosition !== undefined &&
				(!(q.religious && q.classicalNote) ||
					q.kind !== "scale" ||
					/(?<!\p{L})bör(?!\p{L})/u.test(q.text)),
		).map((q) => q.id);
		expect(wrong).toEqual([]);
	});

	it("keeps faith and morality questions marked religious", () => {
		const unmarked = QUESTIONS.filter(
			(q) => (q.theme === "tro" || q.theme === "moral") && !q.religious,
		);
		expect(unmarked.map((q) => q.id)).toEqual([]);
	});

	it("writes statements and notes the site could print", () => {
		const problems = QUESTIONS.flatMap((q) => {
			const out: string[] = [];
			for (const text of [q.text, q.short, q.classicalNote ?? ""]) {
				if (!passesGate(text)) out.push(`${q.id}: gate word in »${text.slice(0, 40)}…«`);
				if (text.includes("—")) out.push(`${q.id}: em dash`);
			}
			const ending = q.kind === "party" ? "?" : ".";
			if (!q.text.endsWith(ending)) out.push(`${q.id}: ${q.kind} text should end in ${ending}`);
			return out;
		});
		expect(problems).toEqual([]);
	});
});
