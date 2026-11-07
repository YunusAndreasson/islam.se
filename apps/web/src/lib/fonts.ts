/**
 * The font files and what each one holds. One table for the two places that must
 * agree on it: astro.config.ts, which declares the families, and Base.astro, which
 * preloads single files out of them.
 *
 * Each family is cut in two. CORE is what nearly every page sets: Latin-1, the
 * typographic punctuation, the arrows, and the transliteration letters the corpus
 * uses. EXT is the rest of the file's Latin. A page fetches ext only when it sets a
 * character ext actually has.
 *
 * ⚠️ An ext range is the file's own coverage, glyph for glyph. It used to be written
 * as »everything outside core« (U+2320-FFFF and the like), which reads as a safety net
 * and is the opposite: ﷺ (U+FDFA) is in neither file, but the range claimed it, so
 * every page with an honorific downloaded 92 kB of Literata that could not draw it,
 * and the glyph came from a system font regardless. fonts.test.ts holds each list to
 * its file. Regenerate the lists with the files (scripts/subset-fonts.ts).
 */

/** What the core files are cut to. A superset of what each holds, on purpose: core is
 *  always loaded, so claiming a little more costs nothing and keeps the list short. */
export const CORE_RANGE = [
	"U+0000-00FF",
	"U+2000-206F",
	"U+2190-21FF",
	"U+2300-231F",
	// The transliteration pairs: ā ī ş š ū, ʾ ʿ, ḍ ḥ ṛ ṣ ṭ ẓ.
	"U+0100-0101",
	"U+012A-012B",
	"U+015E-0161",
	"U+016A-016B",
	"U+02BE-02BF",
	"U+1E0C-1E0D",
	"U+1E24-1E25",
	"U+1E5A-1E5B",
	"U+1E62-1E63",
	"U+1E6C-1E6D",
	"U+1E92-1E93",
];

/** honorific.woff2: ﷺ and ﷻ, the two glyphs and nothing else (2 kB, cut from Amiri). */
const HONORIFIC_RANGE = ["U+FDFA-FDFB"];

/** literata-roman-ext.woff2 and literata-italic-ext.woff2: 434 codepoints. */
export const LITERATA_EXT_RANGE = [
	"U+0102-0129",
	"U+012C-015D",
	"U+0162-0169",
	"U+016C-017E",
	"U+018F",
	"U+0192",
	"U+01A0-01A1",
	"U+01AF-01B0",
	"U+01C4-01DC",
	"U+01E6-01E7",
	"U+01EA-01EB",
	"U+01FA-021B",
	"U+022A-022D",
	"U+0230-0233",
	"U+0237",
	"U+02B9-02BC",
	"U+02C6-02CC",
	"U+02D8-02DD",
	"U+0300-0304",
	"U+0306-030C",
	"U+030F",
	"U+0311-0312",
	"U+031B",
	"U+0323-0324",
	"U+0326-0328",
	"U+032E",
	"U+0331",
	"U+1E08-1E09",
	"U+1E0E-1E0F",
	"U+1E14-1E17",
	"U+1E1C-1E1D",
	"U+1E20-1E21",
	"U+1E2A-1E2B",
	"U+1E2E-1E2F",
	"U+1E36-1E3B",
	"U+1E42-1E49",
	"U+1E4C-1E53",
	"U+1E5C-1E61",
	"U+1E64-1E69",
	"U+1E6E-1E6F",
	"U+1E78-1E7B",
	"U+1E80-1E85",
	"U+1E8E-1E8F",
	"U+1E97",
	"U+1E9E",
	"U+1EA0-1EF9",
	"U+2070",
	"U+2074-2079",
	"U+207D-2089",
	"U+208D-208E",
	"U+20A1",
	"U+20A3-20A4",
	"U+20A6-20A7",
	"U+20A9",
	"U+20AB-20AE",
	"U+20B1-20B2",
	"U+20B4-20B5",
	"U+20B8-20BA",
	"U+20BC-20BD",
	"U+FB01-FB02",
];

/** source-sans-3-roman-ext.woff2: 302 codepoints. */
export const SOURCE_SANS_EXT_RANGE = [
	"U+0102-0129",
	"U+012C-015D",
	"U+0162-0169",
	"U+016C-0181",
	"U+0186",
	"U+018A",
	"U+018D-0190",
	"U+0192-0194",
	"U+0196-0197",
	"U+019A-019B",
	"U+019E",
	"U+01A0-01A1",
	"U+01AF-01B1",
	"U+01B7",
	"U+01BF-01C3",
	"U+01CD-01DD",
	"U+01E2-01E7",
	"U+01EA-01EB",
	"U+01EE-01F0",
	"U+01F4-01F5",
	"U+01F7-0201",
	"U+0204-0205",
	"U+0208-0209",
	"U+020C-020D",
	"U+0218-0220",
	"U+0222-0223",
	"U+0226-0227",
	"U+0237",
	"U+023A-023E",
	"U+0241-0245",
	"U+0248-0249",
	"U+0300-030D",
	"U+030F-0313",
	"U+0315",
	"U+0318-0320",
	"U+0323-032A",
	"U+032C",
	"U+032E-0332",
	"U+0334",
	"U+0337-033D",
	"U+0340",
	"U+0342-0345",
	"U+034F",
	"U+0357-0358",
	"U+035C",
	"U+035E-035F",
	"U+0361",
	"U+2200",
	"U+2202-2203",
	"U+2206",
	"U+220F",
	"U+2211-2212",
	"U+2215",
	"U+2219-221A",
	"U+221E-221F",
	"U+2229",
	"U+222B",
	"U+2236-2237",
	"U+2248",
	"U+2260-2261",
	"U+2264-2265",
];

const FONTS = "./src/assets/fonts";

/**
 * Every file, in the order its family lists it. `fontData` (astro:assets) keeps this
 * order, so a file's position here is how Base.astro finds its hashed URL — which is
 * why the config builds its `variants` from this table and not from a list of its own.
 */
export const FAMILIES = {
	"--font-body": [
		{
			face: "body",
			file: "literata-roman-core.woff2",
			weight: "300 700",
			style: "normal",
			range: CORE_RANGE,
		},
		{
			face: "bodyExt",
			file: "literata-roman-ext.woff2",
			weight: "300 700",
			style: "normal",
			range: LITERATA_EXT_RANGE,
		},
		{
			face: "italic",
			file: "literata-italic-core.woff2",
			weight: "300 700",
			style: "italic",
			range: CORE_RANGE,
		},
		{
			face: "italicExt",
			file: "literata-italic-ext.woff2",
			weight: "300 700",
			style: "italic",
			range: LITERATA_EXT_RANGE,
		},
	],
	"--font-heading": [
		{
			face: "sans",
			file: "source-sans-3-roman-core.woff2",
			weight: "300 700",
			style: "normal",
			range: CORE_RANGE,
		},
		{
			face: "sansExt",
			file: "source-sans-3-roman-ext.woff2",
			weight: "300 700",
			style: "normal",
			range: SOURCE_SANS_EXT_RANGE,
		},
	],
	"--font-headline": [
		{
			face: "display",
			file: "literata-display.woff2",
			weight: "400 700",
			style: "normal",
			range: undefined,
		},
	],
	"--font-arabic": [
		{ face: "arabic", file: "amiri-quran.woff2", weight: "400", style: "normal", range: undefined },
	],
	"--font-honorific": [
		{
			face: "honorific",
			file: "honorific.woff2",
			weight: "400",
			style: "normal",
			range: HONORIFIC_RANGE,
		},
	],
} as const;

export type FontVariable = keyof typeof FAMILIES;
export type FontFace = (typeof FAMILIES)[FontVariable][number]["face"];

interface Variant {
	weight: string;
	style: "normal" | "italic";
	src: [string];
	unicodeRange?: [string, ...string[]];
}

/** A family's `variants`, as the local font provider takes them: at least one. */
export function variantsOf(cssVariable: FontVariable): [Variant, ...Variant[]] {
	const [first, ...rest] = FAMILIES[cssVariable].map(({ file, weight, style, range }): Variant => {
		const [from, ...more] = range ?? [];
		return {
			weight,
			style,
			src: [`${FONTS}/${file}`],
			...(from === undefined ? {} : { unicodeRange: [from, ...more] }),
		};
	});
	if (!first) throw new Error(`${cssVariable} lists no font files.`);
	return [first, ...rest];
}

/** Where a face sits: its family and its position in that family's `fontData`. */
export function locate(face: FontFace): { cssVariable: FontVariable; index: number } {
	for (const cssVariable of Object.keys(FAMILIES) as FontVariable[]) {
		const index = FAMILIES[cssVariable].findIndex((f) => f.face === face);
		if (index >= 0) return { cssVariable, index };
	}
	throw new Error(`No font file is registered for the face "${face}".`);
}
