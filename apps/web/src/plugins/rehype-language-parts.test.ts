import { describe, expect, it } from "vitest";
import { rehypeLanguageParts } from "./rehype-language-parts";

// biome-ignore lint/suspicious/noExplicitAny: hand-built hAST, not the full mdast-util types
type Node = any;
const text = (value: string): Node => ({ type: "text", value });
const el = (tagName: string, properties: object, ...children: Node[]): Node => ({
	type: "element",
	tagName,
	properties,
	children,
});

const run = (node: Node): Node => {
	rehypeLanguageParts()(node);
	return node;
};

describe("rehypeLanguageParts", () => {
	// THE BUG (2026-10-30): the notes quote classical Arabic inline, unmarked, in text whose
	// language is Swedish, so a screen reader spoke it with a Swedish voice.
	it("marks an Arabic quotation in a Swedish note and leaves the Swedish around it", () => {
		const p = run(el("p", {}, text("Tillägget lyder ولا تقولوا هجرا, och an-Nawawī förklarar.")));
		expect(p.children.map((c: Node) => c.value ?? c.children[0].value)).toEqual([
			"Tillägget lyder ",
			"ولا تقولوا هجرا",
			", och an-Nawawī förklarar.",
		]);
		expect(p.children[1].properties).toEqual({ lang: "ar", dir: "rtl" });
	});

	it("keeps one quotation in one span across its own punctuation", () => {
		const p = run(el("p", {}, text("سدا لذريعة الشرك، فلما استقر التوحيد")));
		expect(p.children).toHaveLength(1);
		expect(p.children[0].children[0].value).toBe("سدا لذريعة الشرك، فلما استقر التوحيد");
	});

	// A verse says its language itself, and rehype-honorific sets the two signs.
	it("leaves what already carries a language, the honorifics and code alone", () => {
		const verse = el("p", { lang: "ar" }, text("قل هو الله أحد"));
		expect(run(el("div", {}, verse)).children[0].children[0]).toEqual(text("قل هو الله أحد"));
		expect(run(el("p", {}, text("profeten ﷺ sade"))).children).toEqual([text("profeten ﷺ sade")]);
		const code = el("code", {}, text("ولا"));
		expect(run(el("pre", {}, code)).children[0].children[0]).toEqual(text("ولا"));
	});
});
