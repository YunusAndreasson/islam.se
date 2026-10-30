import type { HastElement, HastNode, HastText } from "./hast";
import { childrenOf, isElement, isText } from "./hast";

/** Arabic letters, without the two honorifics (rehype-honorific labels those). */
const LETTERS =
	"\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDF9\\uFDFC-\\uFDFF\\uFE70-\\uFEFC";
/** A run: Arabic letters, and what stands between them inside one quotation. */
const RUN = new RegExp(`[${LETTERS}]+(?:[\\s\\u00A0،؛؟«»"()\\-–]*[${LETTERS}]+)*`, "gu");

const SKIP_TAGS = new Set(["code", "pre", "script", "style"]);

function arabicSpan(value: string): HastElement {
	return {
		type: "element",
		tagName: "span",
		properties: { lang: "ar", dir: "rtl" },
		children: [{ type: "text", value }],
	};
}

function split(node: HastText): HastNode[] | null {
	const parts: HastNode[] = [];
	let last = 0;
	for (const match of node.value.matchAll(RUN)) {
		if (match.index > last)
			parts.push({ type: "text", value: node.value.slice(last, match.index) });
		parts.push(arabicSpan(match[0]));
		last = match.index + match[0].length;
	}
	if (parts.length === 0) return null;
	if (last < node.value.length) parts.push({ type: "text", value: node.value.slice(last) });
	return parts;
}

function walk(node: HastNode): void {
	const children = childrenOf(node);
	for (let i = 0; i < children.length; i++) {
		const child = children[i];
		if (!child) continue;
		if (isText(child)) {
			const parts = split(child);
			if (parts) {
				children.splice(i, 1, ...parts);
				i += parts.length - 1;
			}
		} else if (!(isElement(child) && (SKIP_TAGS.has(child.tagName) || child.properties?.lang))) {
			walk(child);
		}
	}
}

/**
 * rehype-language-parts: marks a run of Arabic in Swedish prose, which is how the notes quote
 * their sources, with its language and direction (WCAG 3.1.2). Unmarked, a screen reader read
 * it with its Swedish voice, and a comma or a closing quote next to it could land on the wrong
 * side of the run, since the bidirectional algorithm guesses where a neighbour belongs and an
 * isolate does not have to. The verses mark themselves (rehype-quran-verse).
 */
export function rehypeLanguageParts() {
	return (tree: HastNode) => walk(tree);
}
