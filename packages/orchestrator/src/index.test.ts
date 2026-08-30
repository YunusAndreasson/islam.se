import { describe, expect, it } from "vitest";
import {
	factCheckPassed,
	proseCorrectionImproved,
	reviewPassed,
	trackResearchReferences,
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

	it("accepts a post-review correction only when its measured score improves", () => {
		expect(proseCorrectionImproved(21, 20)).toBe(true);
		expect(proseCorrectionImproved(21, 21)).toBe(false);
		expect(proseCorrectionImproved(21, 22)).toBe(false);
		expect(proseCorrectionImproved(21, undefined)).toBe(false);
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
