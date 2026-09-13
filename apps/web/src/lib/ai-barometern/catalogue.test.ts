import { describe, expect, it } from "vitest";
import fixture from "../../data/ai-barometern/fixtures/models-2026-09-12.json";
import {
	adoptModel,
	baselineCatalogue,
	diffCatalogue,
	emptyModelsFile,
	ignoreModel,
	modelInForce,
	pendingModels,
} from "./catalogue";
import { familyOfModel } from "./families";
import type { CatalogueModel } from "./types";

// A trimmed snapshot of GET /api/v1/models from 2026-09-12. The release log is what
// guarantees a new model can never slip past a measurement unnoticed, so these tests pin
// the three ways that guarantee could quietly break: a real release filtered out, a
// flood of noise hiding it, or a run attributed to the wrong model.

const CATALOGUE = fixture.data as CatalogueModel[];
const byId = (id: string): CatalogueModel => {
	const m = CATALOGUE.find((c) => c.id === id);
	if (!m) throw new Error(`fixture lacks ${id}`);
	return m;
};
const release = (id: string, created = 1_790_000_000): CatalogueModel => ({
	id,
	canonical_slug: `${id}-20260920`,
	name: id,
	created,
	pricing: { prompt: "0.000002", completion: "0.00001" },
});

describe("model families", () => {
	it("assigns the five pinned starting models to their families", () => {
		expect(
			[
				"openai/gpt-5.6-sol",
				"anthropic/claude-opus-5",
				"google/gemini-3.8-flash",
				"x-ai/grok-4.6",
				"deepseek/deepseek-v4-pro-0813",
			].map(familyOfModel),
		).toEqual(["chatgpt", "claude", "gemini", "grok", "deepseek"]);
	});

	it("keeps aliases, batch variants, non-chat models and other vendors out", () => {
		expect(
			[
				"~openai/gpt-sol-latest",
				"anthropic/claude-opus-5:batch",
				"openai/gpt-5-image",
				"openai/gpt-audio",
				"google/gemini-3.1-flash-image",
				"google/gemma-3-27b-it",
				"mistralai/mistral-large",
			].map(familyOfModel),
		).toEqual([null, null, null, null, null, null, null]);
	});
});

describe("release log", () => {
	const today = "2026-09-12";
	const base = baselineCatalogue(emptyModelsFile(), CATALOGUE, today);

	it("records what already exists as ignored, so the first check starts with nothing pending", () => {
		expect(pendingModels(base)).toEqual([]);
		expect(base.seen.some((s) => s.id === "openai/gpt-6-astra")).toBe(true);
	});

	it("marks a new release pending, and only chat models in a tracked namespace", () => {
		const next = [
			...CATALOGUE,
			release("openai/gpt-6.1-sol"),
			release("openai/gpt-6.1-image"),
			release("~openai/gpt-6.1-latest"),
			release("x-ai/grok-5"),
		];
		const { added } = diffCatalogue(base, next, "2026-09-20");
		expect(added.map((a) => [a.family, a.id, a.decision])).toEqual([
			["chatgpt", "openai/gpt-6.1-sol", "pending"],
			["grok", "x-ai/grok-5", "pending"],
		]);
	});

	it("lets nothing through once a pending release is decided", () => {
		const { file } = diffCatalogue(base, [...CATALOGUE, release("x-ai/grok-5")], "2026-09-20");
		expect(pendingModels(file).map((p) => p.id)).toEqual(["x-ai/grok-5"]);
		expect(pendingModels(ignoreModel(file, "x-ai/grok-5", "2026-09-20", "test"))).toEqual([]);
	});

	it("dates a switch so each run is attributed to the model in force that day", () => {
		let file = adoptModel(base, "grok", byId("x-ai/grok-4.6"), "2026-09-12", "start");
		const grok5 = release("x-ai/grok-5");
		file = diffCatalogue(file, [...CATALOGUE, grok5], "2026-10-01").file;
		file = adoptModel(file, "grok", grok5, "2026-10-01", "ny flaggskeppsmodell");

		expect(file.families.grok.current).toBe("x-ai/grok-5");
		expect(file.families.grok.history.map((h) => [h.id, h.adoptedAt, h.retiredAt ?? null])).toEqual(
			[
				["x-ai/grok-4.6", "2026-09-12", "2026-10-01"],
				["x-ai/grok-5", "2026-10-01", null],
			],
		);
		expect(modelInForce(file, "grok", "2026-09-30")?.id).toBe("x-ai/grok-4.6");
		expect(modelInForce(file, "grok", "2026-10-01")?.id).toBe("x-ai/grok-5");
		expect(modelInForce(file, "grok", "2026-09-01")).toBeNull();
		expect(file.seen.find((s) => s.id === "x-ai/grok-5")?.decision).toBe("adopted");
	});

	it("refuses to pin a model under the wrong family", () => {
		expect(() => adoptModel(base, "claude", byId("x-ai/grok-4.6"), today, "fel")).toThrow();
	});

	it("warns when a pinned model disappears from the catalogue", () => {
		const file = adoptModel(base, "gemini", byId("google/gemini-3.8-flash"), today, "start");
		const without = CATALOGUE.filter((m) => m.id !== "google/gemini-3.8-flash");
		const { warnings, removed } = diffCatalogue(file, without, "2026-10-01");
		expect(warnings.some((w) => w.includes("google/gemini-3.8-flash finns inte längre"))).toBe(
			true,
		);
		expect(removed.map((r) => r.id)).toContain("google/gemini-3.8-flash");
	});
});
