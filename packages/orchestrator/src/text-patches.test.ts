import { describe, expect, it } from "vitest";
import {
	applyTextPatches,
	isCosmeticRewrite,
	locatePatch,
	measureRewrite,
	type TextPatch,
} from "./text-patches.js";

const body = [
	"# Titel",
	"",
	"Rösten är något man svarar för. Den ges inte som tack.[^1]",
	"",
	"> Stå jämnt och var inte oense.[^2]",
	"",
	'Han skrev "ingen rad utan ordning" år 1974.',
	"",
	"[^1]: Ibn Taymiyya, *as-Siyāsa ash-sharʿiyya*.",
	"[^2]: Muslim nr 432.",
].join("\n");

const p = (original: string, replacement: string): TextPatch => ({ original, replacement });

describe("applyTextPatches", () => {
	it("applies an exact prose edit and keeps the rest byte-identical", () => {
		const out = applyTextPatches(body, [p("Den ges inte som tack.", "Den är ingen gåva.")]);
		expect(out.applied).toHaveLength(1);
		expect(out.body).toBe(body.replace("Den ges inte som tack.", "Den är ingen gåva."));
	});

	it("finds an original the model copied with other whitespace and quote style", () => {
		const out = applyTextPatches(body, [
			p(
				"Han skrev »ingen rad utan ordning«   år 1974.",
				'Han skrev "ingen rad utan ordning" redan år 1974.',
			),
		]);
		expect(out.applied).toHaveLength(1);
		expect(out.body).toContain("redan år 1974");
	});

	it("never edits a block quote, a footnote definition or a heading", () => {
		const out = applyTextPatches(body, [
			p("Stå jämnt och var inte oense.", "Stå rakt."),
			p("Muslim nr 432.", "Muslim, nr 432."),
			p("# Titel", "# Ny titel"),
		]);
		expect(out.applied).toHaveLength(0);
		expect(out.rejected.map((r) => r.reason)).toEqual([
			"touches a block quote",
			"touches a footnote definition",
			"touches a heading",
		]);
		expect(out.body).toBe(body);
	});

	// A prose pass after fact-check must not change what fact-check verified: a year, a
	// quotation's words, or which footnote a claim hangs on.
	it("refuses edits that drop a footnote marker, reword a quotation or change a number", () => {
		const out = applyTextPatches(body, [
			p("Den ges inte som tack.[^1]", "Den ges inte som tack."),
			p('"ingen rad utan ordning"', '"ingen rad utan reda"'),
			p("år 1974", "år 1973"),
		]);
		expect(out.applied).toHaveLength(0);
		expect(new Set(out.rejected.map((r) => r.reason))).toEqual(
			new Set(["changes a footnote marker, a quotation or a number"]),
		);
	});

	it("refuses ambiguous originals and honours the cap and the stage veto", () => {
		const text = "Samma. Samma. Ett. Två. Tre.";
		const out = applyTextPatches(
			text,
			[p("Samma.", "Annan."), p("Ett.", "Ett!"), p("Två.", "Två!"), p("Tre.", "Det är tre.")],
			{
				maxApplied: 2,
				vet: (x) => (x.replacement.startsWith("Det är") ? "formula opener" : undefined),
			},
		);
		expect(out.applied.map((x) => x.original)).toEqual(["Ett.", "Två."]);
		expect(out.rejected.map((r) => r.reason)).toEqual([
			"original was not unique in the current text",
			"over the stage's cap of 2",
		]);
	});

	it("reports an original that is not in the text", () => {
		expect(locatePatch(body, "En mening som aldrig skrevs.")).toEqual({
			error: "original was not found in the text",
		});
	});
});

describe("measureRewrite", () => {
	const essay = Array.from(
		{ length: 12 },
		(_, i) =>
			`Stycke ${i} handlar om raden och om vad predikstolen får säga när valet är avgjort och landet väntar på en regering som ännu inte finns.`,
	).join("\n\n");

	it("counts a few swapped words as cosmetic", () => {
		const after = essay
			.replace("Stycke 3 handlar", "Stycke 3 rör")
			.replace("valet är avgjort", "valet är klart");
		expect(isCosmeticRewrite(measureRewrite(essay, after))).toBe(true);
	});

	// »Sorgen vid Nilen«: the reviewer's »publish« round added an argument paragraph that
	// no one reviewed. A new paragraph is never cosmetic, however short the rest of the diff.
	it("flags an added argument paragraph even when the rest is untouched", () => {
		const added =
			"Varje valguide har redan valt vilka frågor som räknas, och den som följer guiden har därmed låtit någon annan väga åt sig innan rösten ens är lagd i kuvertet.";
		const extent = measureRewrite(essay, `${essay}\n\n${added}`);
		expect(extent.newParagraphs).toHaveLength(1);
		expect(isCosmeticRewrite(extent)).toBe(false);
	});

	it("flags a broad rewrite", () => {
		const rewritten = essay.replace(/handlar om raden och om vad/g, "gäller vad");
		expect(measureRewrite(essay, rewritten).changedRatio).toBeGreaterThan(0.04);
	});
});
