/**
 * rehype-honorific: wraps Islamic honorific Unicode characters in
 * <span class="honorific honorific--swt|saw"> as proper hAST nodes, and
 * appends ﷺ after the Prophet's name where the author did not write it.
 *
 * Must run as rehype (not remark) because remark raw HTML nodes
 * get sanitized by rehype-raw, stripping extra classes/attributes.
 *
 * Targets:
 *   ﷻ  U+FDFB  (jalla jalaluhu)
 *   ﷺ  U+FDFA  (sallallahu alayhi wa salam)
 *
 * Only the Swedish spelling "Muhammed" triggers insertion. The transliterated
 * "Muhammad" is ambiguous in this corpus — Muhammad Sālih al-Munajjid,
 * Muhammad XII of Granada, "Muhammad bin ..." — so it is left alone.
 *
 * TRAP: "Muhammed Knut Bernström" is the Swedish Quran translator, not the
 * Prophet. Any further person whose given name is spelled the Swedish way must
 * be added to NAME_FOLLOWERS or they will be given the honorific.
 */

interface HastText {
	type: "text";
	value: string;
}

interface HastElement {
	type: "element";
	tagName: string;
	properties?: Record<string, unknown>;
	children: HastNode[];
}

type HastNode = HastText | HastElement | { type: string; children?: HastNode[] };

const SAW = "ﷺ";
const SWT = "ﷻ";

/** Honorific glyph, or the Prophet's name in its Swedish spelling. */
const TOKEN_RE = /([ﷻﷺ])|\b(Muhammeds?)\b/g;

/** Next word that means this "Muhammed" is somebody else. */
const NAME_FOLLOWERS = /^\s+(Knut)\b/;

/** Already carries the honorific — the glyph is picked up on the next match. */
const ALREADY_HONOURED = new RegExp(`^\\s*${SAW}`);

/** Quotations, headings and code are reproduced as written. */
const SKIP_TAGS = new Set([
	"code",
	"pre",
	"blockquote",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"sup",
	"script",
	"style",
]);

const MEANING = {
	saw: {
		sv: "Guds frid och välsignelser vare över honom",
		tip: "sallallahu alayhi wa sallam – Guds frid och välsignelser vare över honom",
	},
	swt: {
		sv: "upphöjd är Hans majestät",
		tip: "jalla jalaluhu – upphöjd är Hans majestät",
	},
} as const;

function honorificNode(glyph: string): HastElement {
	const code = glyph === SWT ? "swt" : "saw";
	const meaning = MEANING[code];
	return {
		type: "element",
		tagName: "span",
		properties: {
			className: ["honorific", `honorific--${code}`],
			role: "img",
			"aria-label": meaning.sv,
			"data-tip": meaning.tip,
			// -1, not 0: tap focuses the glyph so the tooltip can open on touch,
			// without putting 143 stops into an essay's tab order.
			tabIndex: -1,
		},
		children: [{ type: "text", value: glyph }],
	};
}

function visitText(node: HastText, index: number, parent: HastElement): void {
	if (typeof node.value !== "string") return;

	TOKEN_RE.lastIndex = 0;
	if (!TOKEN_RE.test(node.value)) return;
	TOKEN_RE.lastIndex = 0;

	const parts: HastNode[] = [];
	let last = 0;
	let changed = false;
	let m: RegExpExecArray | null = TOKEN_RE.exec(node.value);

	while (m !== null) {
		if (m.index > last) {
			parts.push({ type: "text", value: node.value.slice(last, m.index) });
		}
		last = m.index + m[0].length;

		if (m[1]) {
			parts.push(honorificNode(m[1]));
			changed = true;
		} else {
			parts.push({ type: "text", value: m[2] });
			const rest = node.value.slice(last);
			if (!(ALREADY_HONOURED.test(rest) || NAME_FOLLOWERS.test(rest))) {
				parts.push({ type: "text", value: " " });
				parts.push(honorificNode(SAW));
				changed = true;
			}
		}

		m = TOKEN_RE.exec(node.value);
	}

	if (!changed) return;

	if (last < node.value.length) {
		parts.push({ type: "text", value: node.value.slice(last) });
	}

	parent.children.splice(index, 1, ...parts);
}

function walk(node: HastNode): void {
	if (!("children" in node && node.children)) return;

	for (let i = 0; i < node.children.length; i++) {
		const child = node.children[i];
		if (child.type === "text") {
			const before = node.children.length;
			visitText(child as HastText, i, node as HastElement);
			i += node.children.length - before;
		} else if (child.type === "element" && !SKIP_TAGS.has((child as HastElement).tagName)) {
			walk(child);
		}
	}
}

export function rehypeHonorific() {
	return (tree: HastNode) => walk(tree);
}
