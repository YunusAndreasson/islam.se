/**
 * rehype-honorific: wraps Islamic honorific Unicode characters in
 * <span class="honorific honorific--swt|saw"> as proper hAST nodes.
 *
 * Must run as rehype (not remark) because remark raw HTML nodes
 * get sanitized by rehype-raw, stripping extra classes/attributes.
 *
 * Targets:
 *   ﷻ  U+FDFB  (jalla jalaluhu)
 *   ﷺ  U+FDFA  (sallallahu alayhi wa salam)
 */

const HONORIFIC_RE = /(\uFDFB|\uFDFA)/g;

function codeFor(ch: string): string {
	return ch === "\uFDFB" ? "swt" : "saw";
}

function visitText(node: any, index: number, parent: any): void {
	if (typeof node.value !== "string") return;

	HONORIFIC_RE.lastIndex = 0;
	if (!HONORIFIC_RE.test(node.value)) return;
	HONORIFIC_RE.lastIndex = 0;

	const parts: any[] = [];
	let last = 0;
	let m: RegExpExecArray | null;

	while ((m = HONORIFIC_RE.exec(node.value)) !== null) {
		if (m.index > last) {
			parts.push({ type: "text", value: node.value.slice(last, m.index) });
		}
		const code = codeFor(m[1]);
		parts.push({
			type: "element",
			tagName: "span",
			properties: { className: ["honorific", `honorific--${code}`] },
			children: [{ type: "text", value: m[1] }],
		});
		last = m.index + m[0].length;
	}

	if (last < node.value.length) {
		parts.push({ type: "text", value: node.value.slice(last) });
	}

	parent.children.splice(index, 1, ...parts);
}

function walk(node: any): void {
	if (!node.children) return;

	for (let i = 0; i < node.children.length; i++) {
		const child = node.children[i];
		if (child.type === "text") {
			const before = node.children.length;
			visitText(child, i, node);
			i += node.children.length - before;
		} else if (child.type === "element" && child.tagName !== "code" && child.tagName !== "pre") {
			walk(child);
		}
	}
}

export function rehypeHonorific() {
	return (tree: any) => walk(tree);
}
