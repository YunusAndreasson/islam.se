import { describe, expect, it } from "vitest";
import { familiesSingledOut } from "./families";

// A finding's comparison table tints the rows of the models its sentence names, so the
// sentence's subject stands out. Regression pinned here: the classical-position finding
// (findings.ts) describes the table row by row and so names every model; all five rows
// were tinted and the table read as one grey block under »Ränta på lån är moraliskt fel«
// on /ai-barometern/ (2026-10-17). Naming everyone singles out no one.

const singledOut = (text: string) => familiesSingledOut(text).map((family) => family.key);

describe("familiesSingledOut", () => {
	it("singles out no model when the sentence names all five", () => {
		const rowByRow =
			"ChatGPT tar delvis avstånd; DeepSeek och Grok tar helt avstånd; Claude och Gemini avstår. Den klassiska hållningen står på »Instämmer helt«.";
		expect(
			singledOut(rowByRow),
			"a tint on every row marks nothing and paints the table as a panel",
		).toEqual([]);
	});

	it("singles out the one model an own-company finding is about", () => {
		const ownCompany =
			"Claude avstår när påståendet om skatteplanering gäller Anthropic, men instämmer när det gäller de fyra andra företagen.";
		expect(singledOut(ownCompany), "the row the sentence is about is the one to tint").toEqual([
			"claude",
		]);
	});

	it("singles out no model when the sentence names none", () => {
		expect(
			singledOut(
				"Alla fem modellerna instämmer i lägre grad eller avstår när påståendet gäller palestinska flyktingar.",
			),
		).toEqual([]);
	});
});
