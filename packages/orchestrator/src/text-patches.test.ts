import { describe, expect, it } from "vitest";
import {
	applyTextPatches,
	isCosmeticRewrite,
	locatePatch,
	measureRewrite,
	renumberFootnotes,
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

	// The editor's rule: a reference to an earlier essay is always a link. A language pass
	// that rewords the sentence and writes the title without its link undoes that silently,
	// and no later stage would put it back.
	it("refuses an edit that drops or redirects a link", () => {
		const linked =
			"Det har essän [Äter ni var för sig?](/ater-ni-var-for-sig/) visat med Ibn Khaldūn.";
		const out = applyTextPatches(linked, [
			p(
				"Det har essän [Äter ni var för sig?](/ater-ni-var-for-sig/) visat",
				"Det har essän Äter ni var för sig? visat",
			),
			p("(/ater-ni-var-for-sig/)", "(/ater-ni-tillsammans/)"),
		]);
		expect(out.applied, "a link must survive every prose edit unchanged").toHaveLength(0);
		expect(new Set(out.rejected.map((r) => r.reason))).toEqual(
			new Set(["drops or changes a link"]),
		);
		expect(out.body).toBe(linked);

		const kept = applyTextPatches(linked, [
			p(
				"Det har essän [Äter ni var för sig?](/ater-ni-var-for-sig/) visat med Ibn Khaldūn.",
				"Med Ibn Khaldūn har essän [Äter ni var för sig?](/ater-ni-var-for-sig/) visat det.",
			),
		]);
		expect(kept.applied, "rewording around an intact link is an ordinary edit").toHaveLength(1);
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

describe("applyTextPatches with sourceEdits (the review and verify stages)", () => {
	const essay = [
		"# Rubrik",
		"",
		'Han skrev 1973 att "allt är sagt".[^1]',
		"",
		"> Ett citat som står kvar.",
		"",
		"[^1]: Källa, s. 12.",
	].join("\n");

	// The post-review stages may not touch numbers, quotations, headings or notes. The gate
	// stages must: correcting »1973« to the sourced »1974« is exactly what verification is for.
	it("lets a gate stage correct a number, a quotation, a heading and a note", () => {
		const patches = [
			{ original: "skrev 1973 att", replacement: "skrev 1974 att" },
			{ original: "# Rubrik", replacement: "# Ny rubrik" },
			{ original: "[^1]: Källa, s. 12.", replacement: "[^1]: Källa, s. 14." },
		];
		const guarded = applyTextPatches(essay, patches);
		expect(
			guarded.applied,
			"without sourceEdits every one of these must still be refused, or the post-review stages can rewrite facts",
		).toHaveLength(0);

		const gate = applyTextPatches(essay, patches, { sourceEdits: true });
		expect(gate.rejected, "a gate stage's source corrections must apply").toHaveLength(0);
		expect(gate.body).toContain("skrev 1974 att");
		expect(gate.body).toContain("# Ny rubrik");
		expect(gate.body).toContain("s. 14.");
	});

	it("still refuses a patch that matches nowhere or in two places", () => {
		const twice = "Ordet står här. Ordet står där.";
		const result = applyTextPatches(
			twice,
			[
				{ original: "Ordet", replacement: "Talet" },
				{ original: "finns inte", replacement: "x" },
			],
			{ sourceEdits: true },
		);
		expect(result.applied).toHaveLength(0);
		expect(result.body, "an ambiguous patch must leave the text untouched").toBe(twice);
	});
});

describe("renumberFootnotes", () => {
	it("leaves a sequential essay byte-identical", () => {
		const body = "Ett.[^1] Två.[^2]\n\n[^1]: A\n[^2]: B";
		const result = renumberFootnotes(body);
		expect(result.body).toBe(body);
		expect(result).toMatchObject({ renumbered: 0, dropped: [], dangling: [] });
	});

	// A reviewer patch that cuts the sentence carrying [^2] leaves note 2 orphaned and note 3
	// out of sequence; the published page would then number its notes 1, 3.
	it("closes the gap a cut leaves and drops the orphaned definition", () => {
		const body = "Ett.[^1] Tre.[^3]\n\n[^1]: A\n[^2]: B\n[^3]: C";
		const result = renumberFootnotes(body);
		expect(result.body).toBe("Ett.[^1] Tre.[^2]\n\n[^1]: A\n[^2]: C");
		expect(result.dropped).toEqual(["2"]);
		expect(result.renumbered).toBe(1);
	});

	it("numbers by order of appearance and keeps each note with its text", () => {
		const body =
			"Först.[^8b] Sedan.[^2]\n\n[^2]: Andra källan\n[^8b]: Första källan\n    fortsättning";
		const result = renumberFootnotes(body);
		expect(result.body).toBe(
			"Först.[^1] Sedan.[^2]\n\n[^1]: Första källan\n    fortsättning\n[^2]: Andra källan",
		);
	});

	it("reports a marker without a definition and ignores markers inside a code fence", () => {
		const body = "Text.[^1] Mer.[^4]\n\n```chart\nnote: se [^9]\n```\n\n[^1]: A";
		const result = renumberFootnotes(body);
		expect(result.dangling, "a marker with no note must be surfaced, not silently kept").toEqual([
			"4",
		]);
		expect(result.body).toContain("note: se [^9]");
		expect(result.body).toContain("Mer.[^2]");
	});

	it("PROPERTY: every marker left in the prose has a number 1..n with no gaps", () => {
		const body = "A.[^5] B.[^3] C.[^5] D.[^10]\n\n[^3]: x\n[^5]: y\n[^10]: z\n[^11]: orphan";
		const result = renumberFootnotes(body);
		const prose = result.body.split("\n\n")[0] ?? "";
		const ids = [...new Set([...prose.matchAll(/\[\^(\d+)\]/g)].map((m) => Number(m[1])))];
		expect(ids).toEqual(ids.map((_, i) => i + 1));
		expect(renumberFootnotes(result.body).body, "renumbering must be idempotent").toBe(result.body);
	});
});
