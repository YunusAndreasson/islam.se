import { describe, expect, it } from "vitest";
import { type ScaleCell, scaleCell } from "./aggregate";
import { FAMILIES } from "./families";
import { describeRow, everyOf, svJoin } from "./summary";
import type { FamilyKey } from "./types";

// The sentence above a question's chart. It is the one thing many readers take away, so it must
// name every model that answered exactly once, and never a model that did not.

const KINDS: ScaleCell[] = [
	["2", "2", "2"],
	["1", "1", "1"],
	["0", "0", "0"],
	["-1", "-1", "-1"],
	["-2", "-2", "-2"],
	["avstar", "avstar", "avstar"],
	["vagrar", "vagrar", "vagrar"],
	["2", "-2", "0"],
	null,
].map(scaleCell);

/** Every assignment of the kinds above to the five models. */
function* rows(): Generator<Record<FamilyKey, ScaleCell>> {
	const total = KINDS.length ** FAMILIES.length;
	for (let n = 0; n < total; n++) {
		let rest = n;
		const row = {} as Record<FamilyKey, ScaleCell>;
		for (const f of FAMILIES) {
			row[f.key] = KINDS[rest % KINDS.length] as ScaleCell;
			rest = Math.floor(rest / KINDS.length);
		}
		yield row;
	}
}

const occurrences = (text: string, word: string) => text.split(word).length - 1;

function problemsWith(row: Record<FamilyKey, ScaleCell>): string[] {
	const sentence = describeRow(row);
	const answered = FAMILIES.filter((f) => row[f.key].state !== "missing");
	if (answered.length === 0) return sentence === "" ? [] : [`no answers but »${sentence}«`];
	const out: string[] = [];
	if (!sentence.endsWith(".") || /\s\s|\s[,;.]|och och/.test(sentence)) out.push(sentence);
	if (sentence.startsWith("Alla ")) {
		if (answered.length !== FAMILIES.length) out.push(`»alla« with a model missing: ${sentence}`);
		return out;
	}
	for (const f of FAMILIES) {
		const expected = row[f.key].state === "missing" ? 0 : 1;
		if (occurrences(sentence, f.label) !== expected) out.push(`${f.label} in »${sentence}«`);
	}
	return out;
}

describe("the summary sentence", () => {
	it("names each model that answered exactly once, and no model that did not", () => {
		const wrong: string[] = [];
		for (const row of rows()) {
			wrong.push(...problemsWith(row));
			if (wrong.length > 5) break;
		}
		expect(wrong).toEqual([]);
	});

	it("reads as Swedish", () => {
		const [agree, , , , disagree, abstain] = KINDS as [
			ScaleCell,
			ScaleCell,
			ScaleCell,
			ScaleCell,
			ScaleCell,
			ScaleCell,
		];
		expect(
			describeRow({
				chatgpt: agree,
				claude: agree,
				deepseek: disagree,
				gemini: abstain,
				grok: agree,
			}),
		).toBe("ChatGPT, Claude och Grok instämmer helt; DeepSeek tar helt avstånd; Gemini avstår.");
		expect(
			describeRow({ chatgpt: agree, claude: agree, deepseek: agree, gemini: agree, grok: agree }),
		).toBe("Alla fem modellerna instämmer helt.");
	});

	it("joins lists the Swedish way", () => {
		expect(svJoin([])).toBe("");
		expect(svJoin(["a"])).toBe("a");
		expect(svJoin(["a", "b"])).toBe("a och b");
		expect(svJoin(["a", "b", "c"])).toBe("a, b och c");
		expect([2, 3, 5].map(everyOf)).toEqual(["båda", "alla tre", "alla fem"]);
	});
});
