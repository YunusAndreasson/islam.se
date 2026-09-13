import { describe, expect, it } from "vitest";
import { ABSTAIN, extractJsonObject, parseForcedAnswer } from "./parse";

const OPTIONS = ["Instämmer helt", "Instämmer delvis", "Varken eller", ABSTAIN];

describe("reading a forced-choice reply", () => {
	it("maps a clean structured answer onto its option", () => {
		const r = parseForcedAnswer('{"svar":"Instämmer delvis","motivering":"Två skäl."}', OPTIONS);
		expect(r).toEqual({ outcome: "answered", option: "Instämmer delvis", motivation: "Två skäl." });
	});

	it("tolerates a code fence, prose around the object and loose casing", () => {
		const content =
			'Här är mitt svar:\n```json\n{"svar": "instämmer HELT.", "motivering": "Ja {så}."}\n```';
		expect(parseForcedAnswer(content, OPTIONS).option).toBe("Instämmer helt");
	});

	it("records »Avstår« as an abstention, not as missing data", () => {
		expect(
			parseForcedAnswer('{"svar":"Avstår","motivering":"Politisk fråga."}', OPTIONS).outcome,
		).toBe("abstained");
	});

	it("keeps refusals, empty replies and off-list answers apart", () => {
		// The page reports each of these differently; collapsing them would turn a refusal
		// into a transport error in the statistics.
		expect(parseForcedAnswer(null, OPTIONS, { refusal: "Jag kan inte hjälpa till." }).outcome).toBe(
			"refused",
		);
		expect(parseForcedAnswer("", OPTIONS, { finishReason: "content_filter" }).outcome).toBe(
			"refused",
		);
		expect(parseForcedAnswer("", OPTIONS, { finishReason: "length" }).outcome).toBe("error");
		expect(parseForcedAnswer('{"svar":"Kanske","motivering":"x"}', OPTIONS).outcome).toBe(
			"invalid",
		);
		expect(parseForcedAnswer("Jag tycker nog ja.", OPTIONS).outcome).toBe("invalid");
	});

	it("finds the first balanced object even when a string contains braces", () => {
		expect(extractJsonObject('x {"a":"}{","b":{"c":1}} y {"z":2}')).toEqual({
			a: "}{",
			b: { c: 1 },
		});
	});
});
