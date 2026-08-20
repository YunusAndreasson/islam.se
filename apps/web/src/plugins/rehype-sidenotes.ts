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
 *
 * ⚠️ EDITING THIS FILE DOES NOT INVALIDATE THE CONTENT CACHE. Astro's content layer
 * stores rendered HTML in `node_modules/.astro/data-store.json`, and its key does not
 * include the rehype chain — so a build after a change here silently re-serves the
 * markup the OLD plugin produced. (The `.astro/data-store.json` at the project root is
 * a different, smaller file; deleting that one changes nothing.) Symptom: the edit
 * appears to do nothing at all, repeatably. Cure:
 *
 *     find apps/web/node_modules/.astro -maxdepth 1 -name data-store.json -delete
 *
 * Touching astro.config.ts also works, since a config change clears the store — which
 * is why an edit made alongside a config change seems to apply and one made alone does
 * not. That asymmetry is what makes this cost an hour instead of a minute.
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

/** The corpora that render notes in the margin. `data/svar` shares this processor and
 *  is deliberately absent: its 64 pages carry no footnotes at all — they cite through a
 *  `sources:` array in frontmatter — so there is nothing to project and the gate would
 *  only be a lie about what the page does.
 *
 *  Fördjupning was added 2026-08-20. It looked too dense to work — 46 notes a page
 *  against an essay's 16,6 — but the pages are proportionally longer, so the density
 *  that actually governs the margin is 1 note per 76 words against the essay's 1 per 84.
 *  What differs is what the notes SAY: an essay's are discursive, a pillar page's are
 *  bare citations ("Koranen, al-Hijr 15:9"). In the margin of a doctrinal page that is
 *  the better object of the two — a reader sees at a glance which claim rests on the
 *  Qurʾān and which on a jurist, without leaving the line. */
const NOTE_PATHS = ["/data/articles/", "/data/fordjupning/"];

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
		const path = String(file?.path ?? "");
		if (!NOTE_PATHS.some((dir) => path.includes(dir))) return;

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
