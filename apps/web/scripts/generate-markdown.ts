import { access, readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeHtmlMarkdown } from "node-html-markdown";
import { stripSidenotes } from "../src/lib/sidenotes";

// Post-build: give every HTML page a markdown twin so the edge `_middleware`
// can answer `Accept: text/markdown` with real markdown (see functions/_middleware.js).
//
// Essays already ship a hand-authored, cleaner twin at /{slug}.md (src/pages/[slug].md.ts)
// — we SKIP those and only generate for the pages that lack one (home, bönetider,
// taxonomy, info pages). Markdown is built from the page's own <main>, so it is the
// same content as the HTML (parity, not cloaking).

const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
const SITE = "https://islam.se";

async function exists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

async function* walkIndexHtml(dir: string): AsyncGenerator<string> {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) yield* walkIndexHtml(full);
		else if (entry.isFile() && entry.name === "index.html") yield full;
	}
}

// Pull the <main> region and drop sub-trees that only produce markdown noise
// (scripts, styles, inline SVG icons, the bönetider <canvas>, no-JS fallbacks).
function extractMain(html: string): string {
	const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
	const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
	const fragment = main?.[1] ?? body?.[1] ?? html;
	// Belt and braces. Essays are skipped below (they ship a hand-authored twin from
	// src/pages/[slug].md.ts) and rehype-sidenotes is gated to data/articles, so no
	// page reaching this line should carry one. If either guard ever slips, a twin
	// that repeats every footnote mid-sentence is a silent corruption of the whole
	// AI-facing corpus — cheaper to strip unconditionally than to notice later.
	return flattenCharts(stripSidenotes(fragment))
		.replace(/<script\b[\s\S]*?<\/script>/gi, "")
		.replace(/<style\b[\s\S]*?<\/style>/gi, "")
		.replace(/<svg\b[\s\S]*?<\/svg>/gi, "")
		.replace(/<canvas\b[\s\S]*?<\/canvas>/gi, "")
		.replace(/<noscript\b[\s\S]*?<\/noscript>/gi, "");
}

// A chart figure has to be flattened BEFORE node-html-markdown sees it, and before the
// <svg> strip below removes half of it.
//
// Two things go wrong if it is left alone. The CSS forms (`bars`, `columns`, `stack`) are
// adjacent inline spans, and the converter joins them with no separator — the griskött
// chart came out as "Griskött29,3" on three orphaned lines, and the caption as
// "Kilo per person.Källa:". The SVG forms (`line`, `slope`) fare worse: the strip removes
// the plot entirely, so the twin keeps a caption for a figure whose numbers are gone.
//
// The fix is the text we already guarantee is correct: the `aria-label` on `.chart-plot`,
// a complete Swedish sentence carrying every label and value, asserted non-empty by
// chart.test.ts and identical in web and print mode. Emitting it gives the markdown reader
// exactly what the screen-reader user gets — parity, which is this file's whole premise.
//
// Essays are unaffected and must stay that way: they ship a hand-authored twin from
// src/pages/[slug].md.ts that emits the SOURCE body, so an essay's machine twin carries
// the raw ```chart spec — strictly better than any prose rendering of it.
const CHART_FIGURE = /<figure class="chart[^"]*"[^>]*>([\s\S]*?)<\/figure>/gi;

function flattenCharts(fragment: string): string {
	return fragment.replace(CHART_FIGURE, (whole, inner: string) => {
		const aria = /aria-label="([^"]*)"/i.exec(inner)?.[1];
		const caption = /<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i.exec(inner)?.[1];
		if (!aria) return whole; // shape changed — leave it rather than silently drop data
		// The caption's sentences live in sibling <span>s that abut with no whitespace.
		const spaced = caption?.replace(/<\/span><span/gi, "</span> <span") ?? "";
		return `<p>${aria}</p>${spaced ? `<p>${spaced}</p>` : ""}`;
	});
}

let generated = 0;
let skipped = 0;

for await (const htmlPath of walkIndexHtml(DIST)) {
	const relDir = relative(DIST, htmlPath).replace(/\/?index\.html$/, ""); // "" for the homepage
	const essayTwin = join(DIST, `${relDir}.md`); // hand-authored essay twin, e.g. dist/alis-princip.md
	const dirTwin = join(DIST, relDir, "index.md");

	if (relDir && (await exists(essayTwin))) {
		skipped++;
		continue;
	}
	if (await exists(dirTwin)) {
		skipped++;
		continue;
	}

	let html: string;
	try {
		html = await readFile(htmlPath, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			skipped++;
			continue;
		}
		throw error;
	}
	const markdown = NodeHtmlMarkdown.translate(extractMain(html)).trim();
	if (!markdown) {
		skipped++;
		continue;
	}

	const route = `/${relDir ? `${relDir}/` : ""}`;
	const out = `> Källa: ${SITE}${route}\n\n${markdown}\n`;
	await writeFile(dirTwin, out, "utf8");
	generated++;
}

console.log(`markdown twins: ${generated} generated, ${skipped} skipped (hand-authored/existing)`);
