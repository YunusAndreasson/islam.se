/**
 * Fast per-chart gate. Parses, renders and describes every ```chart fence in the given
 * files — without building the site.
 *
 * Usage: pnpm chart:check data/fordjupning/abort.md [...]
 *        pnpm chart:check                 (every fence in the corpus)
 *
 * WHY THIS EXISTS. Measured 2026-08-20, adding two charts: the gates that can actually
 * fail on a chart take 1,3 seconds, and `pnpm verify` takes 2 m 40 s because it rebuilds
 * 2 473 pages. Running the full gate once per chart spent ~10 minutes to catch nothing
 * that this script does not catch in two seconds. The build is still required before
 * shipping — it is the only thing that proves rehype-chart ran and Shiki did not eat the
 * fence — but it is a BATCH operation. Author every chart, then build once.
 *
 * What this catches (everything chart-specific except the plugin wiring):
 *   - a malformed spec, with its line number
 *   - a renderer crash, in web AND print mode
 *   - print-mode leaking `var(--…)`, web-mode leaking raw hex
 *   - malformed XML in the print SVG (the EPUB is XHTML; a bare & is fatal there)
 *   - an empty aria-label
 * What it cannot catch, and why the build still runs before shipping:
 *   - `syntaxHighlight.excludeLangs` regressing, so Shiki renders the fence as code
 *   - rehypeChart falling out of the rehypePlugins array
 *   - the markdown twin welding label to value
 * Those three are asserted by scripts/assert-full-build.mjs against real dist output.
 */
import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	chartAltText,
	chartCaptionText,
	renderChartMarkup,
	renderChartSvg,
} from "../src/lib/chart/render.ts";
import { ChartSpecError, parseChartSpec } from "../src/lib/chart/spec.ts";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
// ⚠️ The closing fence must own its line. This pattern once ended at `^``` ` without
// requiring end-of-line, and it happily parsed a chart whose closing fence had prose
// welded to it — "```\u0020Europeiska fatwarådet har mött problemet…" — produced by an
// edit that split a paragraph at a sentence boundary the paragraph continued past.
// Markdown does not close a fence like that, so the page would have rendered the spec as
// text. check-chart-sources.py was strict and caught it; this one said "inga fel", which
// is worse than having no fast gate at all. Measured 2026-08-20 on ramadan.md.
const FENCE = /^```chart[ \t]*\n([\s\S]*?)^```[ \t]*$/gm;

const files = process.argv.slice(2).length
	? process.argv.slice(2)
	: ["data/articles/*.md", "data/fordjupning/*.md", "data/svar/*.md"].flatMap((g) =>
			globSync(g, { cwd: REPO }),
		);

let charts = 0;
const problems: string[] = [];

for (const rel of files) {
	const path = rel.startsWith("/") ? rel : join(REPO, rel);
	let text: string;
	try {
		text = readFileSync(path, "utf8");
	} catch {
		problems.push(`${rel}: går inte att läsa`);
		continue;
	}

	FENCE.lastIndex = 0;
	for (const m of text.matchAll(FENCE)) {
		charts++;
		// The line the fence opens on, so an error points where a human can look.
		const line = text.slice(0, m.index ?? 0).split("\n").length;
		const where = `${rel}:${line}`;
		try {
			const spec = parseChartSpec(m[1] ?? "");
			const web = renderChartMarkup(spec, "web");
			const print = renderChartSvg(spec);

			if (/var\(--/.test(print))
				problems.push(
					`${where}: print-läget läcker var(--…) — Typst och EPUB har inga CSS-variabler`,
				);
			if (/#[0-9a-f]{6}/i.test(web))
				problems.push(`${where}: webbläget har rå hex i stället för en token`);
			const alt = chartAltText(spec);
			if (!alt.trim()) problems.push(`${where}: tom aria-label`);

			// The print SVG lands in XHTML. Cheap well-formedness check: every open tag
			// is closed. A bare & would also be fatal but render.ts escapes it.
			const opens = (print.match(/<[a-z][^>]*?(?<!\/)>/g) ?? []).length;
			const closes = (print.match(/<\/[a-z]+>/g) ?? []).length;
			if (opens !== closes)
				problems.push(
					`${where}: print-SVG:n är inte välformad XML (${opens} öppnande, ${closes} stängande)`,
				);

			console.log(`\n\x1b[1m${where}\x1b[0m  ${spec.type}, ${spec.data.length} poster`);
			console.log(`  alt      ${alt}`);
			console.log(`  bildtext ${chartCaptionText(spec)}`);
			if (!spec.sourceUrl)
				console.log(
					"  \x1b[33m·\x1b[0m källa utan länk — avsiktligt? en påhittad länk är en förfalskning",
				);
		} catch (error) {
			const at = error instanceof ChartSpecError ? `${rel}:${line + error.line}` : where;
			problems.push(`${at}: ${(error as Error).message}`);
		}
	}
}

console.log(`\n${"=".repeat(72)}`);
if (problems.length > 0) {
	console.log(`  ${charts} diagram — \x1b[31m${problems.length} fel\x1b[0m`);
	for (const p of problems) console.log(`  • ${p}`);
	console.log("=".repeat(72));
	process.exit(1);
}
console.log(`  ${charts} diagram — inga fel. Bygget krävs ändå före leverans (se filhuvudet).`);
console.log("=".repeat(72));
