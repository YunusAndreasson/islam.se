/** Minimal Markdown tree shape, including roots and other non-element nodes. */
export interface HastText {
	type: "text";
	value: string;
}

export interface HastElement {
	type: "element";
	tagName: string;
	properties?: Record<string, unknown>;
	children: HastNode[];
}

export type HastNode = HastText | HastElement | { type: string; children?: HastNode[] };

export const isElement = (node: HastNode): node is HastElement => node.type === "element";
export const isText = (node: HastNode): node is HastText => node.type === "text";

export function childrenOf(node: HastNode): HastNode[] {
	return "children" in node && Array.isArray(node.children) ? node.children : [];
}
