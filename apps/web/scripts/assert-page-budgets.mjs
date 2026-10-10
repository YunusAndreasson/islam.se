// Holds the built pages to the rows of the scorecard against ft.com that can be read
// off the HTML (DESIGN.md, »The Scorecard«; `pnpm bench` measures the rest in a browser).
//
// Each check below is a row that was lost once and won back on 2026-10-10. None of them
// fails loudly on its own: a font preloaded twice, a missing header and a share image of
// the wrong shape all build, deploy and look fine on the machine that made them.
//
//   node scripts/assert-page-budgets.mjs            # dist/
//   node scripts/assert-page-budgets.mjs dist-check
//
// What this cannot see: anything decided at run time — which sections content-visibility
// lays out, the news headlines fetched by the client, the font a glyph finally resolves
// to. It is necessary, not sufficient; the bench is the measurement.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";

const WEB = new URL("../", import.meta.url).pathname;
const DIST = resolve(WEB, process.argv[2] ?? "dist");
const failures = [];

const FRONT_FONT_PRELOADS = 3;
const FRONT_FONT_KB = 200;
const HSTS_MIN_AGE = 31_536_000;

const read = (rel) => readFileSync(join(DIST, rel), "utf-8");
const attr = (tag, name) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
const tags = (html, pattern) =>
	[...html.matchAll(pattern)].map((m) => ({ tag: m[0], at: m.index }));
const preloads = (html, as) =>
	tags(html, /<link\b[^>]*\brel="preload"[^>]*>/g).filter((l) => attr(l.tag, "as") === as);

/** Every @font-face in the page: family, style, the declared ranges and the file. */
function fontFaces(html) {
	return [...html.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => ({
		// The minifier writes a quoted name as bare identifiers with the colon escaped
		// (`Literata fallback\: Liberation Serif`); both spell the same family.
		family: /font-family:\s*([^;]+)/
			.exec(body)?.[1]
			.trim()
			.replace(/^"|"$/g, "")
			.replaceAll("\\", ""),
		style: /font-style:\s*([^;]+)/.exec(body)?.[1].trim() ?? "normal",
		url: /url\("?([^")]+)"?\)/.exec(body)?.[1],
		range: /unicode-range:\s*([^;]+)/.exec(body)?.[1].trim(),
	}));
}

/** "U+0102-0129,U+018F" → a test for a codepoint. */
function inRange(range) {
	const spans = range.split(",").map((part) => {
		const [from, to = from] = part.trim().replace(/^U\+/i, "").split("-");
		return [Number.parseInt(from, 16), Number.parseInt(to, 16)];
	});
	return (cp) => spans.some(([from, to]) => cp >= from && cp <= to);
}

/** The words a reader is shown: no markup, styles, scripts or attribute values. */
function visibleText(html) {
	return html
		.slice(html.indexOf("<body"))
		.replace(/<(script|style|template)\b[\s\S]*?<\/\1>/g, "")
		.replace(/<[^>]+>/g, " ");
}

// ── Headers ────────────────────────────────────────────────────────────────────────────
// FT sends HSTS; we did not. Pages comma-joins a header that two matching rules both
// set, so each must appear exactly once in the file, not once per rule.
if (existsSync(join(DIST, "_headers"))) {
	const headers = read("_headers");
	const hsts = [...headers.matchAll(/^\s+Strict-Transport-Security:\s*(.+)$/gim)];
	const maxAge = Number(/max-age=(\d+)/.exec(hsts[0]?.[1] ?? "")?.[1] ?? 0);
	if (hsts.length !== 1 || maxAge < HSTS_MIN_AGE) {
		failures.push(
			`_headers must set Strict-Transport-Security once with max-age ≥ ${HSTS_MIN_AGE} ` +
				`(found ${hsts.length} line(s), max-age ${maxAge}). Without it a first visit over http ` +
				"is not upgraded, and the security row of the scorecard goes back to FT.",
		);
	}
	const coop = [...headers.matchAll(/^\s+Cross-Origin-Opener-Policy:/gim)];
	if (coop.length !== 1) {
		failures.push(
			`_headers must set Cross-Origin-Opener-Policy exactly once (found ${coop.length}).`,
		);
	}
} else {
	failures.push("_headers is missing from the build: no security or cache header would be sent.");
}

// ── The front page ─────────────────────────────────────────────────────────────────────
const front = read("index.html");
const faces = fontFaces(front);

// Fonts are preloaded one file at a time and only the ones that set words above the
// cover. A fourth, or an ext file, is how the first load grew to five files and 445 kB.
const fontLinks = preloads(front, "font");
let fontBytes = 0;
for (const { tag } of fontLinks) {
	const href = attr(tag, "href");
	const face = faces.find((f) => f.url === href);
	if (!existsSync(join(DIST, href))) {
		failures.push(`the front page preloads ${href}, which is not in the build.`);
		continue;
	}
	fontBytes += statSync(join(DIST, href)).size;
	if (!face) {
		failures.push(`the front page preloads ${href}, which no @font-face on the page uses.`);
	} else if (face.style !== "normal" || (face.range && !face.range.includes("U+0000-00FF"))) {
		failures.push(
			`the front page preloads ${href} (${face.family}, ${face.style}), which is not a core roman ` +
				"file. Only the faces that set the first screen are worth a preload.",
		);
	}
}
if (fontLinks.length > FRONT_FONT_PRELOADS || fontBytes > FRONT_FONT_KB * 1024) {
	failures.push(
		`the front page preloads ${fontLinks.length} font files, ${Math.round(fontBytes / 1024)} kB ` +
			`(budget ${FRONT_FONT_PRELOADS} files, ${FRONT_FONT_KB} kB). Every one of them competes with the cover.`,
	);
}

// The cover is the LCP element: its preload comes before any font, and names the very
// srcset the <picture> paints, or the browser fetches the picture twice.
const [cover] = preloads(front, "image");
if (cover) {
	if (fontLinks.some((font) => font.at < cover.at)) {
		failures.push(
			"a font preload comes before the cover's on the front page; the picture must be first.",
		);
	}
	const srcset = attr(cover.tag, "imagesrcset");
	const painted = tags(front, /<source\b[^>]*>/g).some((s) => attr(s.tag, "srcset") === srcset);
	if (!painted) {
		failures.push(
			"the cover's preload does not match any <source srcset> on the front page, so the " +
				"preloaded file is not the one painted. Keep index.astro and FeatureEssay on lib/hero.ts.",
		);
	}
} else {
	failures.push("the front page has no image preload: the cover would wait for the stylesheet.");
}

// A named system font after the matched fallback is a lookup that fails on every system
// the fallback was written for; `system-ui` before it hides it altogether.
for (const [, variable, chain] of front.matchAll(/(--font-(?:body|heading|headline)):([^;}]+)/g)) {
	const names = chain.split(",").map((n) => n.trim().replace(/^"|"$/g, ""));
	const bare = names.filter((n) =>
		["Georgia", "Times New Roman", "Arial", "system-ui"].includes(n),
	);
	if (bare.length > 0) {
		failures.push(
			`${variable} names ${bare.join(", ")} directly. Use a metric-matched face, then the generic.`,
		);
	}
	for (const name of names.filter((n) => n.includes("fallback:"))) {
		if (!faces.some((f) => f.family === name)) {
			failures.push(
				`${variable} names "${name}" but no @font-face defines it, so it never resolves ` +
					"(src/styles/font-fallbacks.css).",
			);
		}
	}
}

// No character on the front page may pull an ext file: that is 92 kB for one glyph.
const extFaces = faces.filter((f) => f.range && !f.range.includes("U+0000-00FF"));
const text = visibleText(front);
for (const face of extFaces) {
	const claims = inRange(face.range);
	const pulled = [...new Set(text)].filter((ch) => claims(ch.codePointAt(0)));
	if (pulled.length > 0) {
		failures.push(
			`the front page sets ${pulled.map((ch) => `»${ch}«`).join(" ")}, which fetches the ` +
				`${face.style} ext file of ${face.family}. Reword, or move the letter into core.`,
		);
	}
}

// The share card says how large it is; a chat client reserves that box before it loads.
const ogImage = /<meta property="og:image" content="([^"]+)"/.exec(front)?.[1];
const ogWidth = Number(/<meta property="og:image:width" content="(\d+)"/.exec(front)?.[1]);
const ogHeight = Number(/<meta property="og:image:height" content="(\d+)"/.exec(front)?.[1]);
const ogFile = ogImage ? join(DIST, new URL(ogImage).pathname) : null;
if (ogFile && existsSync(ogFile)) {
	const { width, height } = await sharp(ogFile).metadata();
	if (width !== ogWidth || height !== ogHeight) {
		failures.push(
			`the front page's og:image is ${width}×${height} but declares ${ogWidth}×${ogHeight}.`,
		);
	}
} else {
	failures.push(`the front page's og:image (${ogImage}) is not in the build.`);
}

// ── Every page that shares the chrome ──────────────────────────────────────────────────
// A sample is enough for the mast and the head; the essays are all checked for the hero.
const essays = readdirSync(DIST, { withFileTypes: true })
	.filter((e) => e.isDirectory() && existsSync(join(DIST, e.name, "index.html")))
	.map((e) => `${e.name}/index.html`)
	.filter((rel) => read(rel).includes('class="reading reading--notes"'));
const pages = ["index.html", "essaer/index.html", "svar/index.html", ...essays];

let heroes = 0;
for (const rel of pages) {
	const html = rel === "index.html" ? front : read(rel);

	// One name, one region: a second element labelled by the same id is announced twice.
	const labelled = new Map();
	for (const [, id] of html.matchAll(/\saria-labelledby="([^"]+)"/g)) {
		labelled.set(id, (labelled.get(id) ?? 0) + 1);
	}
	const twice = [...labelled].filter(([, n]) => n > 1).map(([id]) => id);
	if (twice.length > 0)
		failures.push(
			`${rel}: aria-labelledby="${twice.join('", "')}" is used by more than one element.`,
		);

	// WCAG 2.5.3: a reader who speaks what they see must be saying the control's name.
	const chip = /<a\b[^>]*class="bonetider-mast[^"]*"[^>]*>([\s\S]*?)<\/a>/.exec(html);
	if (chip) {
		const label = attr(chip[0], "aria-label") ?? "";
		const shown = chip[1]
			.replace(/<span class="[^"]*mast-prayer-label[^"]*">[\s\S]*?<\/span>/, "")
			.replace(/<svg[\s\S]*?<\/svg>/g, "")
			.replace(/<[^>]+>/g, "")
			.trim();
		if (!label.includes(shown)) {
			failures.push(
				`${rel}: the mast chip shows »${shown}« but its label is »${label}«, which does not contain it.`,
			);
		}
	}

	// An essay's hero is its LCP element and sits ~100 kB into the document. Without a
	// preload it waits for all of that to parse (LCP 4.0 s on a phone, 2026-10-10). An
	// art-directed hero chooses between two files by media query and is left alone.
	if (html.includes('<figure class="article-hero"')) {
		heroes++;
		const artDirected = /<figure class="article-hero"[\s\S]*?<source media=/.test(
			html.slice(0, html.indexOf("</figure>") + 9),
		);
		if (!artDirected && preloads(html, "image").length === 0) {
			failures.push(`${rel}: has a hero but no image preload.`);
		}
	}
}

if (failures.length > 0) {
	console.error("✗ page budgets:");
	for (const f of failures) console.error(`  • ${f}`);
	process.exit(1);
}

console.log(
	`✓ page budgets: front page preloads ${fontLinks.length} fonts (${Math.round(fontBytes / 1024)} kB) after the cover, ` +
		`${extFaces.length} ext faces untouched, og:image ${ogWidth}×${ogHeight}, HSTS and COOP set, ` +
		`${pages.length} pages checked (${heroes} heroes)`,
);
