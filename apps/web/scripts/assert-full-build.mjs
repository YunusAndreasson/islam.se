// Refuses to deploy a sampled build.
//
// `pnpm build:fast` sets BONETIDER_SAMPLE to skip ~2 100 of the 2 118 city pages so a
// design iteration takes 12 s instead of 90 s. Deploying that dist would 404 every one
// of those live URLs. `pnpm ship` runs the full build, so this only fires if the
// variable leaked into the environment — which is exactly the case worth catching,
// because the failure is silent and the damage is 2 118 dead pages.
//
// ⚠️ A Cloudflare Pages deploy is a full SNAPSHOT of dist/ — anything absent from the
// directory becomes a 404 live. Every artefact below has already shipped once, so a
// build that omits it is a regression, not a no-op. The daily cron makes that the
// difference between an unattended refresh and an unattended outage.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIST = new URL("../dist/", import.meta.url).pathname;
const SVAR_SRC = new URL("../../../data/svar/", import.meta.url).pathname;
const MIN_CITIES = 1000;

const failures = [];

/** How many town directories under dist/<rel> contain a file called <name>. */
const countFiles = (rel, name) => {
	try {
		return readdirSync(join(DIST, rel), { withFileTypes: true }).filter(
			(e) => e.isDirectory() && existsSync(join(DIST, rel, e.name, name)),
		).length;
	} catch {
		return 0;
	}
};

const countDirs = (rel) => {
	try {
		return readdirSync(join(DIST, rel), { withFileTypes: true }).filter((e) => e.isDirectory())
			.length;
	} catch {
		return null;
	}
};

const cities = countDirs("bonetider");
if (cities === null) {
	failures.push("dist/bonetider is missing entirely — did the build run?");
} else if (cities < MIN_CITIES) {
	failures.push(
		`only ${cities} bönetider city pages in dist (expected >${MIN_CITIES}).\n` +
			"    Looks like a build:fast / BONETIDER_SAMPLE build; deploying it would strand\n" +
			"    the missing city URLs. Run `pnpm build` and try again.",
	);
}

// Counted from source rather than hardcoded, so adding an answer page cannot silently
// lower the bar this guard enforces.
const svarExpected = existsSync(SVAR_SRC)
	? readdirSync(SVAR_SRC).filter((f) => f.endsWith(".md")).length
	: 0;
const svarBuilt = countDirs("svar");
if (svarExpected > 0 && svarBuilt !== svarExpected) {
	failures.push(
		`dist/svar has ${svarBuilt ?? 0} pages, expected ${svarExpected} (one per data/svar/*.md)`,
	);
}

// The markdown processor in astro.config.ts is GLOBAL — essays, svar and fördjupning
// all run through the same rehype chain — so which corpora get margin notes is decided
// entirely by the path list in src/plugins/rehype-sidenotes.ts. That list and the
// `reading--notes` class on each template have to agree, and nothing else in the build
// would notice if they stopped: a page with the class but no projection silently loses
// its apparatus to the wrong column, and a page with the projection but no class
// carries every footnote twice.
//
// Essays and fördjupning project; /svar/ does not, and cannot — its 64 pages have no
// footnotes at all (they cite through a `sources:` array), so a hit there means the
// gate has started matching a corpus it was never meant to.
const sidenotePages = (section) => {
	const dir = join(DIST, section);
	if (!existsSync(dir)) return null;
	return readdirSync(dir, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.filter((e) => {
			const page = join(dir, e.name, "index.html");
			return existsSync(page) && readFileSync(page, "utf8").includes('class="sidenote"');
		})
		.map((e) => e.name);
};

const leaked = sidenotePages("svar") ?? [];
if (leaked.length > 0) {
	failures.push(
		`sidenotes leaked into dist/svar: ${leaked.slice(0, 5).join(", ")}` +
			`${leaked.length > 5 ? ` (+${leaked.length - 5} more)` : ""}.\n` +
			"    The path gate in src/plugins/rehype-sidenotes.ts is matching a corpus that has no footnotes.",
	);
}

// Counted from source so adding a pillar page cannot silently lower the bar. Every
// fördjupning page in the corpus carries footnotes today; if one legitimately stops,
// this is the line to revisit rather than the plugin.
const pillarSrc = new URL("../../../data/fordjupning/", import.meta.url).pathname;
const pillarsExpected = existsSync(pillarSrc)
	? readdirSync(pillarSrc).filter((f) => f.endsWith(".md")).length
	: 0;
const pillarsWithNotes = sidenotePages("fordjupning");
if (pillarsExpected > 0 && pillarsWithNotes !== null && pillarsWithNotes.length < pillarsExpected) {
	failures.push(
		`only ${pillarsWithNotes.length} of ${pillarsExpected} fördjupning pages have margin notes.\n` +
			"    Either the path gate in src/plugins/rehype-sidenotes.ts dropped /data/fordjupning/,\n" +
			"    or the `reading--notes` class came off src/pages/fordjupning/[slug].astro.",
	);
}

// A Pages deploy is a snapshot: a file missing from dist becomes a 404 live, and the
// city pages link to both of these. The counts are derived, not hardcoded, so adding a
// town cannot silently lower the bar.
const icsCount = countFiles("bonetider", "kalender.ics");
if (cities !== null && cities >= MIN_CITIES && icsCount < MIN_CITIES) {
	failures.push(
		`only ${icsCount} kalender.ics files for ${cities} city pages — every town page links to one`,
	);
}
const pdfCount = countFiles("bonetider", "kalender.pdf");
const ramadanPdfCount = countFiles("bonetider", "ramadan.pdf");
// Same towns as the month sheet. The city pages link to it, so a build where typst
// failed for every one of them would ship 270-odd broken links.
if (cities !== null && cities >= MIN_CITIES && ramadanPdfCount < 200) {
	failures.push(
		`only ${ramadanPdfCount} ramadan.pdf files — expected one per town above OG_POPULATION (typst missing?)`,
	);
}
// The PDF is built only above OG_POPULATION (273 towns as of 2026-08); 200 is a floor
// that catches "typst was missing and every one silently failed", not an exact count.
if (cities !== null && cities >= MIN_CITIES && pdfCount < 200) {
	failures.push(
		`only ${pdfCount} kalender.pdf files — expected one per town above OG_POPULATION (typst missing?)`,
	);
}

// Figures are the one content element whose rendering can fail SILENTLY and still build.
// rehypeShiki is registered above the user rehype plugins inside @astrojs/markdown-remark,
// so if `syntaxHighlight.excludeLangs` in astro.config.ts ever loses "chart" or "table",
// every fence of that kind becomes a syntax-highlighted code listing on the page instead of
// a figure — a defect the reader sees and the build does not. Counted from source so it
// cannot drift. All three fences render to `<figure class="chart chart--…">`, which is why
// one comparison covers them.
const CORPORA = ["articles", "svar", "fordjupning"];
const FENCE_LANGS = ["chart", "table", "timeline"];
let chartFences = 0;
for (const corpus of CORPORA) {
	const dir = new URL(`../../../data/${corpus}/`, import.meta.url).pathname;
	if (!existsSync(dir)) continue;
	for (const file of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
		const src = readFileSync(join(dir, file), "utf8");
		for (const lang of FENCE_LANGS) {
			chartFences += (src.match(new RegExp(`^\`\`\`${lang}$`, "gm")) ?? []).length;
		}
	}
}
let chartFigures = 0;
let leakedFences = 0;
const weldedTwins = [];
const scanHtml = (dir) => {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) scanHtml(full);
		else if (entry.name === "index.html") {
			const html = readFileSync(full, "utf8");
			chartFigures += (html.match(/<figure class="chart chart--/g) ?? []).length;
			leakedFences += (html.match(/language-(?:chart|table|timeline)/g) ?? []).length;
		} else if (entry.name === "index.md") {
			// The markdown twin is built from the rendered HTML, where a chart's label and
			// value are adjacent inline spans. node-html-markdown joins them with nothing,
			// so the griskött chart shipped as "Griskött29,3" — every number in the corpus
			// welded to its label, invisible on the web and only in the AI-facing twin.
			// generate-markdown.ts flattens the figure to its aria-label sentence instead;
			// this asserts that it still runs. A digit hard against a letter is the signature.
			for (const hit of readFileSync(full, "utf8").match(/^[A-ZÅÄÖ][\wåäöÅÄÖ]+\d+[,.]\d+$/gm) ??
				[]) {
				weldedTwins.push(`${full.slice(DIST.length)}: ${hit}`);
			}
		}
	}
};
if (existsSync(DIST)) scanHtml(DIST);
if (chartFences > 0 && chartFigures < chartFences) {
	failures.push(
		`${chartFences} chart/table/timeline fences in data/, but only ${chartFigures} figures in dist.\n` +
			"    A figure plugin did not run on all of them. Check that astro.config.ts still has\n" +
			'    `syntaxHighlight: { type: "shiki", excludeLangs: ["chart", "table", "timeline"] }`\n' +
			"    and that rehypeChart, rehypeTable and rehypeTimeline are all in rehypePlugins.",
	);
}
if (weldedTwins.length > 0) {
	failures.push(
		`${weldedTwins.length} markdown twin(s) have a chart label welded to its value:\n` +
			weldedTwins
				.slice(0, 3)
				.map((t) => `      ${t}`)
				.join("\n") +
			"\n    flattenCharts() in scripts/generate-markdown.ts stopped matching — most likely\n" +
			"    the figure's class or the aria-label moved off .chart-plot.",
	);
}
if (leakedFences > 0) {
	failures.push(
		`${leakedFences} fences reached dist as <code class="language-chart|table|timeline"> — the\n` +
			"    reader is being shown the raw spec. See the note above.",
	);
}
for (const [rel, note] of [
	["sitemap-index.xml", "the sitemap Search Console is subscribed to"],
	[
		"samlingsvolym.pdf",
		"linked from BookPod; produced by `pnpm books`, which needs the typst binary",
	],
	["samlingsvolym.epub", "linked from BookPod; produced by `pnpm books`, which needs `zip`"],
]) {
	if (!existsSync(join(DIST, rel))) failures.push(`dist/${rel} is missing — ${note}`);
}

// The pre-paint theme script is `is:inline`, so Astro cannot hash it for the CSP and
// astro.config.ts does it from the source instead. Check both against the bytes that
// actually shipped: if the hash is missing the browser blocks the script, the page paints
// in the OS palette and then flips, and nothing else in the build says a word.
const cspHtml = existsSync(join(DIST, "index.html"))
	? readFileSync(join(DIST, "index.html"), "utf-8")
	: null;
if (cspHtml) {
	const policy = cspHtml.match(
		/<meta http-equiv="content-security-policy" content="([^"]*)"/i,
	)?.[1];
	const themeScripts = [...cspHtml.matchAll(/<script>([\s\S]*?)<\/script\s*>/gi)]
		.map((m) => m[1])
		.filter((s) => s.includes("theme-choice"));
	if (!policy) {
		failures.push("dist/index.html has no CSP meta — security.csp fell out of astro.config.ts.");
	} else if (themeScripts.length !== 1) {
		failures.push(
			`expected one inline theme script in dist/index.html, found ${themeScripts.length}.`,
		);
	} else if (
		!policy.includes(createHash("sha256").update(themeScripts[0], "utf8").digest("base64"))
	) {
		failures.push(
			"the inline theme script is not covered by the CSP — the browser will block it and the\n" +
				"    page will paint in the OS palette before flipping. See inlineScriptHash() in astro.config.ts.",
		);
	}
}

// Internal links must use the canonical trailing-slash form. The slash-less URL 308s,
// so every such link costs crawlers a redirect hop and passes link signals through
// it. This was 16 of 90 links on the homepage and the ämne nav on every page
// (2026-09). Only a warning: a stray link is worth fixing, not worth blocking a deploy.
const slashless = new Map();
for (const rel of readdirSync(DIST, { recursive: true, encoding: "utf-8" })) {
	if (!rel.endsWith(".html")) continue;
	for (const [, href] of readFileSync(join(DIST, rel), "utf-8").matchAll(
		/href="(\/[^"#?]*[^/"#?])"/g,
	)) {
		if (/\.[a-z0-9]{2,}$/i.test(href)) continue; // a file, including .webmanifest
		slashless.set(href, (slashless.get(href) ?? 0) + 1);
	}
}
if (slashless.size > 0) {
	const top = [...slashless].sort((a, b) => b[1] - a[1]).slice(0, 10);
	console.warn(
		`⚠ ${slashless.size} internal href(s) without a trailing slash (each 308-redirects):\n` +
			top.map(([href, n]) => `    ${href} (${n}×)`).join("\n"),
	);
}

if (failures.length > 0) {
	console.error("✗ deploy guard:");
	for (const f of failures) console.error(`  • ${f}`);
	process.exit(1);
}

console.log(
	`✓ deploy guard: ${cities} bönetider city pages, ${icsCount} kalendrar, ${pdfCount} månads-PDF:er, ${ramadanPdfCount} ramadanark, ${svarBuilt} svar pages, ${chartFigures} diagram, sitemap + PDF present`,
);
