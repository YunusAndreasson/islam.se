import { imageKey } from "../lib/image-credits";
import { type HastElement, type HastNode, isElement, isText } from "./hast";

/**
 * rehype-photo-figure: a photograph on its own line becomes a <figure> with a caption.
 *
 * Markdown has no figure. An image written on its own line:
 *
 *     ![En flicka går ensam …](../../apps/web/src/assets/images/inline/x.webp "Gaza City, augusti 2024.")
 *
 * renders as `<p><img …></p>`, which gives the photograph the vertical rhythm of a
 * paragraph and drops the title on the floor — a caption no one but a mouse pointer
 * ever sees. This lifts that paragraph to `<figure class="prose-figure">` and writes
 * the title out as a visible `<figcaption>`, the same apparatus the ```chart, ```table
 * and ```timeline fences already have.
 *
 * ⚠️ ONLY when the paragraph holds nothing but the image (whitespace aside). An image
 * inside running text stays where the author put it: lifting it would tear the sentence
 * in half, and hoisting a <figure> out of a <p> is invalid HTML besides.
 *
 * The caption describes; attribution for a licensed photograph belongs in the essay's
 * source apparatus (the footnotes), as it does for the hero — see `imageCaption` in
 * src/content.config.ts. The machine-readable twin of that credit, for the structured
 * data, is src/data/image-credits.json (lib/image-credits.ts).
 *
 * The figure also asks for its picture in several widths. Astro hands a Markdown
 * image's properties straight to `getImage`, so `widths` and `sizes` set here come out
 * as a `srcset`. Without them every reader, on a phone too, downloaded the one 1400 px
 * file: 435 kB for the widest photograph in the archive.
 */

/** The reading column is 42rem (672 px). 720 and 1400 are that column at 1× and 2×;
 *  480 and 960 are a phone's. Astro drops any width the source file cannot fill. */
const FIGURE_WIDTHS = [480, 720, 960, 1400];
const FIGURE_SIZES = "(min-width: 45rem) 42rem, calc(100vw - 2.5rem)";

/** The image, if this paragraph is nothing but one. */
function loneImage(paragraph: HastElement): HastElement | null {
	let found: HastElement | null = null;
	for (const child of paragraph.children) {
		if (isText(child)) {
			if (child.value.trim() !== "") return null;
			continue;
		}
		if (isElement(child) && child.tagName === "img" && !found) {
			found = child;
			continue;
		}
		return null;
	}
	return found;
}

function figure(image: HastElement): HastElement {
	const title = String(image.properties?.title ?? "").trim();
	if (image.properties) delete image.properties.title;
	// Only a file under src/assets/images/ is one Astro resizes. On any other image
	// `widths` would come out as a stray HTML attribute and no srcset at all.
	if (imageKey(String(image.properties?.src ?? ""))) {
		image.properties = { ...image.properties, widths: FIGURE_WIDTHS, sizes: FIGURE_SIZES };
	}
	const children: HastNode[] = [image];
	if (title) {
		children.push({
			type: "element",
			tagName: "figcaption",
			properties: { className: ["prose-figure-caption"] },
			children: [{ type: "text", value: title }],
		});
	}
	return {
		type: "element",
		tagName: "figure",
		properties: { className: ["prose-figure"] },
		children,
	};
}

function walk(node: HastNode): void {
	if (!("children" in node && Array.isArray(node.children))) return;
	for (let i = 0; i < node.children.length; i++) {
		const child = node.children[i];
		if (!child) continue;
		if (isElement(child) && child.tagName === "p") {
			const image = loneImage(child);
			if (image) {
				node.children[i] = figure(image);
				continue;
			}
		}
		walk(child);
	}
}

export function rehypePhotoFigure() {
	return (tree: HastNode) => walk(tree);
}
