/**
 * remark-honorific: wraps Islamic honorific Unicode characters in <span class="honorific">
 * so they can be styled with CSS (size, color, spacing).
 *
 * Targets:
 *   ﷻ  U+FDFB  (jalla jalaluhu — subhanahu wa ta'ala)
 *   ﷺ  U+FDFA  (sallallahu alayhi wa salam)
 */

const HONORIFIC_RE = /(\uFDFB|\uFDFA)/g;

const TITLES: Record<string, string> = {
	"\uFDFB": "Jalla jalāluhu — upphöjd är Hans majestät",
	"\uFDFA": "Ṣallallāhu ʿalayhi wa-sallam — Guds frid och välsignelser vare med honom",
};

function splitHonorifics(text: string): { type: string; value: string }[] | null {
	HONORIFIC_RE.lastIndex = 0;
	if (!HONORIFIC_RE.test(text)) return null;
	HONORIFIC_RE.lastIndex = 0;

	const nodes: { type: string; value: string }[] = [];
	let last = 0;
	let m: RegExpExecArray | null;

	while ((m = HONORIFIC_RE.exec(text)) !== null) {
		if (m.index > last) nodes.push({ type: "text", value: text.slice(last, m.index) });
		const title = TITLES[m[1]] ?? "";
		nodes.push({ type: "html", value: `<span class="honorific" title="${title}">${m[1]}</span>` });
		last = m.index + m[0].length;
	}

	if (last < text.length) nodes.push({ type: "text", value: text.slice(last) });
	return nodes;
}

function walk(node: any, index: number | null, parent: any): void {
	if (
		node.type === "text" &&
		index !== null &&
		parent &&
		parent.type !== "code" &&
		parent.type !== "inlineCode"
	) {
		const replacement = splitHonorifics(node.value);
		if (replacement) {
			parent.children.splice(index, 1, ...replacement);
			return;
		}
	}

	if (Array.isArray(node.children)) {
		for (let i = 0; i < node.children.length; i++) {
			const before = node.children.length;
			walk(node.children[i], i, node);
			i += node.children.length - before;
		}
	}
}

export function remarkHonorific() {
	return (tree: any) => walk(tree, null, null);
}
