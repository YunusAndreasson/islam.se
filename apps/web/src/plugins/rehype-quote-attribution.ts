/**
 * rehype-quote-attribution: give a blockquote's closing attribution its own line.
 *
 * A svar page closes a quote with a source line:
 *
 *     > Ingenting är som Han.
 *     > — Koranen 42:11
 *
 * Markdown joins consecutive `>` lines into ONE paragraph separated by a soft
 * break, so that renders as `Ingenting är som Han.\n— Koranen 42:11` inside a
 * single <p> — and HTML collapses the newline to a space. On screen the citation
 * therefore runs straight on from the quoted words, in the same size and colour,
 * reading as part of the sentence: "Ingenting är som Han. — Koranen 42:11".
 *
 * This wraps that trailing run in `<cite class="q-attr">` so CSS can set it on its
 * own line in muted, smaller type. Nothing is added or removed — the attribution
 * text is exactly the author's — it is only marked up as what it already is.
 *
 * Runs AFTER rehype-quran-verse, which detects the same line to decide whether a
 * recitation player belongs after the block. That pass reads the paragraph's full
 * text, so it is indifferent to the extra element; ordering it second simply keeps
 * player detection reading the shape it was written against.
 *
 * Both spellings are handled: the common one-paragraph form above, and the form
 * where the author left a blank `>` line and markdown produced a second <p>.
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

const isElement = (n: HastNode): n is HastElement => n.type === "element";
const isText = (n: HastNode): n is HastText => n.type === "text";

/** An attribution is an em dash (the house reserves it for exactly this) followed
 *  by a source. Anchored to the end of the paragraph so a dash used mid-quotation
 *  is never mistaken for a citation. */
const TRAILING_ATTRIBUTION = /\n[ \t]*(—\s*[^\n]+)$/;
/** The two-paragraph spelling: the whole paragraph is the attribution. */
const WHOLE_ATTRIBUTION = /^(—\s*\S[^\n]*)$/;

const cite = (value: string): HastElement => ({
	type: "element",
	tagName: "cite",
	properties: { className: ["q-attr"] },
	children: [{ type: "text", value }],
});

function childrenOf(node: HastNode): HastNode[] {
	return "children" in node && Array.isArray(node.children) ? node.children : [];
}

/** Split the closing attribution out of a blockquote's last paragraph. */
function markAttribution(block: HastElement): void {
	const paras = childrenOf(block).filter((c) => isElement(c) && c.tagName === "p") as HastElement[];
	const last = paras[paras.length - 1];
	if (!last) return;

	// Already marked (idempotent — the pipeline may run twice in dev).
	if (last.children.some((c) => isElement(c) && c.tagName === "cite")) return;

	// Two-paragraph form: the final <p> is nothing but the attribution.
	if (paras.length > 1 && last.children.length === 1) {
		const only = last.children[0];
		if (isText(only) && WHOLE_ATTRIBUTION.test(only.value.trim())) {
			last.properties = { ...(last.properties ?? {}), className: ["q-attr-p"] };
			return;
		}
	}

	// remark can leave a whitespace-only text node at the very end of a paragraph, so
	// the attribution is not always the literal last child. Ignore that trailing
	// padding when deciding what closes the quote.
	let end = last.children.length - 1;
	while (end >= 0) {
		const n = last.children[end];
		if (isText(n) && n.value.trim() === "") end--;
		else break;
	}
	if (end < 0) return;
	const tail = last.children[end];
	if (!isText(tail)) return;

	// One-paragraph form: the attribution trails the quote after a soft break, so it
	// sits in the same text node behind a newline.
	const m = TRAILING_ATTRIBUTION.exec(tail.value);
	if (m) {
		tail.value = tail.value.slice(0, m.index);
		last.children.splice(end + 1, last.children.length - end - 1, cite(m[1]));
		return;
	}

	// Verse-per-line form: the author set the quote with markdown hard breaks, so the
	// line break before the attribution became a <br> element and the attribution is a
	// text node of its own. remark leaves a bare "\n" text node between the two, so the
	// <br> is not the immediately preceding child — skip whitespace to find it. Drop
	// that <br>: the citation is styled display:block, so keeping it would open a blank
	// line above the source.
	if (!WHOLE_ATTRIBUTION.test(tail.value.trim())) return;
	let br = end - 1;
	while (br >= 0) {
		const n = last.children[br];
		if (isText(n) && n.value.trim() === "") br--;
		else break;
	}
	if (br < 0) return;
	const before = last.children[br];
	if (!isElement(before) || before.tagName !== "br") return;

	last.children.splice(br, last.children.length - br, cite(tail.value.trim()));
}

function walk(node: HastNode): void {
	if (isElement(node) && node.tagName === "blockquote") markAttribution(node);
	for (const child of childrenOf(node)) walk(child);
}

export function rehypeQuoteAttribution() {
	return (tree: HastNode) => {
		walk(tree);
	};
}
