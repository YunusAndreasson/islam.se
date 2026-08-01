import { describe, expect, it } from "vitest";
import { rehypeHonorific } from "./rehype-honorific";

const SAW = "ﷺ";
const SWT = "ﷻ";

// Minimal hAST builders — the plugin only ever looks at type/tagName/children.
// biome-ignore lint/suspicious/noExplicitAny: hand-built hAST, not the full mdast-util types
type Node = any;
const text = (value: string): Node => ({ type: "text", value });
const el = (tagName: string, ...children: Node[]): Node => ({
	type: "element",
	tagName,
	children,
});
const root = (...children: Node[]): Node => ({ type: "root", children });

function run(tree: Node): Node {
	rehypeHonorific()(tree);
	return tree;
}

/** Every glyph that came out INSIDE a <span class="honorific">. */
function wrapped(node: Node, out: string[] = []): string[] {
	for (const child of node.children ?? []) {
		const classes = (child.properties?.className ?? []) as string[];
		if (classes.includes("honorific")) out.push(child.children[0].value);
		else wrapped(child, out);
	}
	return out;
}

/** Every glyph left as bare text — no span, so no accent colour, label or tooltip. */
function bare(node: Node, out: string[] = []): string[] {
	for (const child of node.children ?? []) {
		const classes = (child.properties?.className ?? []) as string[];
		if (classes.includes("honorific")) continue;
		if (child.type === "text") out.push(...(child.value.match(/[ﷺﷻ]/g) ?? []));
		else bare(child, out);
	}
	return out;
}

function plain(node: Node): string {
	if (node.type === "text") return node.value;
	return (node.children ?? []).map(plain).join("");
}

describe("rehypeHonorific", () => {
	it("wraps a glyph the author wrote in body text", () => {
		const tree = run(root(el("p", text(`Allah ${SWT} är en.`))));
		expect(wrapped(tree)).toEqual([SWT]);
		expect(bare(tree)).toEqual([]);
	});

	it("appends the honorific after the Swedish spelling of the Prophet's name", () => {
		const tree = run(root(el("p", text("Profeten Muhammed sade."))));
		expect(wrapped(tree)).toEqual([SAW]);
		expect(plain(tree)).toBe(`Profeten Muhammed ${SAW} sade.`);
	});

	// ⚠️ THE BUG (2026-07-30): blockquote/h1–h6 were added to SKIP_TAGS so the honorific
	// would not be INSERTED into a quotation — but skipping the subtree also stopped the
	// walk, so a glyph the author DID write inside a blockquote lost its span. That is
	// `.honorific`'s accent colour, its 0.65em sizing, its role=img + aria-label and its
	// tooltip, gone from the ﷺ/ﷻ in the blockquotes of 20 essays — the most prominent
	// quote blocks on the site. Suppress the insertion, never the wrap.
	it("still wraps a glyph the author wrote inside a blockquote", () => {
		const tree = run(root(el("blockquote", el("p", text(`Profeten ${SAW} sade.`)))));
		expect(wrapped(tree)).toEqual([SAW]);
		expect(bare(tree)).toEqual([]);
	});

	it("still wraps a glyph the author wrote in a heading", () => {
		const tree = run(root(el("h2", text(`Allah ${SWT}`))));
		expect(wrapped(tree)).toEqual([SWT]);
		expect(bare(tree)).toEqual([]);
	});

	it("never ADDS an honorific inside a quotation — a quote is reproduced as written", () => {
		const tree = run(root(el("blockquote", el("p", text("Muhammed sade.")))));
		expect(wrapped(tree)).toEqual([]);
		expect(plain(tree)).toBe("Muhammed sade.");
	});

	it("never ADDS an honorific in a heading", () => {
		const tree = run(root(el("h3", text("Vem var Muhammed?"))));
		expect(wrapped(tree)).toEqual([]);
		expect(plain(tree)).toBe("Vem var Muhammed?");
	});

	it("leaves code and superscripts entirely alone", () => {
		const tree = run(root(el("pre", el("code", text(`Muhammed ${SAW}`))), el("sup", text("1"))));
		expect(wrapped(tree)).toEqual([]);
		expect(plain(tree)).toBe(`Muhammed ${SAW}1`);
	});

	// TRAP: the Swedish Quran translator, not the Prophet — see NAME_FOLLOWERS.
	it("does not honour Muhammed Knut Bernström", () => {
		const tree = run(root(el("p", text("Muhammed Knut Bernström översatte Koranen."))));
		expect(wrapped(tree)).toEqual([]);
	});

	it("does not double an honorific the author already wrote", () => {
		const tree = run(root(el("p", text(`Profeten Muhammed ${SAW} sade.`))));
		expect(wrapped(tree)).toEqual([SAW]);
		expect(plain(tree)).toBe(`Profeten Muhammed ${SAW} sade.`);
	});
});
