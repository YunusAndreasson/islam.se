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

	// Astro passes a Markdown image's properties to getImage, so these two are what turn
	// one 1400 px file into a srcset. Before them a phone downloaded the full-width
	// photograph (435 kB for the largest) to show it 350 px wide.
	it("asks for a photograph under src/assets/images in several widths", () => {
		const photo = img("Bildtext.");
		photo.properties.src = "../../apps/web/src/assets/images/inline/kaba-1880-sadiq-bey.webp";
		const image = run(root(el("p", photo))).children[0].children[0];
		expect(
			image.properties.widths,
			"a figure without `widths` ships one file to every screen",
		).toEqual(expect.arrayContaining([480, 1400]));
		expect(image.properties.sizes, "a srcset without `sizes` is read as 100vw").toContain("42rem");
	});

	// An image Astro does not resize keeps its attributes as written: `widths` on it
	// would be serialised as a meaningless HTML attribute.
	it("leaves an image from outside the asset folder untouched", () => {
		const image = run(root(el("p", img("Bildtext.")))).children[0].children[0];
		expect(image.properties.widths).toBeUndefined();
		expect(image.properties.sizes).toBeUndefined();
	});

	// AN UPRIGHT IS SET IN TWO THIRDS OF THE COLUMN. Across the whole measure a portrait
	// stood 806px tall and a manuscript leaf 1 060px: a screen of face between two
	// paragraphs (the El-Sayed essay, 2026-11-07). The class is what sets it narrower and
	// its caption beside it; `sizes` must follow, or the narrower picture fetches the
	// full-column file.
	describe("orientation", () => {
		const asset = (path: string, title = "Bildtext."): Node => {
			const photo = img(title);
			photo.properties.src = `../../apps/web/src/assets/images/inline/${path}`;
			return photo;
		};
		const sizes: Record<string, { width: number; height: number }> = {
			"portratt.webp": { width: 1100, height: 1320 },
			"gata.webp": { width: 1400, height: 933 },
		};
		const measure = async (tree: Node): Promise<Node> => {
			await rehypePhotoFigure({
				dimensions: async (src) => sizes[src.split("/").pop() ?? ""],
			})(tree);
			return tree;
		};

		it("marks a picture taller than wide as an upright and asks for a narrower file", async () => {
			const figure = (await measure(root(el("p", asset("portratt.webp"))))).children[0];
			expect(
				figure.properties.className,
				"an upright across the whole column fills a screen",
			).toContain("prose-figure--upright");
			expect(figure.children[0].properties.sizes).toContain("28rem");
		});

		it("leaves a landscape picture at the column's width", async () => {
			const figure = (await measure(root(el("p", asset("gata.webp"))))).children[0];
			expect(figure.properties.className).toEqual(["prose-figure"]);
			expect(figure.children[0].properties.sizes).toContain("42rem");
		});

		it("leaves a picture it cannot measure as a plain figure", async () => {
			const figure = (await measure(root(el("p", asset("okand.webp"))))).children[0];
			expect(figure.properties.className).toEqual(["prose-figure"]);
		});
	});
});
