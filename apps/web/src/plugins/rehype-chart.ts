/**
 * rehype-chart: turn a ```chart fence into a real figure at build time.
 *
 * The corpus is pure prose — no MDX, no raw HTML, no directives, and until now not one
 * fenced code block in 136 files. A chart therefore enters an article as a fence whose
 * body is the small declarative grammar in src/lib/chart/spec.ts, and this pass replaces
 * it with the figure. Zero client JavaScript: the SVG and the CSS bars are in the HTML
 * that leaves the build, so the chart is there with scripting off, in the print
 * stylesheet, and for a crawler.
 *
 * The shape follows src/plugins/rehype-quran-verse.ts — find a node, hand-build the
 * replacement hast, splice it in — and the markup it produces is the same markup
 * Chart.astro produces, from the same renderer. That is the doctrine QuranVerse.astro
 * already states for its own pair: markdown gets its figure from the plugin, a
 * hand-composed page uses the component.
 *
 * ⚠️ SHIKI MUST BE TOLD TO SKIP `chart`, OR THIS PASS FINDS NOTHING.
 * @astrojs/markdown-remark registers rehypeShiki ABOVE the user rehype plugins
 * (dist/index.js), so by the time we run, a fence has normally become
 * <pre class="astro-code"> full of <span>s with `language-chart` gone. astro.config.ts
 * sets `syntaxHighlight: { type: "shiki", excludeLangs: ["chart"] }` to prevent that.
 * Remove that key and every chart silently becomes a highlighted code listing.
 *
 * ⚠️ Editing this file does NOT invalidate the content cache. Run
 * `rm -f apps/web/.astro/data-store.json` or you will verify stale HTML — the same trap
 * recorded in rehype-sidenotes.ts, whose own note named the pre-Astro-7 path and so cured
 * nothing.
 */
import { buildChartHast } from "../lib/chart/render";
import { ChartSpecError, parseChartSpec } from "../lib/chart/spec";

interface HastNode {
	type: string;
	tagName?: string;
	value?: string;
	properties?: Record<string, unknown>;
	children?: HastNode[];
}

interface VFileLike {
	path?: string;
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

/** `<pre><code class="language-chart">` — and nothing else. */
function chartSource(node: HastNode): string | null {
	if (node.tagName !== "pre") return null;
	const code = (node.children ?? []).find((c) => c.tagName === "code");
	if (!code) return null;
	if (!classNames(code).includes("language-chart")) return null;
	return textOf(code);
}

export function rehypeChart() {
	return (tree: HastNode, file?: VFileLike) => {
		walk(tree, file?.path);
	};
}

function walk(node: HastNode, path?: string): void {
	const children = node.children;
	if (!Array.isArray(children)) return;

	for (let i = 0; i < children.length; i++) {
		const child = children[i];
		if (!child) continue;

		const source = chartSource(child);
		if (source !== null) {
			children[i] = buildChartHast(parseSpecOrExplain(source, path)) as unknown as HastNode;
			continue;
		}

		walk(child, path);
	}
}

/**
 * A malformed spec fails the build. It does not render an empty figure and it does not
 * fall back to showing the raw fence: both would put a defect on a page that ranks, and
 * the second would show the reader a code listing. The message carries the file and the
 * line so the fix is obvious from the build log alone.
 */
function parseSpecOrExplain(source: string, path?: string) {
	try {
		return parseChartSpec(source);
	} catch (error) {
		if (error instanceof ChartSpecError) {
			const where = path ? `${path}: ` : "";
			throw new Error(`[rehype-chart] ${where}felaktigt chart-block, ${error.message}`);
		}
		throw error;
	}
}
