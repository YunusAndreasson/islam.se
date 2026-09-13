import { describe, expect, it } from "vitest";
import { buildLatest, buildSeries, MAX_EXCERPT_CHARS } from "./derive";
import { FAMILY_KEYS } from "./families";
import { QUESTIONS } from "./questions";
import {
	type Answer,
	answerKey,
	type FamilyKey,
	type Question,
	questionKey,
	type RunFile,
	type RunModel,
	type TextsFile,
} from "./types";

const scaleQ = questionKey(QUESTIONS.find((q) => q.kind === "scale") as Question);
const partyQ = questionKey(QUESTIONS.find((q) => q.kind === "party") as Question);

function answer(partial: Partial<Answer> & Pick<Answer, "q" | "family" | "sample">): Answer {
	return {
		outcome: "answered",
		option: null,
		finishReason: "stop",
		responseModel: null,
		provider: null,
		generationId: null,
		usage: { promptTokens: 0, completionTokens: 0, reasoningTokens: 0, costUsd: 0.001 },
		latencyMs: 0,
		attempts: 1,
		...partial,
	};
}

function run(id: string, answers: Answer[]): RunFile {
	const model: RunModel = {
		id: "m",
		canonicalSlug: "m-1",
		name: "M",
		created: "2026-01-01",
		knowledgeCutoff: null,
		pricing: { prompt: "0", completion: "0" },
	};
	return {
		schemaVersion: 1,
		id,
		date: id.slice(0, 10),
		startedAt: `${id}T08:00:00Z`,
		finishedAt: `${id}T09:00:00Z`,
		settings: {
			variant: "A",
			promptVersion: "p1",
			samples: 3,
			reasoningEffort: "low",
			maxTokens: 4000,
			responseFormat: "json_schema",
			requireParameters: true,
			temperature: null,
			systemPrompt: null,
			webSearch: false,
		},
		models: Object.fromEntries(FAMILY_KEYS.map((k) => [k, model])) as Record<FamilyKey, RunModel>,
		questions: [],
		answers,
		totals: {
			answers: answers.length,
			costUsd: answers.length * 0.001,
			byOutcome: { answered: 0, abstained: 0, refused: 0, invalid: 0, error: 0 },
		},
		stoppedByBudget: false,
	};
}

describe("series.json", () => {
	it("codes every outcome compactly, per sample and in sample order", () => {
		const series = buildSeries([
			run("2026-09-14", [
				answer({ q: scaleQ, family: "claude", sample: 3, outcome: "refused" }),
				answer({ q: scaleQ, family: "claude", sample: 1, option: "Instämmer delvis" }),
				answer({ q: scaleQ, family: "claude", sample: 2, outcome: "abstained", option: "Avstår" }),
				answer({ q: partyQ, family: "grok", sample: 1, option: "Liberalerna (L)" }),
				answer({ q: partyQ, family: "grok", sample: 2, option: "Annat parti" }),
				answer({ q: partyQ, family: "grok", sample: 3, outcome: "invalid" }),
			]),
		]);
		expect(series.cells[scaleQ]?.claude).toEqual([["1", "avstar", "vagrar"]]);
		expect(series.cells[partyQ]?.grok).toEqual([["L", "annat", "fel"]]);
	});

	it("aligns every cell with the run list, null where a question was not yet asked", () => {
		const series = buildSeries([
			run("2026-09-21", [
				answer({ q: scaleQ, family: "gemini", sample: 1, option: "Tar helt avstånd" }),
			]),
			run("2026-09-14", [
				answer({ q: partyQ, family: "gemini", sample: 1, option: "Moderaterna (M)" }),
			]),
		]);
		expect(series.runs.map((r) => r.id)).toEqual(["2026-09-14", "2026-09-21"]);
		expect(series.cells[scaleQ]?.gemini).toEqual([null, ["-2"]]);
		expect(series.cells[partyQ]?.gemini).toEqual([["M"], null]);
	});

	it("refuses a run that asks a question the bank does not know", () => {
		expect(() =>
			buildSeries([run("2026-09-14", [answer({ q: "okand@1", family: "claude", sample: 1 })])]),
		).toThrow();
	});
});

describe("latest.json", () => {
	const a1 = answer({ q: scaleQ, family: "chatgpt", sample: 1, option: "Instämmer helt" });
	const a2 = answer({ q: scaleQ, family: "chatgpt", sample: 2, option: "Instämmer helt" });
	const a3 = answer({ q: scaleQ, family: "chatgpt", sample: 3, option: "Instämmer helt" });
	const refused = answer({ q: scaleQ, family: "deepseek", sample: 1, outcome: "refused" });
	const texts = (entries: Record<string, TextsFile["texts"][string]>): TextsFile => ({
		runId: "2026-09-14",
		texts: entries,
	});

	it("quotes only motivations that pass the gate, unless a human approved them", () => {
		const latest = buildLatest([
			{
				run: run("2026-09-14", [a1, a2, a3]),
				texts: texts({
					[answerKey(a1)]: { motivation: "Det är rimligt av tre skäl.", raw: null },
					[answerKey(a2)]: { motivation: "Hen som frågar bör veta att …", raw: null },
					[answerKey(a3)]: { motivation: "Hen menar att det stämmer.", raw: null, reviewed: true },
				}),
			},
		]);
		expect(latest.excerpts[scaleQ]?.chatgpt?.map((e) => e.sample)).toEqual([1, 3]);
	});

	it("never quotes a hidden, over-long or refused answer, and never trims one", () => {
		const latest = buildLatest([
			{
				run: run("2026-09-14", [a1, a2, refused]),
				texts: texts({
					[answerKey(a1)]: { motivation: "Kort och ren.", raw: null, hidden: true },
					[answerKey(a2)]: { motivation: "x".repeat(MAX_EXCERPT_CHARS + 1), raw: null },
					[answerKey(refused)]: { motivation: "Jag kan inte ta ställning.", raw: null },
				}),
			},
		]);
		expect(latest.excerpts).toEqual({});
	});

	it("quotes each question from the latest run that asked it", () => {
		// A run of only the newly added questions must not wipe the quotes of the questions it
		// skipped: an older question's page keeps quoting its own latest measurement, while a
		// question asked again is quoted from the newer run.
		const otherQ = questionKey(QUESTIONS.filter((q) => q.kind === "scale")[1] as Question);
		const older = answer({ q: otherQ, family: "chatgpt", sample: 1, option: "Tar helt avstånd" });
		const later = answer({ q: scaleQ, family: "chatgpt", sample: 1, option: "Varken eller" });
		const latest = buildLatest([
			{
				run: run("2026-09-21", [later]),
				texts: texts({ [answerKey(later)]: { motivation: "Senare.", raw: null } }),
			},
			{
				run: run("2026-09-14", [a1, older]),
				texts: texts({
					[answerKey(a1)]: { motivation: "Första.", raw: null },
					[answerKey(older)]: { motivation: "Äldre.", raw: null },
				}),
			},
		]);
		expect(latest.runs).toEqual({ [scaleQ]: "2026-09-21", [otherQ]: "2026-09-14" });
		expect(latest.excerpts[scaleQ]?.chatgpt?.map((e) => e.text)).toEqual(["Senare."]);
		expect(latest.excerpts[otherQ]?.chatgpt?.map((e) => e.text)).toEqual(["Äldre."]);
	});

	it("is empty before the first run", () => {
		expect(buildLatest([])).toEqual({ runs: {}, excerpts: {} });
	});
});
