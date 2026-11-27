import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// The stylesheets' own contract, read off the source. tokens.test.ts measures the
// palette; this file holds the three things a measurement cannot see, because each one
// looks right on the page the day it is written:
//
//   1. THE PALETTE IS CLOSED. A colour at a call site is a token. Before 2026-11-27 the
//      components carried nine shadow recipes (alpha 0.08 to 0.5), three faint-line
//      mixes, two quiet-underline mixes, the map's water and the night's indigo typed as
//      hex in three files each: every one a near-copy of a role tokens.css already had or
//      should have had.
//   2. THE TYPE SCALE IS CLOSED. A font size is a step, an em of the step it sits in, or
//      one of the named display exceptions (DESIGN.md, »The Scale«).
//   3. THE CSS IS WRITTEN FOR THE BROWSER FLOOR (astro.config.ts MODERN_BROWSERS): range
//      media queries in rem, logical sides and sizes, no vendor prefix that has a standard
//      form, no transform where an individual property says it.
//
// An exception is listed here with its reason, so the next one is a decision and not a
// habit. When this fails, prefer the token to the allowlist.

const SRC = new URL("../", import.meta.url).pathname;

function sourceFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return sourceFiles(path);
		return /\.(css|astro)$/.test(entry.name) ? [path] : [];
	});
}

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** A file's CSS: the whole of a .css file, the <style> blocks of an .astro one. */
function cssOf(file: string): string {
	const text = readFileSync(file, "utf8");
	if (file.endsWith(".css")) return stripComments(text);
	return stripComments(
		[...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n"),
	);
}

const sheets = sourceFiles(SRC).map((file) => ({ name: relative(SRC, file), css: cssOf(file) }));

/** Every match of `pattern`, as »file: the declaration it sits in«. */
function hits(
	pattern: RegExp,
	skip: (name: string, line: string) => boolean = () => false,
): string[] {
	return sheets.flatMap(({ name, css }) =>
		css
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => pattern.test(line) && !skip(name, line))
			.map((line) => `${name}: ${line}`),
	);
}

it("reads the stylesheets it claims to hold", () => {
	expect(sheets.length).toBeGreaterThan(80);
	expect(sheets.find((s) => s.name === "styles/layout.css")?.css.length).toBeGreaterThan(10_000);
});

// ---------------------------------------------------------------------------
// 1. The palette is closed
// ---------------------------------------------------------------------------

describe("the palette is closed", () => {
	// The moskéskärm is its own always-dark room with a navy palette of its own, registered
	// with @property so its colours can transition (MosqueScreen.astro, Screen.astro,
	// skarm/visa.astro). It is a wall in a mosque, not a page of the site.
	const SCREEN =
		/^(layouts\/Screen\.astro|pages\/bonetider\/skarm\/visa\.astro|components\/bonetider\/MosqueScreen\.astro)$/;

	it("no stylesheet outside tokens.css types a colour", () => {
		const literal = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\(/i;
		const offenders = hits(literal, (name, line) => {
			if (name === "styles/tokens.css" || SCREEN.test(name)) return true;
			// A mask's #000 is opacity, and print sets black ink on white paper: neither is
			// a colour of the palette.
			if (name === "styles/layout.css" && line.startsWith("mask: radial-gradient(")) return true;
			if (name === "styles/typography.css" && line === "color: #000 !important;") return true;
			// url(#id) and a fragment are not colours.
			return /url\(["']?#/.test(line) && !literal.test(line.replace(/url\([^)]*\)/g, ""));
		});
		expect(
			offenders,
			"A colour typed at a call site is a role tokens.css does not know about, and the next " +
				"file will type it one shade off. Use the token; if the role is missing, add it to " +
				"tokens.css (and to tokens.test.ts if text sits on it).",
		).toEqual([]);
	});

	it("no stylesheet mixes a colour of its own, except a chart cutting its fills from tokens", () => {
		// Each of these draws data, and alpha or a mix is how its marks rank: the night's
		// two depths, the public-opinion bar's five shares, a prayer's own line colour as
		// a row wash. All of them mix tokens (the test above forbids a literal in them).
		const CHARTS = new Set([
			"styles/ai-barometern-chips.css",
			"components/bonetider/SunDayCurve.astro",
			"components/bonetider/AnnualPrayerChart.astro",
			"components/bonetider/PrayerField.astro",
		]);
		const offenders = hits(
			/\bcolor-mix\(/,
			(name) => name === "styles/tokens.css" || SCREEN.test(name) || CHARTS.has(name),
		);
		expect(
			offenders,
			"A color-mix() at a call site is a hand-mixed tint: tokens.css has two washes, two " +
				"surfaces, two hairlines, a faint line, a quiet underline, glass and three shadows. " +
				"Take one of them, or add the missing role there.",
		).toEqual([]);
	});

	it("a shadow is one of the three in tokens.css", () => {
		// `0 0 0 Npx` and `inset 0 0 0 Npx` are rings and lines drawn with box-shadow, not
		// shadows: they cast nothing. Everything else names its elevation.
		const offenders = hits(/\bbox-shadow:/, (name, line) => {
			if (name === "styles/tokens.css" || SCREEN.test(name)) return true;
			const value = line
				.replace(/^box-shadow:\s*/, "")
				.replace(/\s*!important/, "")
				.replace(/;$/, "");
			if (value === "none" || /^var\(--shadow-(raised|float|sheet)\)$/.test(value)) return true;
			return (
				/^(inset )?0 (0|1px) 0( [\d.]+(px|rem))? /.test(value) || /^inset [\d.]+px 0 /.test(value)
			);
		});
		expect(
			offenders,
			"Only what stands above the page casts a shadow (DESIGN.md, Principle 4), and it casts " +
				"--shadow-raised, --shadow-float or --shadow-sheet.",
		).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// 2. The type scale is closed
// ---------------------------------------------------------------------------

describe("the type scale is closed", () => {
	// DESIGN.md, »The Scale«: display type composed for one place, and text inside a
	// viewBox, which is sized in the drawing's own units.
	const EXCEPTIONS: Record<string, string[]> = {
		// The wordmark: the heaviest thing in the mast, fluid from 18 to 26px; a size up in
		// the footer; held at 17px where a 320px row must fit it.
		"styles/layout.css": ["clamp(1.125rem, 0.5rem + 1.6vw, 1.625rem)"],
		"components/Footer.astro": ["1.75rem"],
		"styles/editorial.css": ["1.0625rem"],
		// The Arabic verse: Amiri's naskh runs small on its em.
		"styles/quran-verse.css": ["1.5rem", "1.375rem"],
		// The pull quote; print, which is set in points; and a glyph hidden by size 0.
		"styles/typography.css": ["clamp(1.45rem, 1.1rem + 1.5vw, 2.1rem)", "11pt", "9pt", "0"],
		// User units inside a figure's viewBox (the note in SunDayCurve.astro).
		"components/bonetider/SunDayCurve.astro": ["14px", "12px"],
		"components/bonetider/AsrShadow.astro": ["10px", "11px", "12px", "13px"],
		"components/bonetider/AnnualPrayerChart.astro": ["14px", "12px"],
		"styles/ai-barometern.css": ["11px"],
	};

	it("a font size is a step, an em of one, or a named exception", () => {
		const offenders = sheets.flatMap(({ name, css }) =>
			[...css.matchAll(/(?<![\w-])font-size:\s*([^;}]+)/g)]
				.map((m) => (m[1] ?? "").trim())
				.filter((value) => {
					if (/^var\(--[a-z0-9-]+(,\s*var\(--[a-z0-9-]+\))?\)$/.test(value)) return false;
					if (
						/^(inherit|100%|[\d.]+em|[\d.]+c[qv][whib]|calc\(.*c[qv][whib].*\)|clamp\(.*c[qv][whib].*\))$/.test(
							value,
						)
					)
						return false;
					return !(EXCEPTIONS[name] ?? []).includes(value);
				})
				.map((value) => `${name}: font-size: ${value}`),
		);
		expect(
			offenders,
			"Every size belongs to the scale in tokens.css (--step-*, --title-cover, --input-size). " +
				"13px and 13.12px both meaning »label« is how the sub-body half came to be written " +
				"down. A size composed for one place is listed in this test with its reason.",
		).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// 3. Written for the browser floor
// ---------------------------------------------------------------------------

describe("the CSS is written for the browser floor", () => {
	it("media queries are ranges in rem", () => {
		const offenders = hits(
			/@(media|container)[^{]*\b(min|max)-(width|height|inline-size|block-size)\b/,
		)
			.concat(hits(/@(media|container)[^{]*\b(width|height|inline-size)\s*[<>]=?\s*[\d.]+px/))
			.concat(hits(/@(media|container)[^{]*[\d.]+px\s*[<>]=?\s*(width|height|inline-size)/));
		expect(
			offenders,
			"Write `(width >= 48rem)`, on one of DESIGN.md's lines. A px query does not move with " +
				"the reader's text size, so half the page turns at one width and half at another.",
		).toEqual([]);
	});

	it("sides and sizes are logical, on both axes", () => {
		// Half the stylesheets wrote margin-block-end and inline-size and half margin-bottom
		// and width; one rule now. The exceptions are the parts of a native control the two
		// engines expose (a range's thumb and track, a search field's clear button), whose
		// boxes are only specified to take the physical properties.
		const physical =
			/(?<![\w-])(margin|padding|border|scroll-margin|scroll-padding)-(top|right|bottom|left)(-(color|width|style))?\s*:|(?<![\w-])(top|right|bottom|left)\s*:|(?<![\w-])(min-|max-)?(width|height)\s*:|(?<![\w-])(text-align|float|clear)\s*:\s*(left|right)\b|border-(top|bottom)-(left|right)-radius/;
		const NATIVE_PARTS: Record<string, string[]> = {
			"components/FloatingPlayer.astro": [
				"width: 0.875rem;",
				"height: 0.875rem;",
				"height: 0.1875rem;",
			],
			"pages/bonetider/skarm/index.astro": ["width: 0.75rem;", "height: 0.75rem;"],
		};
		expect(
			hits(physical, (name, line) => (NATIVE_PARTS[name] ?? []).includes(line)),
			"Use margin-block-start, inset-inline-end, inline-size, text-align: start and their " +
				"kin. The Arabic on this site sits in right-to-left runs, and a logical property is " +
				"right in both directions. (Careful with `text-align: start` on a <table>: a <th> " +
				"centres itself when what it inherits is `start`, so set it on the cells.)",
		).toEqual([]);
	});

	it("a shorthand does not hide a left or a right", () => {
		// `padding: 0 1rem 0 0` is padding-right by another name. Top-level spaces only, so
		// a calc() counts as one value.
		const values = (v: string) => {
			const parts: string[] = [];
			let depth = 0;
			let cur = "";
			for (const ch of v.trim()) {
				if (ch === "(") depth++;
				if (ch === ")") depth--;
				if (ch === " " && depth === 0) {
					if (cur) parts.push(cur);
					cur = "";
				} else cur += ch;
			}
			if (cur) parts.push(cur);
			return parts;
		};
		const offenders = sheets.flatMap(({ name, css }) =>
			[...css.matchAll(/(?<![\w-])(margin|padding|inset)\s*:\s*([^;{}]+)/g)]
				.filter((m) => {
					const v = values(m[2] ?? "");
					return v.length === 4 && v[1] !== v[3];
				})
				.map((m) => `${name}: ${m[0].trim()}`),
		);
		expect(
			offenders,
			"Write the two axes apart: `padding-block: 0; padding-inline: 0 1rem` (start, then end).",
		).toEqual([]);
	});

	it("no vendor prefix where the standard property runs", () => {
		// What is left has no standard form at the floor: WebKit's font smoothing and tap
		// highlight, the two engines' range, search and marker parts, WebKit's line clamp,
		// and Safari's spellings of initial-letter and the hyphenation limits, each written
		// beside the standard one.
		const KEPT =
			/(::)?-webkit-(font-smoothing|tap-highlight-color|slider-thumb|search-cancel-button|details-marker|scrollbar|box|box-orient|line-clamp|initial-letter|hyphenate-limit-(before|after|lines))\b|(::)?-moz-range-(thumb|track)\b/g;
		// Not preceded by a word character or a dash: `--ms-title` is a custom property.
		const prefixed = /(?<![\w-])-(webkit|moz|ms|o)-[a-z]|::-(webkit|moz|ms|o)-[a-z]/;
		const offenders = hits(prefixed, (_name, line) => !prefixed.test(line.replace(KEPT, "")));
		expect(
			offenders,
			"Write the standard property: Lightning CSS adds the prefix a browser at the floor still " +
				"needs (astro.config.ts MODERN_BROWSERS), and a hand-written twin is dropped or doubled.",
		).toEqual([]);
	});

	it("a single translate, rotate or scale is its own property", () => {
		// The moskéskärm composes its pixel shift from two custom properties, and the
		// reading-progress bar is driven both by a scroll timeline and, where there is
		// none, by a script that writes the same transform.
		const offenders = hits(
			/(?<![\w-])transform:\s*(translate[XY]?|rotate|scale)\([^()]*\)\s*;?$/,
			(name, line) => {
				if (name === "components/bonetider/MosqueScreen.astro") return true;
				return name === "styles/layout.css" && /scaleX\(/.test(line);
			},
		);
		expect(
			offenders,
			"`translate: 0 -100%` and `rotate: 45deg` compose with each other and transition on their " +
				"own; a `transform` shorthand has to restate every function to change one.",
		).toEqual([]);
	});
});
