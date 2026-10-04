import { type HastElement, type HastNode, type HastText, isElement } from "./hast";

/**
 * rehype-pull-quote: lifts sentences of an essay out as display pull quotes.
 *
 * Each sentence in the essay's `pullquotes` frontmatter must occur verbatim in one of
 * the essay's own top-level paragraphs — never in a blockquote, so a source can't be
 * lifted. One that matches nothing fails the build rather than rendering a line the
 * essay doesn't contain.
 *
 * Each stands in a gap between two plain paragraphs, about a screen of prose after its
 * sentence (before it only when that fits much better), and well apart from any other.
 *
 * The element is `aria-hidden`: the sentence is already in the prose. Anything that
 * consumes the rendered HTML outside the essay stylesheet (the RSS feed) must drop
 * it with `stripPullQuote`.
 *
 * ⚠️ Editing this file does not invalidate Astro's content cache — see the note at
 * the top of rehype-sidenotes.ts (`rm -f apps/web/.astro/data-store.json`).
 */

interface PullQuoteFile {
	path?: string;
	data?: { astro?: { frontmatter?: Record<string, unknown> } };
}

/** Roughly a desktop screen of prose: far enough that the sentence has scrolled away. */
const SCREEN = 1200;
const BEFORE_PENALTY = 400;

const normalize = (s: string): string => s.replace(/\s+/g, " ").trim();

function classes(node: HastElement): string[] {
	const c = node.properties?.className;
	return Array.isArray(c) ? c.map(String) : typeof c === "string" ? c.split(/\s+/) : [];
}

/** Paragraph text as read, without footnote markers or margin notes. */
function readText(node: HastNode): string {
	if (node.type === "text") return (node as HastText).value;
	if (isElement(node)) {
		if (node.tagName === "sup" || classes(node).includes("sidenote")) return "";
		return node.children.map(readText).join("");
	}
	return "children" in node && Array.isArray(node.children)
		? node.children.map(readText).join("")
		: "";
}

function pullQuote(text: string): HastElement {
	return {
		type: "element",
		tagName: "aside",
		properties: { className: ["pull-quote"], ariaHidden: "true" },
		children: [
			{ type: "element", tagName: "p", properties: {}, children: [{ type: "text", value: text }] },
		],
	};
}

/** The gap (between blocks[k-1] and blocks[k]) for one sentence, or undefined. */
function chooseGap(blocks: HastElement[], source: number, taken: number[]): number | undefined {
	// pos(i) = characters of prose before blocks[i].
	const before = [0];
	for (const b of blocks) before.push((before.at(-1) ?? 0) + normalize(readText(b)).length);
	const pos = (i: number) => before[i] ?? 0;

	const firstP = blocks.findIndex((b) => b.tagName === "p");
	const isP = (i: number) => blocks[i]?.tagName === "p";
	const distance = (k: number) => (k > source ? pos(k) - pos(source + 1) : pos(source) - pos(k));
	const rank = (k: number) => Math.abs(distance(k) - SCREEN) + (k > source ? 0 : BEFORE_PENALTY);
	const clear = (k: number) => taken.every((used) => Math.abs(pos(used) - pos(k)) >= 2 * SCREEN);

	const gaps: number[] = [];
	for (let k = firstP + 2; k < blocks.length; k++) {
		if (isP(k - 1) && isP(k) && clear(k)) gaps.push(k);
	}
	return gaps.sort((x, y) => rank(x) - rank(y))[0];
}

export function rehypePullQuote() {
	return (tree: HastNode, file?: PullQuoteFile) => {
		const raw = file?.data?.astro?.frontmatter?.pullquotes;
		const quotes = (Array.isArray(raw) ? raw : []).map((q) => normalize(String(q))).filter(Boolean);
		if (quotes.length === 0 || !("children" in tree && Array.isArray(tree.children))) return;
		const where = file?.path ?? "an essay";
		const blocks = tree.children.filter(isElement);
		const placed = new Map<number, string>();

		for (const quote of quotes) {
			const source = blocks.findIndex(
				(b) => b.tagName === "p" && normalize(readText(b)).includes(quote),
			);
			if (source === -1) {
				throw new Error(
					`pullquote in ${where} is not a sentence of the essay's own prose (blockquotes don't count). ` +
						`It must match a paragraph verbatim, typography included (»…«, –): "${quote}"`,
				);
			}
			const gap = chooseGap(blocks, source, [...placed.keys()]);
			if (gap === undefined) {
				throw new Error(
					`pullquote in ${where} has no place to stand: it needs a gap between two plain paragraphs, ` +
						`at least ${2 * SCREEN} characters from any other pull quote. "${quote}"`,
				);
			}
			placed.set(gap, quote);
		}

		for (const [gap, quote] of [...placed].sort((x, y) => y[0] - x[0])) {
			const before = blocks[gap - 1] as HastElement;
			tree.children.splice(tree.children.indexOf(before) + 1, 0, pullQuote(quote));
		}
	};
}

export function stripPullQuote(html: string): string {
	return html.replace(/<aside\b[^>]*class="pull-quote"[^>]*>[\s\S]*?<\/aside>/gi, "");
}
