import { describe, expect, it } from "vitest";
import {
	factCheckPassed,
	formatQuranReferences,
	formatResearchForFactCheck,
	isDatabaseQuoteId,
	proseCorrectionAcceptable,
	type ResearchOutput,
	reviewPassed,
	splitBriefRequirements,
	trackResearchReferences,
	triageVerification,
	type VerifyItem,
} from "./index.js";
import { ReferenceTracker } from "./reference-tracker.js";

describe("pipeline gates", () => {
	it("requires a passing fact-check verdict as well as the score", () => {
		const base = {
			overallCredibility: 8,
			summary: "",
			verifiedClaims: [],
			sourceAssessment: { totalSources: 1, highCredibility: 1 },
		};

		expect(factCheckPassed({ ...base, verdict: "pass" }, 7.5)).toBe(true);
		expect(factCheckPassed({ ...base, verdict: "revise" }, 7.5)).toBe(false);
		expect(factCheckPassed({ ...base, verdict: "reject" }, 7.5)).toBe(false);
		expect(factCheckPassed({ ...base, verdict: "pass", overallCredibility: 7.4 }, 7.5)).toBe(false);
	});

	it("requires the review verdict and minimum score to agree", () => {
		expect(reviewPassed({ finalScore: 8, verdict: "publish", summary: "" })).toBe(true);
		expect(reviewPassed({ finalScore: 7.9, verdict: "publish", summary: "" })).toBe(false);
		expect(reviewPassed({ finalScore: 8.5, verdict: "revise", summary: "" })).toBe(false);
	});

	// The Codex audit's word-choice fixes (»villkor till« → »villkor för«) leave the
	// evaluator's count unchanged. Demanding a strict drop discarded them, and two real
	// errors shipped in »Sorgen vid Nilen« and »Rösten är ingen belöning«.
	it("accepts a guarded correction that leaves the measured count unchanged", () => {
		expect(proseCorrectionAcceptable(21, 20)).toBe(true);
		expect(proseCorrectionAcceptable(21, 21)).toBe(true);
		expect(proseCorrectionAcceptable(21, 22)).toBe(false);
		expect(proseCorrectionAcceptable(21, undefined)).toBe(false);
	});
});

const research = (overrides: Partial<ResearchOutput> = {}): ResearchOutput => ({
	topic: "t",
	summary: "s",
	quranReferences: [],
	quotes: [],
	bookPassages: [],
	sources: [],
	...overrides,
});

describe("fact-check input", () => {
	// datasetChecks came back [] on every run because the datasets were never shown to the
	// fact-checker, so every dataset was dropped before the figures stage could see it.
	it("lists every dataset with its rows, so the checker can give each a verdict", () => {
		const text = formatResearchForFactCheck(
			research({
				datasets: [
					{
						id: "ds-2",
						question: "Valdeltagande per grupp",
						unit: "procent",
						source: "SCB",
						retrieved: "2026-09-14",
						columns: ["2018", "2022"],
						rows: [{ label: "Utrikes födda", values: ["72,1", "68,4"] }],
					},
				],
			}),
		);
		expect(text).toContain("[ds-2] Valdeltagande per grupp (procent)");
		expect(text).toContain("Utrikes födda: 72,1 | 68,4");
	});

	it("shows web and primary-text quotes in full, and only database ids as lookups", () => {
		const long = "ا".repeat(200);
		const text = formatResearchForFactCheck(
			research({
				quotes: [
					{ id: "quote-12", text: long, author: "A" },
					{ id: "primary-ibn-taymiyya-35-39", text: long, author: "Ibn Taymiyya" },
				],
			}),
		);
		expect(text).toContain(`[quote-12] A: "${"ا".repeat(120)}…"`);
		expect(text).toContain(`[primary-ibn-taymiyya-35-39] Ibn Taymiyya: "${long}"`);
		expect(isDatabaseQuoteId("quote-12")).toBe(true);
		expect(isDatabaseQuoteId("12")).toBe(true);
		expect(isDatabaseQuoteId("primary-muslim-568")).toBe(false);
	});
});

describe("brief requirements", () => {
	it("splits the hand-written KRAV block out of the angle", () => {
		const split = splitBriefRequirements({
			angle: "Öppna i raden.\n\n⚠️ KRAV SOM AVGÖR OM SIDAN DUGER. (1) INGEN RÖSTREKOMMENDATION.",
		});
		expect(split.angle).toBe("Öppna i raden.");
		expect(split.requirements).toBe(
			"⚠️ KRAV SOM AVGÖR OM SIDAN DUGER. (1) INGEN RÖSTREKOMMENDATION.",
		);
	});

	it("prefers an explicit requirements field and leaves a plain angle alone", () => {
		expect(splitBriefRequirements({ angle: "A", requirements: " R " })).toEqual({
			angle: "A",
			requirements: "R",
		});
		expect(splitBriefRequirements({ angle: "Bara riktning." })).toEqual({
			angle: "Bara riktning.",
		});
	});
});

describe("Quran references for the author", () => {
	it("offers Bernström as the text to quote, and forbids a blockquote without it", () => {
		const text = formatQuranReferences([
			{
				surah: "an-Nisāʾ",
				ayah: "58",
				verseKey: "4:58",
				text: "Allah befaller er …",
				bernstrom: "GUD befaller er …",
			},
			{ surah: "ar-Rūm", ayah: "31–32", text: "Bland dem som …" },
		]);
		expect(text).toContain('an-Nisāʾ (4:58) — Bernström, quote verbatim: "GUD befaller er …"');
		expect(text).toContain(
			"ar-Rūm 31–32 — no Bernström text was found: do not set this verse as a blockquote",
		);
	});
});

describe("resumed research bibliography", () => {
	it("rebuilds web and quote references from a checkpoint", () => {
		const tracker = new ReferenceTracker();
		trackResearchReferences(tracker, {
			sources: [
				{
					id: "source-1",
					title: "Primärkälla",
					url: "https://example.com/source",
					keyFindings: [],
				},
			],
			quotes: [{ id: "quote-1", text: "Text", author: "Författare", source: "Verket" }],
		});

		const bibliography = tracker.formatSwedishBibliography(false);
		expect(bibliography).toContain("Primärkälla");
		expect(bibliography).toContain("https://example.com/source");
		expect(bibliography).toContain("Författare");
		expect(bibliography).toContain("Verket");
	});
});

describe("triageVerification", () => {
	const item = (claim: string): VerifyItem => ({
		origin: "review",
		claim,
		sentence: `Meningen om ${claim}.`,
		reason: "not in the research",
	});
	const items = [item("A"), item("B"), item("C"), item("D"), item("E")];

	// What this returns as `settled` is handed to the final read as »do not check these
	// again«. Anything settled by mistake is a claim nobody looked at, shipped as checked.
	it("counts as settled only what was confirmed or whose correction landed", () => {
		const placed = { original: "x", replacement: "y" };
		const refused = { original: "saknas", replacement: "z" };
		const result = triageVerification(items, {
			items: [
				{ id: 1, status: "confirmed", evidence: "Källa s. 12" },
				{ id: 2, status: "corrected", evidence: "Källan säger 1974", patch: placed },
				{ id: 3, status: "corrected", evidence: "Källan säger 12", patch: refused },
				{ id: 4, status: "open", evidence: "Sidan gav 403" },
			],
			rejected: [{ patch: refused, reason: "original was not found in the text" }],
		});

		expect(result.settled.map((s) => s[0])).toEqual(["A", "B"]);
		const open = result.open.map((s) => s[0]);
		expect(
			open,
			"a correction the code could not place (C), an open item (D) and an item the stage never answered (E) must all reach the editor",
		).toEqual(["C", "D", "E"]);
	});

	it("does not accept »corrected« or »struck« without a patch, or a second answer to one item", () => {
		const result = triageVerification(items.slice(0, 2), {
			items: [
				{ id: 1, status: "struck", evidence: "Källan motsäger" },
				{ id: 2, status: "open", evidence: "Hittades inte" },
				{ id: 2, status: "confirmed", evidence: "Ändrade mig" },
				{ id: 9, status: "confirmed", evidence: "Finns inte i listan" },
			],
		});
		expect(result.settled, "nothing here was actually settled").toEqual([]);
		expect(result.open).toHaveLength(2);
	});

	it("PROPERTY: every item ends up settled or open, exactly once", () => {
		const result = triageVerification(items, {
			items: [
				{ id: 2, status: "confirmed", evidence: "e" },
				{ id: 5, status: "open", evidence: "e" },
			],
		});
		expect(result.settled.length + result.open.length).toBe(items.length);
	});
});
