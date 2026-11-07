/**
 * rehype-chart: turn a ```chart fence into a real figure at build time.
 *
 * The corpus is pure prose — no MDX, no raw HTML, no directives. A chart therefore enters an
 * article as a fence whose body is the small declarative grammar in src/lib/chart/spec.ts,
 * and this pass replaces it with the figure. Zero client JavaScript: the SVG and the CSS
 * bars are in the HTML that leaves the build, so the chart is there with scripting off, in
 * the print stylesheet, and for a crawler.
 *
 * The renderer is shared with the PDF and EPUB paths so charts have one
 * implementation across publishing formats.
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
