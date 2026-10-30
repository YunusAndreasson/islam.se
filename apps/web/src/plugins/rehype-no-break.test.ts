import { describe, expect, it } from "vitest";
import { noBreak } from "../lib/no-break";
import { rehypeNoBreak } from "./rehype-no-break";

const NBSP = "\u00A0";

// biome-ignore lint/suspicious/noExplicitAny: hand-built hAST, not the full mdast-util types
type Node = any;
const text = (value: string): Node => ({ type: "text", value });
const el = (tagName: string, ...children: Node[]): Node => ({ type: "element", tagName, children });

describe("noBreak", () => {
	// THE BUG (2026-10-30): the first paragraph of an essay read »Omkring 70 / 000 besökare«
	// at 1440px, the number parted across two lines. A plain space is what Swedish source
	// text has, so nothing in the markdown could prevent it.
	it.each([
		["Omkring 70 000 besökare", `Omkring 70${NBSP}000 besökare`],
		["1 652 895 invånare", `1${NBSP}652${NBSP}895 invånare`],
		["över 100 000 ljus", `över 100${NBSP}000 ljus`],
	])("keeps the groups of a number together: %s", (input, expected) => {
		expect(noBreak(input)).toBe(expected);
	});

	it.each([
		["den 31 oktober", `den 31${NBSP}oktober`],
		["12 % av", `12${NBSP}% av`],
		["106 procent", `106${NBSP}procent`],
		["622 e.Kr.", `622${NBSP}e.Kr.`],
		["Muslim nr 977", `Muslim nr${NBSP}977`],
		["s. 12", `s.${NBSP}12`],
		["i Koranen 59:10", `i Koranen${NBSP}59:10`],
	])("keeps a number with what it counts: %s", (input, expected) => {
		expect(noBreak(input)).toBe(expected);
	});

	// A year beside a count is two numbers, however the digits fall: binding them would
	// also set a false thousands group in the text a screen reader reads.
	it.each([
		"år 2018 100 personer",
		"1953 300 år",
		"mars månad",
		"12 man",
		"vers fem",
		"ett univers 5",
	])("leaves everything else with its ordinary spaces: %s", (input) => {
		expect(noBreak(input)).toBe(input);
	});
});

describe("rehypeNoBreak", () => {
	it("reaches the text inside inline elements and notes", () => {
		const tree = el("p", text("Omkring 70 000"), el("em", text("den 3 maj")));
		rehypeNoBreak()(tree);
		expect(tree.children[0].value).toBe(`Omkring 70${NBSP}000`);
		expect(tree.children[1].children[0].value).toBe(`den 3${NBSP}maj`);
	});

	// The chart, table and timeline plugins read their fence's text as data.
	it("leaves code as it was written", () => {
		const tree = el("pre", el("code", text("70 000")));
		rehypeNoBreak()(tree);
		expect(tree.children[0].children[0].value).toBe("70 000");
	});

	// A heading's text is its id: with a no-break space »Efter 1 000 år« goes from
	// #efter-1-000-år to #efter-1000-år, and every link already shared breaks.
	it("leaves a heading as it was written", () => {
		const tree = el("div", el("h2", text("Efter 1 000 år")), el("h3", text("Den 31 oktober")));
		rehypeNoBreak()(tree);
		expect(tree.children[0].children[0].value).toBe("Efter 1 000 år");
		expect(tree.children[1].children[0].value).toBe("Den 31 oktober");
	});
});
