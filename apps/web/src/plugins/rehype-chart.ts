/**
 * rehype-chart: turn a ```chart fence into a real figure at build time.
 *
 * The corpus is pure prose — no MDX, no raw HTML, no directives. A chart therefore enters an
 * article as a fence whose body is the small declarative grammar in src/lib/chart/spec.ts,
 * and this pass replaces it with the figure. Zero client JavaScript: the SVG and the CSS
 * bars are in the HTML that leaves the build, so the chart is there with scripting off, in
 * the print stylesheet, and for a crawler.
 *
 * The shape follows src/plugins/rehype-quran-verse.ts — find a node, hand-build the
 * replacement hast, splice it in — and the markup it produces is the same markup
 * Chart.astro produces, from the same renderer. That is the doctrine QuranVerse.astro
 * already states for its own pair: markdown gets its figure from the plugin, a
 * hand-composed page uses the component.
 *
 * The traversal itself lives in rehype-fence.ts, shared with the ```table fence — including
 * the two warnings that matter (Shiki's excludeLangs, and the content cache).
 */
import { buildChartHast } from "../lib/chart/render";
import { type ChartSpec, ChartSpecError, parseChartSpec } from "../lib/chart/spec";
import { rehypeFence } from "./rehype-fence";

export const rehypeChart = rehypeFence<ChartSpec>({
	lang: "chart",
	parse: parseChartSpec,
	build: buildChartHast,
	isSpecError: (error): error is ChartSpecError => error instanceof ChartSpecError,
});
