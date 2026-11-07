import { dirname, resolve } from "node:path";
import sharp from "sharp";
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

/** An upright stands in two thirds of the column from 48rem (layout.css,
 *  `.prose-figure--upright`): 28rem, and the whole phone column under it. */
const UPRIGHT_SIZES = "(min-width: 48rem) 28rem, calc(100vw - 2.5rem)";

/** A picture's size in pixels. */
interface Dimensions {
	width: number;
	height: number;
}

export interface PhotoFigureOptions {
	/** Reads a picture's size from its `src` as written and the Markdown file it is
	 *  written in. Defaults to the file on disk, read with sharp; a test passes its own. */
	dimensions?: (src: string, markdownPath: string | undefined) => Promise<Dimensions | undefined>;
}

/** The picture on disk beside the Markdown that names it, measured. Only a file under
 *  src/assets/images/ is one of ours; anything else is left as written. */
async function fileDimensions(
	src: string,
	markdownPath: string | undefined,
): Promise<Dimensions | undefined> {
	if (!(markdownPath && imageKey(src))) return undefined;
	try {
		const { width, height } = await sharp(resolve(dirname(markdownPath), src)).metadata();
		return width && height ? { width, height } : undefined;
	} catch {
		return undefined;
	}
}

/** AN UPRIGHT IS SET IN TWO THIRDS OF THE COLUMN, its caption beside it (2026-11-07).
 *  Across the whole 42rem measure a portrait stood 806px tall and a manuscript leaf
 *  1 060px, a screen of face or parchment between two paragraphs; the reader scrolled
 *  past the picture to find the sentence it was set beside. Eighteen of the 75 inline
 *  pictures are taller than wide. */
function markUpright(figureNode: HastElement): void {
	const classes = figureNode.properties?.className;
	figureNode.properties = {
		...figureNode.properties,
		className: [...(Array.isArray(classes) ? classes : []), "prose-figure--upright"],
	};
	const image = figureNode.children[0];
	if (image && isElement(image) && image.properties?.sizes) {
		image.properties = { ...image.properties, sizes: UPRIGHT_SIZES };
	}
}

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

function walk(node: HastNode, figures: HastElement[]): void {
	if (!("children" in node && Array.isArray(node.children))) return;
	for (let i = 0; i < node.children.length; i++) {
		const child = node.children[i];
		if (!child) continue;
		if (isElement(child) && child.tagName === "p") {
			const image = loneImage(child);
			if (image) {
				const lifted = figure(image);
				node.children[i] = lifted;
				figures.push(lifted);
				continue;
			}
		}
		walk(child, figures);
	}
}

export function rehypePhotoFigure(options: PhotoFigureOptions = {}) {
	const dimensions = options.dimensions ?? fileDimensions;
	return (tree: HastNode, file?: { path?: string }): Promise<void> | undefined => {
		const figures: HastElement[] = [];
		walk(tree, figures);
		// Lifting is synchronous; measuring needs the file (or a test's own reader).
		if (figures.length === 0 || !(options.dimensions || file?.path)) return undefined;
		return Promise.all(
			figures.map(async (figureNode) => {
				const image = figureNode.children[0];
				if (!(image && isElement(image))) return;
				const size = await dimensions(String(image.properties?.src ?? ""), file?.path);
				if (size && size.height > size.width) markUpright(figureNode);
			}),
		).then(() => undefined);
	};
}
