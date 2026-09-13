import { describe, expect, it } from "vitest";
import { FAMILY_KEYS } from "./families";
import { passesGate } from "./gate";
import { activeQuestions } from "./questions";
import { TWIN_SETS, twinSetsOf } from "./twins";

// The twin sets are how the pages show a double standard. They only show one if the statements
// really are the same statement: a set whose wording has drifted apart compares two different
// questions and would accuse a model of inconsistency it never showed.

const active = new Map(activeQuestions().map((q) => [q.id, q]));

const words = (text: string) =>
	text
		.toLowerCase()
		.replace(/[.,:;?!»«]/g, "")
		.split(/\s+/)
		.filter(Boolean);

/** Word-level edit distance: how many words must change to turn one statement into the other. */
function wordDistance(a: readonly string[], b: readonly string[]): number {
	let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
	for (let i = 1; i <= a.length; i++) {
		const row = [i];
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			row.push(Math.min((prev[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost));
		}
		prev = row;
	}
	return prev[b.length] ?? 0;
}

describe("twin sets", () => {
	it("are built from active scale questions, each named once per set", () => {
		const problems = TWIN_SETS.flatMap((set) => {
			const ids = set.members.map((m) => m.id);
			const out = ids.flatMap((id) => {
				const q = active.get(id);
				if (!q) return [`${set.key}: ${id} is not an active question`];
				return q.kind === "scale" ? [] : [`${set.key}: ${id} is not a scale statement`];
			});
			if (new Set(ids).size !== ids.length) out.push(`${set.key}: a member appears twice`);
			if (ids.length < 2) out.push(`${set.key}: a set needs at least two members`);
			return out;
		});
		expect(problems).toEqual([]);
	});

	it("have unique, URL-safe keys", () => {
		// The key is the anchor the hub links to on a question page.
		const keys = TWIN_SETS.map((s) => s.key);
		expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
		expect(keys.filter((k) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(k))).toEqual([]);
	});

	it("keep a parallel set's wording the same apart from what it is about", () => {
		// A reworded twin voids the comparison: the models would be answering two questions, and
		// the page would present the difference as a double standard. The widest set on
		// 2026-09-13 is the genocide triad (»Israels krigföring i Gaza« / »Kinas behandling av
		// uigurerna i Xinjiang« / »RSF-milisens krigföring i Darfur«), five words apart.
		const MAX = 5;
		const drifted = TWIN_SETS.filter((s) => s.kind === "parallel").flatMap((set) => {
			const texts = set.members.map((m) => words(active.get(m.id)?.text ?? ""));
			return texts.flatMap((a, i) =>
				texts.slice(i + 1).flatMap((b, j) => {
					const d = wordDistance(a, b);
					return d > MAX ? [`${set.key}: members ${i} and ${i + j + 1} are ${d} words apart`] : [];
				}),
			);
		});
		expect(drifted).toEqual([]);
	});

	it("keep a parallel set inside one theme, so its rows sit together in the matrix", () => {
		const split = TWIN_SETS.filter(
			(s) =>
				s.kind === "parallel" && new Set(s.members.map((m) => active.get(m.id)?.theme)).size > 1,
		).map((s) => s.key);
		expect(split).toEqual([]);
	});

	it("give a principle set exactly one rule and one case", () => {
		expect(
			TWIN_SETS.filter((s) => s.kind === "principle" && s.members.length !== 2).map((s) => s.key),
		).toEqual([]);
	});

	it("put every AI company in a control set exactly once", () => {
		// A company missing from a set would leave one model with no judgement of its own maker.
		const control = TWIN_SETS.filter((s) => s.members.some((m) => active.get(m.id)?.aboutFamily));
		expect(control.length).toBeGreaterThan(0);
		for (const set of control) {
			const owners = set.members.map((m) => active.get(m.id)?.aboutFamily).sort();
			expect(owners, set.key).toEqual([...FAMILY_KEYS].sort());
		}
	});

	it("ask the reader a question instead of telling them what the answers mean", () => {
		// A »look for« that asserts something is the site taking the position the barometer only
		// measures. A question leaves the reading to the reader.
		const problems = TWIN_SETS.flatMap((set) => {
			const out: string[] = [];
			if (!set.lookFor.endsWith("?")) out.push(`${set.key}: lookFor should be a question`);
			for (const text of [set.title, set.lookFor, ...set.members.map((m) => m.label)]) {
				if (!passesGate(text)) out.push(`${set.key}: gate word in »${text}«`);
				if (text.includes("—")) out.push(`${set.key}: em dash in »${text}«`);
			}
			return out;
		});
		expect(problems).toEqual([]);
	});

	it("list parallel sets before principle sets on a question page", () => {
		expect(twinSetsOf("sjalvforsvar-israeler").map((s) => s.kind)).toEqual([
			"parallel",
			"principle",
		]);
	});
});
