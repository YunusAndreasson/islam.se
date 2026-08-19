import { describe, expect, it } from "vitest";
import { rehypeQuoteAttribution } from "./rehype-quote-attribution";

// Minimal hast builders — the plugin only reads type/tagName/children/value.
interface Node {
	type: string;
	tagName?: string;
	value?: string;
	properties?: Record<string, unknown>;
	children?: Node[];
}
type QuoteAttributionTree = Parameters<ReturnType<typeof rehypeQuoteAttribution>>[0];
const t = (value: string): Node => ({ type: "text", value });
const el = (tagName: string, children: Node[]): Node => ({
	type: "element",
	tagName,
	properties: {},
	children,
});
const root = (children: Node[]): Node => ({ type: "root", children });
const run = (tree: Node) => rehypeQuoteAttribution()(tree as QuoteAttributionTree);

function citeOf(blockquote: Node): string | null {
	const p = blockquote.children?.[0];
	if (!p) return null;
	const kids = p.children ?? [];
	const c = kids.find((k) => k.type === "element" && k.tagName === "cite");
	if (!c) return null;
	const text = (n: Node): string =>
		n.type === "text" ? (n.value ?? "") : (n.children ?? []).map(text).join("");
	return text(c);
}

describe("rehypeQuoteAttribution", () => {
	it("marks a plain source line", () => {
		const bq = el("blockquote", [el("p", [t("Ingenting är som Han.\n— Koranen 42:11")])]);
		run(root([bq]));
		expect(citeOf(bq)).toBe("— Koranen 42:11");
	});

	// The regression this file exists for. A literary source names its work in italics, so
	// the attribution ENDS in <em> rather than a text node — and the original implementation
	// bailed on `if (!isText(tail)) return`, silently dropping the <cite> for every quote
	// from Swedish literature. remark also splits the soft break into its own text node, so
	// no single node holds both the newline and the dash.
	it("marks an attribution that ends in markup, across split text nodes", () => {
		const bq = el("blockquote", [
			el("p", [
				t("Alltid har kvinnokroppen varit något att blygas över."),
				t("\n"),
				t("— Karin Boye, "),
				el("em", [t("Astarte")]),
			]),
		]);
		run(root([bq]));
		expect(citeOf(bq)).toBe("— Karin Boye, Astarte");
	});

	it("keeps the italics as markup inside the cite, not flattened text", () => {
		const bq = el("blockquote", [el("p", [t("Citat.\n— Karin Boye, "), el("em", [t("Astarte")])])]);
		run(root([bq]));
		const p = bq.children?.[0];
		const c = p?.children?.find((k) => k.type === "element" && k.tagName === "cite");
		const hasEm = c?.children?.some((k) => k.type === "element" && k.tagName === "em");
		expect(hasEm).toBe(true);
	});

	// A blockquote with no source line must come through untouched — and must not throw.
	// Removing the isText guard once made the fall-through call .trim() on an element,
	// which threw and cost the WHOLE document its attributions.
	it("leaves a quote without attribution alone", () => {
		const bq = el("blockquote", [el("p", [t("Bara ett citat utan källa.")])]);
		expect(() => run(root([bq]))).not.toThrow();
		expect(citeOf(bq)).toBeNull();
	});

	it("is idempotent", () => {
		const bq = el("blockquote", [el("p", [t("Citat.\n— Källa")])]);
		const tree = root([bq]);
		run(tree);
		run(tree);
		const kids = (bq.children?.[0]?.children ?? []).filter(
			(k) => k.type === "element" && k.tagName === "cite",
		);
		expect(kids).toHaveLength(1);
	});
});
