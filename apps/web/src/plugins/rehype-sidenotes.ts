/**
 * rehype-sidenotes: project each footnote into the margin beside the line that cites it.
 *
 * An essay page runs a 42rem text column inside a 64rem frame. That leaves ~11rem
 * of gutter standing empty on each side while the essay's apparatus — 5 to 32 notes
 * of real quotation, mean 16.6 — sits collapsed at the very bottom of the document.
 * The geometry for Tufte's sidenote was already built; nothing was in it.
 *
 * GFM emits the note bodies at the END of the document (`<section data-footnotes>`),
 * so no stylesheet can move them: the content has to be relocated. This does it at
 * BUILD time rather than in the browser, which buys four things:
 *
 *   - Resize is free. Drag a window from 1400px to 800px and the sidenotes go away
 *     and the bottom list comes back, with no listener and no measurement.
 *   - It survives the ClientRouter for nothing. The markup is part of the swapped
 *     document; there is no mount, no AbortController, no astro:before-swap.
 *   - Zero CLS and zero main-thread cost — nothing is inserted after paint.
 *   - The note text sits where it is cited for a screen reader too, and the CSS
 *     branch guarantees the margin note and the bottom list are never both exposed.
 *
 * ⚠️ THE ELEMENT MUST BE A <span>, NOT AN <aside>.
 * `aside` closes an open `<p>` in the HTML tree-construction algorithm, and
 * @astrojs/markdown-remark runs rehype-raw (parse5) after these plugins — so an
 * <aside> spliced mid-paragraph would split the paragraph in the BUILD, not merely
 * in the browser. `float` blockifies the span, so nothing is lost by using one.
 *
 * ⚠️ SCOPED TO ESSAYS. The markdown processor in astro.config.ts is global: it also
 * renders the 64 svar and 9 fördjupning pages, which deliberately gather their notes
 * into their own "Noter" apparatus section. The path gate below is the only thing
 * keeping sidenotes out of them, and scripts/assert-full-build.mjs asserts it held.
 *
 * The `<section data-footnotes>` is left INTACT. It is the fallback below the
 * breakpoint, the print apparatus, and the source the footnote popover clones from.
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

function childrenOf(node: HastNode): HastNode[] {
	return "children" in node && Array.isArray(node.children) ? node.children : [];
}

/** Only the essay corpus. `data/svar` and `data/fordjupning` share this processor. */
const ESSAY_PATH = "/data/articles/";

/** GFM's id scheme, both ends of the pair. */
const FN_ID = /^user-content-fn-(.+)$/;

function hasProp(node: HastElement, key: string): boolean {
	return node.properties !== undefined && key in node.properties;
}

/** Deep clone, dropping the ↩ backref (it points at a marker, and in the margin the
 *  note is already beside it) and every `id` (the originals stay in the document, so
 *  copying ids would duplicate them). */
function cloneNote(node: HastNode): HastNode | null {
	if (!isElement(node)) return structuredClone(node) as HastNode;
	if (hasProp(node, "dataFootnoteBackref")) return null;
	const { id: _drop, ...properties } = node.properties ?? {};
	return {
		type: "element",
		tagName: node.tagName,
		properties,
		children: node.children.map(cloneNote).filter((c): c is HastNode => c !== null),
	};
}

/** The note body, unwrapped from its <li> and its single <p>. */
function noteContent(li: HastElement): HastNode[] {
	const cloned = li.children.map(cloneNote).filter((c): c is HastNode => c !== null);
	const elements = cloned.filter(isElement);
	// The overwhelmingly common shape is one <p>; lift it so the span carries inline
	// content and the float behaves as a single block. A multi-paragraph note keeps
	// its <p>s (a <p> inside a floated span is legal once the span is blockified).
	const only = elements[0];
	if (elements.length === 1 && only?.tagName === "p") return only.children;
	return cloned;
}

function sidenote(id: string, content: HastNode[]): HastElement {
	return {
		type: "element",
		tagName: "span",
		properties: { className: ["sidenote"], role: "note", dataFn: id },
		children: [
			{
				type: "element",
				tagName: "span",
				properties: { className: ["sidenote-num"] },
				children: [{ type: "text", value: id }],
			},
			...content,
		],
	};
}

/** slug → note body, read from the trailing <section data-footnotes>. */
function indexNotes(tree: HastNode): Map<string, HastNode[]> {
	const notes = new Map<string, HastNode[]>();
	const visit = (node: HastNode): void => {
		if (isElement(node) && node.tagName === "li") {
			const id = typeof node.properties?.id === "string" ? node.properties.id : "";
			const m = FN_ID.exec(id);
			const noteId = m?.[1];
			if (noteId) notes.set(noteId, noteContent(node));
		}
		for (const child of childrenOf(node)) visit(child);
	};
	const findSection = (node: HastNode): boolean => {
		if (isElement(node) && node.tagName === "section" && hasProp(node, "dataFootnotes")) {
			visit(node);
			return true;
		}
		return childrenOf(node).some(findSection);
	};
	findSection(tree);
	return notes;
}

/** The note id a `<sup>` cites, if it is a footnote reference at all. */
function refIdOf(sup: HastElement): string | null {
	for (const child of sup.children) {
		if (!isElement(child) || child.tagName !== "a") continue;
		if (!hasProp(child, "dataFootnoteRef")) continue;
		const href = typeof child.properties?.href === "string" ? child.properties.href : "";
		const m = FN_ID.exec(href.replace(/^#/, ""));
		const noteId = m?.[1];
		if (noteId) return noteId;
	}
	return null;
}

export function rehypeSidenotes() {
	return (tree: HastNode, file?: { path?: string }) => {
		if (!String(file?.path ?? "").includes(ESSAY_PATH)) return;

		const notes = indexNotes(tree);
		if (notes.size === 0) return;

		/** The note to project after this `<sup>`, or null if it is not a projectable
		 *  reference. Split out of the walker purely to keep that function readable. */
		const noteFor = (child: HastElement): HastElement | null => {
			if (child.tagName !== "sup") return null;
			const id = refIdOf(child);
			if (!id) return null;
			const content = notes.get(id);
			return content ? sidenote(id, content) : null;
		};

		// `inFootnotes` stops the pass from projecting notes that appear inside the
		// footnote section itself (a note citing another note), which would recurse.
		// `inList` is a guard, not a fix for anything live: no essay currently puts a
		// reference inside an <li>, and there the float geometry is wrong — such a
		// note simply stays at the bottom and keeps its popover.
		const walk = (node: HastNode, blocked: boolean): void => {
			const children = childrenOf(node);
			for (let i = 0; i < children.length; i++) {
				const child = children[i];
				if (!(child && isElement(child))) continue;

				if (!blocked) {
					const note = noteFor(child);
					if (note) {
						// Immediately AFTER the <sup>, in its own parent — a float finds the
						// nearest block container's right edge from wherever it sits, so it
						// works inside <em> or <cite> just as well as directly inside <p>.
						children.splice(i + 1, 0, note);
						i++;
						continue;
					}
				}

				const blocks =
					child.tagName === "li" ||
					(child.tagName === "section" && hasProp(child, "dataFootnotes"));
				walk(child, blocked || blocks);
			}
		};

		walk(tree, false);
	};
}
