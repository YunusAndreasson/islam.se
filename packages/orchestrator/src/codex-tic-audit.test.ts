import { describe, expect, it } from "vitest";
import { applyCodexTicAudit, type CodexTicAudit, type CodexTicPatch } from "./codex-tic-audit.js";

const patch = (overrides: Partial<CodexTicPatch> = {}): CodexTicPatch => ({
	original: "Det kan argumenteras att saken är klar.",
	replacement: "Man kan hävda att saken är klar.",
	category: "anglicism",
	reason: "Översatt akademisk engelska.",
	confidence: "high",
	semanticRisk: false,
	...overrides,
});

const audit = (patches: CodexTicPatch[]): CodexTicAudit => ({
	verdict: patches.length ? "patches" : "clean",
	summary: "Test",
	patches,
});

describe("applyCodexTicAudit", () => {
	it("applies one exact, high-confidence, meaning-safe patch", () => {
		const result = applyCodexTicAudit(
			"# Titel\n\nDet kan argumenteras att saken är klar.\n",
			audit([patch()]),
		);
		expect(result.body).toContain("Man kan hävda att saken är klar.");
		expect(result.applied).toHaveLength(1);
		expect(result.rejected).toHaveLength(0);
	});

	it("rejects low-confidence, risky and non-unique patches", () => {
		const body = "Samma fras. Samma fras.";
		const result = applyCodexTicAudit(
			body,
			audit([
				patch({ original: "Samma fras.", replacement: "Annan fras." }),
				patch({ original: body, confidence: "medium" }),
				patch({ original: body, semanticRisk: true }),
			]),
		);
		expect(result.body).toBe(body);
		expect(result.applied).toHaveLength(0);
		expect(result.rejected).toHaveLength(3);
	});

	it("rejects the complete patch set if protected material changes", () => {
		const body = '# Titel\n\nHan sade "samma ord" år 2026.[^1]\n\n[^1]: Källa.';
		const result = applyCodexTicAudit(
			body,
			audit([
				patch({
					original: '"samma ord" år 2026',
					replacement: '"andra ord" år 2027',
				}),
			]),
		);
		expect(result.body).toBe(body);
		expect(result.applied).toHaveLength(0);
		expect(result.rejected[0]?.reason).toContain("protected content");
	});
});
