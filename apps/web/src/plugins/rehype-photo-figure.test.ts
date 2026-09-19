import { describe, expect, it } from "vitest";
import { rehypePhotoFigure } from "./rehype-photo-figure";

// Minimal hAST builders — the plugin only reads type/tagName/properties/children.
// biome-ignore lint/suspicious/noExplicitAny: hand-built hAST, not the full hast types
type Node = any;
const text = (value: string): Node => ({ type: "text", value });
const img = (title?: string): Node => ({
	type: "element",
	tagName: "img",
	properties: {
		src: "/x.webp",
		alt: "En flicka går ensam på en gata mellan ruiner.",
		...(title ? { title } : {}),
	},
	children: [],
});
const el = (tagName: string, ...children: Node[]): Node => ({ type: "element", tagName, children });
const root = (...children: Node[]): Node => ({ type: "root", children });

const run = (tree: Node): Node => {
	rehypePhotoFigure()(tree);
	return tree;
};

describe("rehypePhotoFigure", () => {
	it("lifts a lone image out of its paragraph and shows the title as a caption", () => {
		const tree = run(root(el("p", img("Gaza City, augusti 2024."))));
		const figure = tree.children[0];
		expect(figure.tagName).toBe("figure");
		expect(figure.properties.className).toEqual(["prose-figure"]);
		expect(figure.children[0].tagName).toBe("img");
		// The title would otherwise only ever surface as a mouse-pointer tooltip.
		expect(figure.children[0].properties.title).toBeUndefined();
		expect(figure.children[1].tagName).toBe("figcaption");
		expect(figure.children[1].children[0].value).toBe("Gaza City, augusti 2024.");
	});

	it("keeps the figure caption-less when the author wrote no title", () => {
		const figure = run(root(el("p", img()))).children[0];
		expect(figure.tagName).toBe("figure");
		expect(figure.children).toHaveLength(1);
	});

	// An image inside a sentence must stay in the sentence: a <figure> cannot live inside
	// a <p>, and hoisting it would cut the sentence in two.
	it("leaves an image that sits in running text alone", () => {
		const tree = run(root(el("p", text("Före bilden "), img("Bildtext."), text(" efter."))));
		expect(tree.children[0].tagName).toBe("p");
		expect(tree.children[0].children[1].properties.title).toBe("Bildtext.");
	});

	it("finds the image however deep the paragraph sits", () => {
		const tree = run(root(el("article", el("section", el("p", img("Bildtext."))))));
		expect(tree.children[0].children[0].children[0].tagName).toBe("figure");
	});
});
