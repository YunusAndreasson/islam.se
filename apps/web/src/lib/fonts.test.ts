import { readFileSync } from "node:fs";
import { create } from "fontkitten";
import { describe, expect, it } from "vitest";
import { CORE_RANGE, FAMILIES, type FontVariable, locate } from "./fonts";

const FONTS = new URL("../assets/fonts/", import.meta.url);

/** The codepoints a file can draw. U+FFFF is the subsetter's placeholder, not a glyph. */
function glyphsOf(file: string): Set<number> {
	const font = create(readFileSync(new URL(file, FONTS)));
	if (!("characterSet" in font)) throw new Error(`${file} is a collection, not a font`);
	return new Set(font.characterSet.filter((cp) => cp !== 0xffff));
}

/** "U+0102-0129" → every codepoint in it. */
function codepointsOf(ranges: readonly string[]): Set<number> {
	const out = new Set<number>();
	for (const range of ranges) {
		const [from, to = from] = range.replace("U+", "").split("-");
		for (let cp = Number.parseInt(from ?? "", 16); cp <= Number.parseInt(to ?? "", 16); cp++) {
			out.add(cp);
		}
	}
	return out;
}

const hex = (cp: number) => `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
const sample = (cps: number[]) => cps.slice(0, 8).map(hex).join(", ");

const families = Object.keys(FAMILIES) as FontVariable[];
const ranged = families.flatMap((v) => FAMILIES[v].filter((f) => f.range !== undefined));

describe("font files and their declared ranges", () => {
	// The bug this exists for: the ext ranges were written as »everything outside core«
	// (U+2320-FFFF and the like). ﷺ (U+FDFA) is in neither Literata file, but the range
	// claimed it, so every page with an honorific downloaded 92 kB that could not draw
	// it. A range the file cannot back is a download for nothing, on every such page.
	it.each(ranged.filter((f) => f.range !== CORE_RANGE))(
		"$file declares exactly the glyphs it holds",
		({ file, range }) => {
			const held = glyphsOf(file);
			const declared = codepointsOf(range ?? []);
			const phantom = [...declared].filter((cp) => !held.has(cp));
			const orphaned = [...held].filter((cp) => !declared.has(cp));
			expect(
				phantom,
				`${file} claims ${phantom.length} codepoints it has no glyph for (${sample(phantom)}). ` +
					"The browser fetches the file for any of them and still falls back. " +
					"Declare the file's own coverage in src/lib/fonts.ts.",
			).toEqual([]);
			expect(
				orphaned,
				`${file} holds ${orphaned.length} glyphs no range reaches (${sample(orphaned)}), ` +
					"so they can never be used. Re-cut the file or widen its range.",
			).toEqual([]);
		},
	);

	// Core may claim more than it holds (it is always loaded, so a miss costs nothing),
	// but never less: a glyph outside the range is dead weight in the one file every
	// page downloads.
	it.each(ranged.filter((f) => f.range === CORE_RANGE))(
		"$file holds nothing outside the core range",
		({ file }) => {
			const core = codepointsOf(CORE_RANGE);
			const outside = [...glyphsOf(file)].filter((cp) => !core.has(cp));
			expect(
				outside,
				`${file} carries glyphs the core range does not reach (${sample(outside)}).`,
			).toEqual([]);
		},
	);

	// Two files of one family and style must never both claim a character, or the
	// browser fetches both to draw it.
	it("keeps core and ext disjoint within each family and style", () => {
		for (const variable of families) {
			const seen = new Map<string, Set<number>>();
			for (const { file, style, range } of FAMILIES[variable]) {
				if (range === undefined) continue;
				const mine = codepointsOf(range);
				const others = seen.get(style) ?? new Set<number>();
				const shared = [...mine].filter((cp) => others.has(cp));
				expect(
					shared,
					`${file} and another ${style} file of ${variable} both claim ${sample(shared)}.`,
				).toEqual([]);
				seen.set(style, new Set([...others, ...mine]));
			}
		}
	});

	// What the split is for: the letters the corpus transliterates with are in the
	// file every page already has, so an essay never fetches ext for a ḥ or an ʿ.
	it("keeps the transliteration letters in Literata's core, roman and italic", () => {
		const needed = [..."āīūĀĪŪʾʿḍḥṛṣṭẓḌḤṢṬẒ"].map((ch) => ch.codePointAt(0) ?? 0);
		for (const file of ["literata-roman-core.woff2", "literata-italic-core.woff2"]) {
			const held = glyphsOf(file);
			const missing = needed.filter((cp) => !held.has(cp));
			expect(
				missing,
				`${file} lacks ${sample(missing)}; transliterated terms would fetch ext.`,
			).toEqual([]);
		}
	});

	// Base.astro finds a file's URL by its position in the family; a face that cannot
	// be located is a preload that throws at build.
	it("locates every face at the position its family lists it", () => {
		for (const variable of families) {
			for (const [index, { face }] of FAMILIES[variable].entries()) {
				expect(locate(face)).toEqual({ cssVariable: variable, index });
			}
		}
	});
});
