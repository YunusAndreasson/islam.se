/**
 * ```table → hast, for the web page, the EPUB and the markdown twin.
 *
 * Unlike a chart, a table needs no plotting: the markup IS the figure. So this file is
 * short, and the interesting decisions are the three below.
 *
 * ⚠️ THE FIGURE IS `chart chart--table`, NOT A NEW CLASS FAMILY. The caption apparatus is
 * identical to a chart's and its CSS is already inlined into every page (chart.css is
 * 7 kB × ~2 473 pages under `inlineStylesheets: "always"`). A parallel `table-cap*` family
 * would duplicate that to say the same thing. Reusing the name also means
 * assert-full-build.mjs counts tables in its existing `<figure class="chart chart--`
 * comparison, and flattenCharts() in generate-markdown.ts hits its documented `return
 * whole` fallback — so the markdown twin converts the real <table> into a GFM table on
 * its own, instead of welding label to value the way it once shipped »Griskött29,3«.
 *
 * ⚠️ THE ARIA-LABEL IS SHORT, and deliberately unlike a chart's. A chart is opaque to a
 * screen reader, so chartAltText() spells out every label and value. A <table> is not: it
 * is a first-class structure a reader navigates cell by cell. Repeating the whole table in
 * the figure's label would make it read twice. So the label orients — what this is, what
 * it is of, where it came from — and then gets out of the way.
 */

import { joinSwedish } from "../chart/format";
import { figureCaptionNodes, figureCaptionText, housePunctuation } from "../figure/caption";
import { type FigureMode, type HastElement, h, hastToXml } from "../figure/hast";
import { looksNumeric } from "../figure/tokenize";
import type { TableSpec } from "./spec";

/**
 * Which columns hold numbers, decided from the data rather than declared.
 *
 * A numeric column is right-aligned and set in tabular figures; a prose column is not.
 * Requiring the author to declare it would be one more key to get wrong, and the data
 * already knows. A column counts as numeric only if EVERY non-empty cell in it reads as a
 * Swedish number — one prose cell in a column of figures means the column is prose.
 */
export function numericColumns(spec: TableSpec): boolean[] {
	return spec.columns.map((_, col) => {
		// Column 0 is the row label. A label that happens to be a year is still a label.
		if (col === 0) return false;
		const values = spec.rows.map((r) => r.cells[col - 1] ?? "").filter((c) => c.trim() !== "");
		return values.length > 0 && values.every(looksNumeric);
	});
}

/** A short orienting sentence — see the note at the top about why it is not the whole table. */
export function tableAltText(spec: TableSpec): string {
	if (spec.alt) return spec.alt;
	const heads = joinSwedish(spec.columns.map((c) => c.trim()).filter(Boolean));
	const lead = spec.caption ? housePunctuation(spec.caption) : `Tabell med kolumnerna ${heads}.`;
	const size = `${spec.rows.length} rader.`;
	// The emphasis is a claim about which row the table is ABOUT. On the web it is carried
	// by colour, which a screen reader does not report — so it has to be said.
	const emphasis = spec.emphasis ? ` Raden ${housePunctuation(spec.emphasis)} är framhävd.` : "";
	return housePunctuation(`${lead} ${size}${emphasis} Källa: ${spec.source}.`);
}

export function tableCaptionText(spec: TableSpec): string {
	return figureCaptionText(spec.caption ?? null, spec);
}

/**
 * ⚠️ `mode` is accepted and deliberately unused. A chart must switch palettes between web
 * and print because its colours live in the SVG; a table's do not — the markup is identical
 * in both, and the destination's own stylesheet (chart.css on the web, the STYLE literal in
 * generate-epub.ts in the book) supplies the colour. The parameter is kept so the two
 * renderers present one interface to rehype, the EPUB writer and chart-check.
 *
 * The consequence worth knowing: chart-check's web/print comparison for a table compares
 * two identical strings, so it cannot catch a mode-dependent regression here. It would
 * still catch a raw hex or a leaked var(--…) — there just is not a second mode to differ
 * from.
 */
export function buildTableHast(spec: TableSpec, _mode: FigureMode = "web"): HastElement {
	const numeric = numericColumns(spec);

	const head = h("thead", {}, [
		h(
			"tr",
			{},
			spec.columns.map((label, col) =>
				h(
					"th",
					{
						scope: "col",
						className: numeric[col] ? "chart-table-num" : undefined,
					},
					[housePunctuation(label)],
				),
			),
		),
	]);

	const body = h(
		"tbody",
		{},
		spec.rows.map((row) => {
			const emphasised = spec.emphasis !== undefined && row.label === spec.emphasis;
			// One row brass while the rest go muted — the same one-vs-rest encoding a chart
			// uses. When no emphasis is set nothing is dimmed, so the table stays neutral.
			const dim = spec.emphasis !== undefined && !emphasised;
			return h("tr", { className: emphasised ? "is-emphasis" : dim ? "is-dim" : undefined }, [
				h("th", { scope: "row" }, [housePunctuation(row.label)]),
				...row.cells.map((cell, i) =>
					h("td", { className: numeric[i + 1] ? "chart-table-num" : undefined }, [
						housePunctuation(cell),
					]),
				),
			]);
		}),
	);

	// ⚠️ The <table> is wrapped in .chart-plot for the same reason the SVG forms are: below a
	// floor a wide figure must scroll inside its own box. Without the wrapper `min-width`
	// makes the whole PAGE scroll sideways at 375 px — found in Zen, invisible in headless
	// Chromium, which is why the browser rule says to check the browser the reader uses.
	const plot = h("div", { className: "chart-plot" }, [
		h("table", { className: "chart-table" }, [head, body]),
	]);

	return h("figure", { className: "chart chart--table", "aria-label": tableAltText(spec) }, [
		plot,
		h("figcaption", { className: "chart-cap" }, figureCaptionNodes(spec.caption ?? null, spec)),
	]);
}

/** The whole figure as a markup string, for the EPUB and for hand-composed pages. */
export function renderTableMarkup(spec: TableSpec, mode: FigureMode = "web"): string {
	return hastToXml(buildTableHast(spec, mode));
}
