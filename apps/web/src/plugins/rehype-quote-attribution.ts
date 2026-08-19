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
/** Where an attribution BEGINS, for the case where it ends in markup rather than text
 *  (a work title in italics), so the anchored form above can never match. */
const TRAILING_ATTRIBUTION_OPEN = /\n[ \t]*—\s*\S/;
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

/** Concatenated text of a subtree. */
function textOf(node: HastNode): string {
	if (isText(node)) return node.value;
	return childrenOf(node).map(textOf).join("");
}

/** Index of the LAST match of a global-less pattern, or -1. */
function lastMatchIndex(haystack: string, pattern: RegExp): number {
	const re = new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`);
	let idx = -1;
	for (const m of haystack.matchAll(re)) idx = m.index ?? idx;
	return idx;
}

/** Trailing padding: remark can leave a whitespace-only text node at the end of a
 *  paragraph, so the attribution is not always the literal last child. */
function lastMeaningfulIndex(children: HastNode[]): number {
	let end = children.length - 1;
	while (end >= 0) {
		const n = children[end];
		if (n && isText(n) && n.value.trim() === "") end--;
		else break;
	}
	return end;
}

/** Two-paragraph spelling: the final <p> is nothing but the attribution. */
function markWholeParagraph(paras: HastElement[], last: HastElement): boolean {
	if (paras.length <= 1 || last.children.length !== 1) return false;
	const only = last.children[0];
	if (!(only && isText(only) && WHOLE_ATTRIBUTION.test(only.value.trim()))) return false;
	last.properties = { ...(last.properties ?? {}), className: ["q-attr-p"] };
	return true;
}

/** One-paragraph spelling: the attribution trails the quote after a soft break, inside
 *  the same text node. */
function markTrailingText(last: HastElement, end: number): boolean {
	const tail = last.children[end];
	if (!(tail && isText(tail))) return false;
	const m = TRAILING_ATTRIBUTION.exec(tail.value);
	if (!m) return false;
	tail.value = tail.value.slice(0, m.index);
	const attribution = m[1];
	if (!attribution) return false;
	last.children.splice(end + 1, last.children.length - end - 1, cite(attribution));
	return true;
}

/** Verse-per-line spelling: markdown hard breaks turned the line break before the
 *  attribution into a <br>, and the attribution is a text node of its own. Drop the <br>:
 *  the citation is styled display:block, so keeping it would open a blank line above. */
function markAfterHardBreak(last: HastElement, end: number): boolean {
	const tail = last.children[end];
	if (!(tail && isText(tail) && WHOLE_ATTRIBUTION.test(tail.value.trim()))) return false;
	let br = end - 1;
	while (br >= 0) {
		const n = last.children[br];
		if (n && isText(n) && n.value.trim() === "") br--;
		else break;
	}
	if (br < 0) return false;
	const before = last.children[br];
	if (!(before && isElement(before)) || before.tagName !== "br") return false;
	last.children.splice(br, last.children.length - br, cite(tail.value.trim()));
	return true;
}

/** General spelling, and the one a literary source takes: the attribution NAMES A WORK
 *  and so ends in markup — "— Karin Boye, *Astarte*" closes with <em>, never a text node,
 *  so none of the branches above can see it. remark also does not guarantee the soft break
 *  and the dash land in the SAME text node (it may emit ["…makt.", "\n", "— Karin Boye, ",
 *  <em>]). So match on the paragraph's concatenated text, map the offset back to the child
 *  that owns it, and wrap from there to the end — keeping the italics inside the <cite>
 *  instead of flattening them to plain text. */
function markSpanningMarkup(last: HastElement): boolean {
	const offsets: { node: HastText; start: number }[] = [];
	let joined = "";
	for (const child of last.children) {
		if (isText(child)) {
			offsets.push({ node: child, start: joined.length });
			joined += child.value;
		} else {
			joined += textOf(child);
		}
	}
	const open = lastMatchIndex(joined, TRAILING_ATTRIBUTION_OPEN);
	if (open < 0) return false;
	const owner = [...offsets].reverse().find((o) => o.start <= open);
	if (!owner) return false;
	const cut = open - owner.start;
	const head = owner.node.value.slice(cut).replace(/^\n[ \t]*/, "");
	owner.node.value = owner.node.value.slice(0, cut);
	const ownerIndex = last.children.indexOf(owner.node);
	const rest = last.children.splice(ownerIndex + 1, last.children.length - ownerIndex - 1);
	const wrapper = cite(head);
	wrapper.children.push(...rest.filter((n) => !(isText(n) && n.value.trim() === "")));
	last.children.push(wrapper);
	return true;
}

/** Split the closing attribution out of a blockquote's last paragraph. */
function markAttribution(block: HastElement): void {
	const paras = childrenOf(block).filter((c) => isElement(c) && c.tagName === "p") as HastElement[];
	const last = paras[paras.length - 1];
	if (!last) return;
	// Idempotent — the pipeline may run twice in dev.
	if (last.children.some((c) => isElement(c) && c.tagName === "cite")) return;
	if (markWholeParagraph(paras, last)) return;

	const end = lastMeaningfulIndex(last.children);
	if (end < 0) return;
	if (markTrailingText(last, end)) return;
	if (markAfterHardBreak(last, end)) return;
	markSpanningMarkup(last);
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
