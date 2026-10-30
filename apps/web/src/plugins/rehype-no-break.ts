import { noBreak } from "../lib/no-break";
import type { HastNode } from "./hast";
import { childrenOf, isElement, isText } from "./hast";

/** Code is reproduced as written, and the figure plugins read their fences as data. A
 *  heading's text becomes its id, and the slugger drops a no-break space where it turns a
 *  plain one into a hyphen, so »1 000 år« would change a #fragment already shared. */
const SKIP_TAGS = new Set(["code", "pre", "script", "style", "h1", "h2", "h3", "h4", "h5", "h6"]);

function walk(node: HastNode): void {
	for (const child of childrenOf(node)) {
		if (isText(child)) child.value = noBreak(child.value);
		else if (!(isElement(child) && SKIP_TAGS.has(child.tagName))) walk(child);
	}
}

/**
 * rehype-no-break: the markdown half of noBreak() in lib/format.ts, so a number, a date or a
 * reference does not part at the end of a line in an essay, an answer or a fördjupning.
 *
 * It runs after the plugins that match prose by its text (the verse attribution, the quote
 * attribution, the pull quote, whose sentence is compared with the paragraph) and before
 * the sidenotes, which copy the notes.
 */
export function rehypeNoBreak() {
	return (tree: HastNode) => walk(tree);
}
