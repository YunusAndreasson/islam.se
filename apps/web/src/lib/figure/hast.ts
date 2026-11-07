/**
 * A minimal hast, shared by every figure form.
 *
 * The rehype plugins, the EPUB writer and the .astro components all consume one tree, so
 * it lives here rather than inside any one renderer. Same hand-built approach as
 * src/plugins/rehype-quran-verse.ts — the alternative is pulling `hastscript` in for six
 * functions, and this file is the six functions.
 *
 * ⚠️ `hastToXml` must stay XML-safe, not merely HTML-safe: the EPUB is XHTML, so void
 * tags self-close and every attribute value is escaped. An unescaped `&` in a source
 * string is a malformed EPUB, which readers reject outright rather than repair.
 */

import { escapeXml } from "../xml";

interface HastText {
	type: "text";
	value: string;
}
export interface HastElement {
	type: "element";
	tagName: string;
	properties: Record<string, string | number | boolean | undefined>;
	children: HastNode[];
}
export type HastNode = HastElement | HastText;

/** Web renders with CSS custom properties; print substitutes literals. See render.ts. */
export type FigureMode = "web" | "print";

export function h(
	tagName: string,
	properties: Record<string, string | number | boolean | undefined> = {},
	children: (HastNode | string | null | false)[] = [],
): HastElement {
	return {
		type: "element",
		tagName,
		properties,
		children: children
			.filter((c): c is HastNode | string => c !== null && c !== false)
			.map((c) => (typeof c === "string" ? { type: "text" as const, value: c } : c)),
	};
}

const VOID_TAGS = new Set(["rect", "circle", "line", "polyline", "path", "br", "img", "use"]);

/** hast property name → serialised attribute name. */
function attrName(key: string): string {
	if (key === "className") return "class";
	return key;
}

export function hastToXml(node: HastNode): string {
	if (node.type === "text") return escapeXml(node.value);
	const attrs = Object.entries(node.properties)
		.filter(([, v]) => v !== undefined && v !== false && v !== "")
		.map(([k, v]) => ` ${attrName(k)}="${escapeXml(String(v))}"`)
		.join("");
	if (node.children.length === 0 && VOID_TAGS.has(node.tagName)) {
		return `<${node.tagName}${attrs} />`;
	}
	const inner = node.children.map(hastToXml).join("");
	return `<${node.tagName}${attrs}>${inner}</${node.tagName}>`;
}
