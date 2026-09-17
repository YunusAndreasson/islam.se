/**
 * rehype-heading-anchor: gives every section heading a permalink the reader can see.
 *
 * Astro's slugger already puts an `id` on every markdown heading — that is what
 * Innehall.astro links to via `heading.slug`, so the targets have always existed on all
 * essays, answers and fördjupningar. What was missing was any way for a reader to GET
 * one: to send someone a particular section rather than the whole 14-minute essay.
 *
 * `/fordjupning/[slug].astro` grew this client-side, and its comment explained the
 * choice — "a rehype plugin would rewrite all 54 essays and 63 answer pages too". That
 * was the objection when only fördjupning wanted it; it is the point now. Doing it here
 * instead means one implementation, no JS, h3 as well as h2, and the same affordance on
 * every page that has a table of contents.
 *
 * The anchor is APPENDED, not prepended, though it is drawn to the left of the heading.
 * A screen reader should reach the heading's own words first and the permalink after
 * them; where the mark sits is a matter for CSS, which hangs it in the margin.
 *
 * Runs before rehype-sidenotes and the three figure passes: each of those reads a
 * document shape written before any of this, and a heading is not something they act on.
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

const isElement = (node: HastNode): node is HastElement => node.type === "element";

/** Headings that carry a permalink. h4 and below are rare here and sit inside a section
 *  the reader can already link to. */
const LEVELS = new Set(["h2", "h3"]);

/** GFM footnotes emit their own `<h2 class="sr-only" id="footnote-label">`. It is not a
 *  section of the article — Innehall.astro filters it out of the contents for the same
 *  reason — so it gets no permalink either. */
const SKIP_IDS = new Set(["footnote-label"]);

function textOf(node: HastNode): string {
	if (node.type === "text") return (node as HastText).value;
	const kids = (node as { children?: HastNode[] }).children;
	return kids ? kids.map(textOf).join("") : "";
}

function hasAnchor(heading: HastElement): boolean {
	return heading.children.some(
		(c) =>
			isElement(c) &&
			Array.isArray(c.properties?.className) &&
			c.properties.className.includes("heading-anchor"),
	);
}

/** The permalink for one heading, or nothing if it is not a heading that takes one. */
function anchorFor(node: HastNode): HastElement | null {
	if (!(isElement(node) && LEVELS.has(node.tagName))) return null;
	const id = node.properties?.id;
	if (typeof id !== "string" || !id || SKIP_IDS.has(id)) return null;
	if (hasAnchor(node)) return null;
	const label = textOf(node).trim();
	return {
		type: "element",
		tagName: "a",
		properties: {
			className: ["heading-anchor"],
			href: `#${id}`,
			// The visible mark is "#", which reads as nothing useful aloud.
			ariaLabel: label ? `Länk till avsnittet ${label}` : "Länk till avsnittet",
		},
		children: [{ type: "text", value: "#" }],
	};
}

export function rehypeHeadingAnchor() {
	return (tree: HastNode): void => {
		const walk = (node: HastNode): void => {
			const children = (node as { children?: HastNode[] }).children;
			if (!children) return;
			for (const child of children) {
				const anchor = anchorFor(child);
				if (anchor) (child as HastElement).children.push(anchor);
				walk(child);
			}
		};
		walk(tree);
	};
}
