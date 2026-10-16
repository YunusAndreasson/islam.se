import { describe, expect, it } from "vitest";
import type { HastElement, HastNode } from "./hast";
import { rehypeSidenotes } from "./rehype-sidenotes";

/**
 * A footnote's text is projected into the margin beside the line that cites it. Pins the
 * margin's handling of a bare address (GFM's autolink, whose text IS its href): in a
 * 38-character column a full URL ran four lines beside the prose (2026-10-16), so the
 * margin shows the host and keeps the href, and the note at the foot keeps the address
 * whole. Plain link text is never rewritten.
 */

const text = (value: string): HastNode => ({ type: "text", value });
const el = (
	tagName: string,
	properties: Record<string, unknown>,
	children: HastNode[],
): HastElement => ({
	type: "element",
	tagName,
	properties,
	children,
});

const URL_ = "https://www.svt.se/kultur/tuffare-laleh-pa-nya-albumet";

function essay(noteChildren: HastNode[]): HastElement {
	return el("root", {}, [
		el("p", {}, [
			text("Sången har ett omdöme."),
			el("sup", {}, [el("a", { href: "#user-content-fn-1", dataFootnoteRef: "" }, [text("1")])]),
		]),
		el("section", { dataFootnotes: "" }, [
			el("ol", {}, [el("li", { id: "user-content-fn-1" }, [el("p", {}, noteChildren)])]),
		]),
	]);
}

const run = (tree: HastElement): HastElement => {
	rehypeSidenotes()(tree, { path: "/repo/data/articles/goliat.md" });
	return tree;
};

const linksIn = (
	node: HastNode,
	inside: (n: HastElement) => boolean,
	found: HastElement[] = [],
): HastElement[] => {
	if (node.type === "element") {
		const element = node as HastElement;
		if (element.tagName === "a" && inside(element)) found.push(element);
		for (const child of element.children) linksIn(child, inside, found);
	} else if ("children" in node && node.children) {
		for (const child of node.children) linksIn(child, inside, found);
	}
	return found;
};

const sidenoteOf = (tree: HastElement): HastElement => {
	const p = tree.children[0] as HastElement;
	return p.children.find(
		(c): c is HastElement => c.type === "element" && (c as HastElement).tagName === "span",
	) as HastElement;
};

const textOf = (a: HastElement): string =>
	a.children.map((c) => (c.type === "text" ? (c as { value: string }).value : "")).join("");

describe("rehypeSidenotes: a bare address in the margin", () => {
	it("shows the host, keeps the href", () => {
		const tree = run(
			essay([text("Tali da Silva, svt, "), el("a", { href: URL_ }, [text(URL_)]), text(".")]),
		);
		const [link] = linksIn(sidenoteOf(tree), () => true);
		expect(link?.properties?.href, "the address a reader follows is unchanged").toBe(URL_);
		expect(textOf(link as HastElement), "four lines of path in a 38-character column").toBe(
			"svt.se",
		);
	});

	it("leaves the note at the foot of the page with the whole address", () => {
		const tree = run(essay([el("a", { href: URL_ }, [text(URL_)])]));
		const section = tree.children[1] as HastElement;
		const [footLink] = linksIn(section, () => true);
		expect(textOf(footLink as HastElement)).toBe(URL_);
	});

	it("never rewrites a link whose text is words", () => {
		const tree = run(essay([el("a", { href: URL_ }, [text("SVT:s recension")])]));
		const [link] = linksIn(sidenoteOf(tree), () => true);
		expect(textOf(link as HastElement)).toBe("SVT:s recension");
	});
});
