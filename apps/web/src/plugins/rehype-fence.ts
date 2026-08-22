/**
 * The shared machinery behind rehype-chart and rehype-table.
 *
 * Both plugins do exactly one thing: find a `<pre><code class="language-X">`, hand its text
 * to a parser, and replace the node with the figure that comes back. Only the language, the
 * parser, the builder and the error class differ — so those are arguments and the traversal
 * lives here once. Written after the two plugins had already been copied apart: ~70 of 101
 * lines were identical, and a fix to the traversal would have had to be made twice with
 * nothing to notice when it was not.
 *
 * ⚠️ SHIKI MUST BE TOLD TO SKIP EVERY LANGUAGE REGISTERED HERE.
 * @astrojs/markdown-remark registers rehypeShiki ABOVE the user rehype plugins, so without
 * `syntaxHighlight: { type: "shiki", excludeLangs: [...] }` in astro.config.ts a fence
 * arrives as `<pre class="astro-code">` full of `<span>`s with its `language-…` class
 * already stripped — this pass matches nothing and the READER is shown a syntax-highlighted
 * code listing where the figure should be. Silent, and on the page.
 *
 * ⚠️ Editing this file does NOT invalidate the content cache. Run
 * `rm -f apps/web/.astro/data-store.json` or you will verify stale HTML.
 */

export interface HastNode {
	type: string;
	tagName?: string;
	value?: string;
	properties?: Record<string, unknown>;
	children?: HastNode[];
}

interface VFileLike {
	path?: string;
}

export interface FencePluginOptions<Spec> {
	/** The fence language, e.g. "chart". Must also be in astro.config.ts excludeLangs. */
	lang: string;
	/** Throws on a malformed spec. The error should carry a `.line`. */
	parse: (source: string) => Spec;
	/** Builds the replacement node. */
	build: (spec: Spec) => unknown;
	/** Recognises this parser's own error type, so the line number reaches the build log. */
	isSpecError: (error: unknown) => error is Error & { line: number };
}

function classNames(node: HastNode): string[] {
	const raw = node.properties?.className;
	if (Array.isArray(raw)) return raw.map(String);
	if (typeof raw === "string") return raw.split(/\s+/);
	return [];
}

/** The fence body. Collected recursively so a stray wrapper cannot swallow the spec. */
function textOf(node: HastNode): string {
	if (node.type === "text") return node.value ?? "";
	return (node.children ?? []).map(textOf).join("");
}

/** `<pre><code class="language-{lang}">` — and nothing else. */
function fenceSource(node: HastNode, lang: string): string | null {
	if (node.tagName !== "pre") return null;
	const code = (node.children ?? []).find((c) => c.tagName === "code");
	if (!code) return null;
	if (!classNames(code).includes(`language-${lang}`)) return null;
	return textOf(code);
}

/**
 * A malformed spec fails the build. It does not render an empty figure and it does not fall
 * back to showing the raw fence: both would put a defect on a page that ranks, and the
 * second would show the reader a code listing. The message carries the file and the line so
 * the fix is obvious from the build log alone.
 */
function parseOrExplain<Spec>(
	source: string,
	options: FencePluginOptions<Spec>,
	path?: string,
): Spec {
	try {
		return options.parse(source);
	} catch (error) {
		if (options.isSpecError(error)) {
			const where = path ? `${path}: ` : "";
			throw new Error(
				`[rehype-${options.lang}] ${where}felaktigt ${options.lang}-block, ${error.message}`,
			);
		}
		throw error;
	}
}

function walk<Spec>(node: HastNode, options: FencePluginOptions<Spec>, path?: string): void {
	const children = node.children;
	if (!Array.isArray(children)) return;

	for (let i = 0; i < children.length; i++) {
		const child = children[i];
		if (!child) continue;

		const source = fenceSource(child, options.lang);
		if (source !== null) {
			children[i] = options.build(parseOrExplain(source, options, path)) as HastNode;
			continue;
		}

		walk(child, options, path);
	}
}

/** Build a rehype plugin that turns one fence language into a figure at build time. */
export function rehypeFence<Spec>(options: FencePluginOptions<Spec>) {
	return () => (tree: HastNode, file?: VFileLike) => {
		walk(tree, options, file?.path);
	};
}
