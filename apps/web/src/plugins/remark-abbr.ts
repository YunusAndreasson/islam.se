/**
 * remark-abbr: wraps sequences of 2+ uppercase letters (including Swedish Å/Ä/Ö)
 * in <abbr> tags so the CSS `abbr { font-variant-caps: all-small-caps }` rule
 * activates automatically for acronyms like FN, MSB, UNESCO, FN:s.
 *
 * Skips headings and code nodes.
 * Handles Swedish possessive suffix: "FN:s" → <abbr>FN:s</abbr>
 */

// Matches 2+ consecutive uppercase letters, optionally followed by :suffix (FN:s, MSB:s)
const ACRONYM_RE =
	/(?<![A-Za-z\u00C0-\u024F])([A-Z\u00C5\u00C4\u00D6]{2,}(?::[a-z\u00E5\u00E4\u00F6]+)?)(?![A-Za-z\u00C0-\u024F])/g;

function splitAcronyms(text: string): { type: string; value: string }[] | null {
	ACRONYM_RE.lastIndex = 0;
	if (!ACRONYM_RE.test(text)) return null;
	ACRONYM_RE.lastIndex = 0;

	const nodes: { type: string; value: string }[] = [];
	let last = 0;
	let m: RegExpExecArray | null;

	while ((m = ACRONYM_RE.exec(text)) !== null) {
		if (m.index > last) nodes.push({ type: "text", value: text.slice(last, m.index) });
		nodes.push({ type: "html", value: `<abbr>${m[1]}</abbr>` });
		last = m.index + m[0].length;
	}

	if (last < text.length) nodes.push({ type: "text", value: text.slice(last) });
	return nodes;
}

// Minimal AST walker — no external deps needed
function walk(node: any, index: number | null, parent: any): void {
	if (
		node.type === "text" &&
		index !== null &&
		parent &&
		parent.type !== "heading" &&
		parent.type !== "code" &&
		parent.type !== "inlineCode"
	) {
		const replacement = splitAcronyms(node.value);
		if (replacement) {
			parent.children.splice(index, 1, ...replacement);
			return; // html nodes have no children; no need to recurse
		}
	}

	if (Array.isArray(node.children)) {
		for (let i = 0; i < node.children.length; i++) {
			const before = node.children.length;
			walk(node.children[i], i, node);
			i += node.children.length - before; // adjust for any insertions
		}
	}
}

export function remarkAbbr() {
	return (tree: any) => walk(tree, null, null);
}
