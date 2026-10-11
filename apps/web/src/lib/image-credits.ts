import creditsRaw from "../data/image-credits.json";

/**
 * IMAGE CREDITS — the machine-readable record of who made a picture that is not ours,
 * and on what terms we show it.
 *
 * The reader's credit is prose: it stands in the page's source apparatus (an essay's or
 * a pillar page's first note, an answer page's source list), never under the picture.
 * This registry is its twin for machines. The page templates read it into the
 * ImageObject structured data, which is what lets an image search show the licence and
 * the credit beside the picture.
 *
 * `src/data/image-credits.json` is keyed by the file's place under `src/assets/images/`
 * without its extension: `inline/kaba-1880-sadiq-bey`, `fakta/vad-ar-hajj`.
 *
 * ⚠️ No `astro:` import here. The rehype plugin loads this from astro.config.ts, before
 * Astro's virtual modules exist.
 */
export interface ImageCredit {
	/** »Foto« for a photograph, »Bild« for a reproduction of a page or an object. */
	kind: "Foto" | "Bild";
	/** The photographer, or the collection that holds the original. */
	by: string;
	/** The licence's short name as the source states it: "CC BY-SA 4.0", "Public domain". */
	licence: string;
	licenceUrl: string;
	/** The page that documents the picture and its licence. */
	source: string;
	/** What we did to it. The CC licences ask that a change is said. */
	changed?: string;
}

export const IMAGE_CREDITS: Readonly<Record<string, ImageCredit>> = creditsRaw as Record<
	string,
	ImageCredit
>;

/** `inline/kaba-1880-sadiq-bey` out of any path ending `…/images/inline/kaba-1880-sadiq-bey.webp`. */
export function imageKey(src: string): string | undefined {
	return /(?:^|\/)images\/([a-z0-9-]+\/[a-z0-9-]+)\.(?:webp|jpe?g|png)$/i.exec(src)?.[1];
}

export interface InlineFigure {
	key: string;
	alt: string;
	caption: string;
}

// A photograph on a line of its own: ![alt](path "caption"). The same shape
// rehype-photo-figure lifts into a <figure>; an image inside a sentence is not a figure.
const FIGURE_LINE = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)[ \t]*$/gm;

/** Every figure a Markdown body sets, in reading order. */
export function inlineFigures(body: string): InlineFigure[] {
	const figures: InlineFigure[] = [];
	for (const match of body.matchAll(FIGURE_LINE)) {
		const key = imageKey(match[2] ?? "");
		if (key) figures.push({ key, alt: match[1] ?? "", caption: match[3] ?? "" });
	}
	return figures;
}

/**
 * Rewrite every figure line of a Markdown body for a reader outside the repository: the
 * path becomes the published URL. A figure `urlFor` cannot resolve is dropped, caption
 * and all, because a Markdown twin that points at `../../apps/web/src/…` hands a
 * language model a link to nowhere.
 */
export function publishFigureLines(
	body: string,
	urlFor: (key: string) => string | undefined,
): string {
	return body.replace(FIGURE_LINE, (line: string, alt: string, path: string, caption?: string) => {
		const key = imageKey(path);
		if (!key) return line;
		const url = urlFor(key);
		return url ? `![${alt}](${url}${caption ? ` "${caption}"` : ""})` : "";
	});
}
