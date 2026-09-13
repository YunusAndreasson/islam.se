import { describe, expect, it } from "vitest";
import { ABSTAIN } from "./parse";
import {
	buildPrompt,
	buildRequestBody,
	OTHER_PARTY,
	optionsFor,
	PARTIES,
	partyCodeOf,
	SCALE_OPTIONS,
	textSha256,
} from "./prompt";
import { QUESTIONS } from "./questions";
import type { Question } from "./types";

const scale = QUESTIONS.find((q) => q.kind === "scale") as Question;
const party = QUESTIONS.find((q) => q.kind === "party") as Question;

describe("prompt variants", () => {
	it("offers »Avstår« only in variant A, and no options at all in the free variant", () => {
		expect(optionsFor(scale, "A")).toEqual([...SCALE_OPTIONS, ABSTAIN]);
		expect(optionsFor(scale, "B")).toEqual([...SCALE_OPTIONS]);
		expect(optionsFor(scale, "C")).toEqual([]);
	});

	it("shuffles party options per sample, reproducibly, and keeps the scale in order", () => {
		const a = optionsFor(party, "A", "run:q:claude:1");
		expect(optionsFor(party, "A", "run:q:claude:1")).toEqual(a);
		expect(a.at(-2)).toBe(OTHER_PARTY);
		expect(a.at(-1)).toBe(ABSTAIN);
		expect([...a.slice(0, 8)].sort()).toEqual(PARTIES.map((p) => `${p.name} (${p.code})`).sort());
		const orders = new Set(
			["1", "2", "3", "4", "5", "6"].map((s) => optionsFor(party, "A", s).join()),
		);
		expect(orders.size).toBeGreaterThan(1);
		expect(optionsFor(scale, "A", "any-seed")).toEqual(optionsFor(scale, "A"));
		expect(a.map(partyCodeOf).filter(Boolean)).toHaveLength(8);
	});

	it("puts the question and every option into the prompt", () => {
		const options = optionsFor(scale, "A");
		const prompt = buildPrompt(scale, "A", options);
		expect(prompt).toContain(`»${scale.text}«`);
		for (const o of options) expect(prompt).toContain(o);
		expect(buildPrompt(scale, "C", [])).not.toContain("Svarsalternativ");
	});

	it("hashes the canonical prompt, so a rewording without a version bump is detectable", () => {
		const reworded: Question = { ...scale, text: `${scale.text.slice(0, -1)} snarast.` };
		expect(textSha256(scale)).toBe(textSha256({ ...scale }));
		expect(textSha256(reworded)).not.toBe(textSha256(scale));
	});
});

describe("request body", () => {
	it("is one fresh user turn: no system prompt, temperature, web search or plugins", () => {
		// The method page promises each model's own defaults with nothing steering it.
		const body = buildRequestBody("x-ai/grok-4.6", "fråga", optionsFor(scale, "A"));
		expect(body.messages).toEqual([{ role: "user", content: "fråga" }]);
		expect(body).not.toHaveProperty("temperature");
		expect(body).not.toHaveProperty("plugins");
		expect(body).not.toHaveProperty("web_search_options");
		expect(String(body.model)).not.toContain(":online");
		expect(body.reasoning).toEqual({ effort: "low", exclude: true });
		expect(body.provider).toEqual({ require_parameters: true });
	});

	it("asks for strict structured output only when there are options to choose from", () => {
		const forced = buildRequestBody("m", "p", optionsFor(scale, "A")) as {
			response_format?: {
				json_schema: { strict: boolean; schema: { properties: { svar: { enum: string[] } } } };
			};
		};
		expect(forced.response_format?.json_schema.strict).toBe(true);
		expect(forced.response_format?.json_schema.schema.properties.svar.enum).toContain(ABSTAIN);
		expect(buildRequestBody("m", "p", [])).not.toHaveProperty("response_format");
	});

	it("pins a family to its own service with plain JSON mode and no fallback host", () => {
		// Unpinned, every DeepSeek answer came from third-party hosts running the open weights
		// without DeepSeek's own filtering. A fallback would silently undo the pin, and DeepSeek's
		// own endpoint rejects a strict schema under require_parameters.
		const body = buildRequestBody("deepseek/m", "p", optionsFor(scale, "A"), 4000, "deepseek");
		expect(body.provider).toEqual({
			order: ["deepseek"],
			allow_fallbacks: false,
			require_parameters: true,
		});
		expect(body.response_format).toEqual({ type: "json_object" });
	});
});
