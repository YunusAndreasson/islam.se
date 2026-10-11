import { describe, expect, it } from "vitest";
import { rehypePullQuote, stripPullQuote } from "./rehype-pull-quote";

interface Node {
	type: string;
	tagName?: string;
	value?: string;
	properties?: Record<string, unknown>;
	children?: Node[];
}
type Tree = Parameters<ReturnType<typeof rehypePullQuote>>[0];
const t = (value: string): Node => ({ type: "text", value });
const el = (tagName: string, children: Node[], properties: Record<string, unknown> = {}): Node => ({
	type: "element",
	tagName,
	properties,
	children,
});
const p = (text: string) => el("p", [t(text)]);
const root = (children: Node[]): Node => ({ type: "root", children });
const run = (tree: Node, ...pullquotes: string[]) =>
	rehypePullQuote()(tree as Tree, {
		path: "test.md",
		data: { astro: { frontmatter: { pullquotes } } },
	});

/** Where the pull quote landed, as the tag/first-words sequence of the top level. */
const shape = (tree: Node) =>
	(tree.children ?? [])
		.filter((n) => n.type === "element")
		.map((n) =>
			n.tagName === "aside" ? "PQ" : `${n.tagName}:${(n.children?.[0]?.value ?? "").split(" ")[0]}`,
		);

const SENTENCE = "En plikt utan adress är ingen plikt.";
/** A paragraph of exactly 300 characters whose first word is `n`. */
const long = (n: number) => p(`${n} ${"x".repeat(300 - String(n).length - 1)}`);

describe("rehypePullQuote", () => {
	it("does nothing without pullquotes", () => {
		const tree = root([p("Ett."), p("Två."), p("Tre.")]);
		run(tree);
		expect(shape(tree)).toEqual(["p:Ett.", "p:Två.", "p:Tre."]);
	});

	// 300 characters a paragraph: the ~1 200-character target is four paragraphs away.
	it("stands about a screen of prose after the paragraph that holds the sentence", () => {
		const tree = root([p("Ett."), p(SENTENCE), ...[3, 4, 5, 6, 7, 8].map((n) => long(n))]);
		run(tree, SENTENCE);
		expect(shape(tree)).toEqual(["p:Ett.", "p:En", "p:3", "p:4", "p:5", "p:6", "PQ", "p:7", "p:8"]);
	});

	it("goes before the sentence when nothing after it comes close to a screen away", () => {
		const tree = root([p("Ett."), ...[2, 3, 4, 5, 6].map((n) => long(n)), p(SENTENCE), p("Sist.")]);
		run(tree, SENTENCE);
		expect(shape(tree)).toEqual([
			"p:Ett.",
			"p:2",
			"PQ",
			"p:3",
			"p:4",
			"p:5",
			"p:6",
			"p:En",
			"p:Sist.",
		]);
	});

	// The first paragraph carries the drop cap and the small-caps first line; a pull
	// quote directly under it would sit inside the essay's opening.
	it("never stands directly after the first paragraph", () => {
		const tree = root([p(SENTENCE), long(2), p("Tre.")]);
		run(tree, SENTENCE);
		expect(shape(tree)).toEqual(["p:En", "p:2", "PQ", "p:Tre."]);
	});

	it("never stands next to a heading or a blockquote", () => {
		const tree = root([
			p("Ett."),
			p(SENTENCE),
			el("h2", [t("Rubrik")]),
			el("blockquote", [p("Citat.")]),
			long(3),
			el("h2", [t("Nästa")]),
			long(4),
			p("Fem."),
		]);
		run(tree, SENTENCE);
		expect(shape(tree)).toEqual([
			"p:Ett.",
			"p:En",
			"h2:Rubrik",
			"blockquote:",
			"p:3",
			"h2:Nästa",
			"p:4",
			"PQ",
			"p:Fem.",
		]);
	});

	// Regression: a photograph on its own line reaches this pass as <p><img></p>, because
	// rehype-photo-figure runs later. It used to count as a plain paragraph, so in
	// »Bokmässans människorättskod …« the pull quote landed directly on top of a figure:
	// a display line and a photograph with no prose between them. Do not relax `isProse`.
	it("never stands next to a photograph", () => {
		const photo = el("p", [el("img", [], { src: "x.webp", alt: "En bild." })]);
		const tree = root([
			p("Ett."),
			p(SENTENCE),
			long(3),
			long(4),
			long(5),
			long(6),
			photo,
			long(7),
			long(8),
		]);
		run(tree, SENTENCE);
		expect(
			shape(tree),
			"a pull quote must keep at least one paragraph of prose between itself and a photograph",
		).toEqual(["p:Ett.", "p:En", "p:3", "p:4", "p:5", "PQ", "p:6", "p:", "p:7", "p:8"]);
	});

	it("matches across footnote markers and soft line breaks", () => {
		const source = el("p", [
			t("En plikt utan\nadress"),
			el("sup", [el("a", [t("3")])]),
			t(" är ingen plikt."),
		]);
		const tree = root([p("Ett."), p("Två."), source, p("Fyra."), p("Fem.")]);
		run(tree, SENTENCE);
		expect(shape(tree)).toContain("PQ");
	});

	it("marks the copy as hidden from assistive technology and renders the sentence", () => {
		const tree = root([p("Ett."), p("Två."), p(SENTENCE), p("Fyra."), p("Fem.")]);
		run(tree, SENTENCE);
		const aside = tree.children?.find((n) => n.tagName === "aside");
		expect(aside?.properties).toMatchObject({ className: ["pull-quote"], ariaHidden: "true" });
		expect(aside?.children?.[0]?.children?.[0]?.value).toBe(SENTENCE);
	});

	// A pullquote that drifted from the prose (an edit to the body, a typo, straight
	// quotes where the prose has »…«) must fail the build, not ship a line the essay
	// never says.
	it("fails the build when the sentence is not in the prose", () => {
		const tree = root([p("Ett."), p("Två."), p("Tre.")]);
		expect(() => run(tree, SENTENCE)).toThrow(/not a sentence of the essay's own prose/);
	});

	it("refuses to lift a sentence from a blockquote", () => {
		const tree = root([p("Ett."), el("blockquote", [p(SENTENCE)]), p("Två."), p("Tre.")]);
		expect(() => run(tree, SENTENCE)).toThrow(/blockquotes don't count/);
	});

	it("fails the build when there are no two consecutive paragraphs to stand between", () => {
		const tree = root([p("Ett."), el("h2", [t("R")]), p(SENTENCE), el("blockquote", [p("C.")])]);
		expect(() => run(tree, SENTENCE)).toThrow(/no place to stand/);
	});

	it("keeps two pull quotes at least two screens apart", () => {
		const B = "Adressen ristas inte.";
		const paras = Array.from({ length: 16 }, (_, i) => long(i + 2));
		const tree = root([p("Ett."), p(SENTENCE), ...paras.slice(0, 8), p(B), ...paras.slice(8)]);
		run(tree, SENTENCE, B);
		const blocks = (tree.children ?? []).filter((n) => n.type === "element");
		const [first, second] = blocks.flatMap((n, i) => (n.tagName === "aside" ? [i] : []));
		const between = blocks.slice((first ?? 0) + 1, second).filter((n) => n.tagName === "p").length;
		expect(between * 300).toBeGreaterThanOrEqual(2400);
	});

	it("fails the build when two sentences sit too close to both get a place", () => {
		const B = "Adressen ristas inte.";
		const tree = root([p("Ett."), p(SENTENCE), p(B), long(3), long(4)]);
		expect(() => run(tree, SENTENCE, B)).toThrow(/no place to stand/);
	});
});

describe("stripPullQuote", () => {
	it("removes the pull quote and nothing else", () => {
		const html =
			'<p>Ett.</p><aside class="pull-quote" aria-hidden="true"><p>Två.</p></aside><p>Tre.</p>';
		expect(stripPullQuote(html)).toBe("<p>Ett.</p><p>Tre.</p>");
	});
});
