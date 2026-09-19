import { describe, expect, it } from "vitest";
import { checkHouseRules, descriptionRepeatsLede } from "./house-checks.js";

const rules = (body: string, meta = {}) => checkHouseRules(body, meta).map((f) => f.rule);

describe("checkHouseRules", () => {
	// »Marknaden i raden« (2026-09-18) shipped »Därför drar jag gränsen« and »mitt eget
	// steg« out of the pipeline, plus a footnote saying the translations »är mina«. All
	// three were removed by hand. No prompt forbade first person and no script counted it.
	it("finds first person in the essay's voice, including a footnote", () => {
		const body = [
			"Därför drar jag gränsen snävare än fatwan.",
			"",
			"[^1]: Alla översättningar från arabiska i texten är mina.",
		].join("\n");
		expect(rules(body)).toEqual(["first-person", "first-person"]);
	});

	// The NAZA essay (2026-09-19) raised three first-person findings on »mitt i
	// beslutet« and »mitt i uppräkningen«: »mitt i« is »in the middle of«, not »my«.
	it("does not read the adverb »mitt i« as first person, but still finds »mitt eget«", () => {
		const body = [
			"Ett tal som godkänns i förväg ligger mitt i beslutet.",
			"",
			"Mitt på gatan och mitt emot skolan står husen kvar.",
			"",
			"Det var mitt eget steg.",
		].join("\n");
		expect(rules(body)).toEqual(["first-person"]);
	});

	it("leaves first person inside quotations and block quotes alone", () => {
		const body = [
			'Umar bad: "Gud, jag klagar inför Dig."',
			"",
			"> Jag anser att valen är en plikt.[^1]",
		].join("\n");
		expect(rules(body)).toEqual([]);
	});

	it("finds skarp, hen and a named school", () => {
		const body =
			"I sin skarpaste form lyder anklagelsen så. Hen svarade. Den salafitiska läsningen är äldre.";
		expect(rules(body)).toEqual(["skarp", "hen", "school-label"]);
	});

	it("sends a shia mention and a concession to a human, not to the fixer", () => {
		const findings = checkHouseRules(
			"Shiitisk rätt ser annorlunda på saken. Invändningen går inte att förklara bort.",
		);
		expect(findings.map((f) => [f.rule, f.kind])).toEqual([
			["sect-mention", "review"],
			["concession", "review"],
		]);
	});

	// The ground stage's one example taught »Det är den som …«; 54 of 111 additions began
	// »Det är« and 19 more »Den som« or »Det vet den som«. Two openers are allowed.
	it("counts formula openers past the budget of two", () => {
		const body =
			"Den som väntar får vänta. Det vet den som stått i kö. Det är den som ger upp först. Den som ropar hörs inte.";
		expect(rules(body)).toEqual(["formula-opener", "formula-opener"]);
	});

	it("requires a description that does not repeat the lede, when asked", () => {
		const body =
			"Innan bönen började gick Guds sändebud genom raderna och strök över deras axlar.\n\nMer text.";
		expect(rules(body, { checkDescription: true })).toEqual(["description-missing"]);
		expect(
			rules(body, {
				checkDescription: true,
				description:
					"Innan bönen började gick Guds sändebud genom raderna och strök över deras axlar.",
			}),
		).toEqual(["description-repeats-lede"]);
		expect(
			rules(body, {
				checkDescription: true,
				description:
					"Veckan efter valet anklagades moskéerna från två håll för att ha styrt väljarna.",
			}),
		).toEqual([]);
	});
});

describe("descriptionRepeatsLede", () => {
	it("catches a description cut from the opening sentences", () => {
		const body = "Det var en kall morgon i Uppsala när rösterna räknades om.\n\nSedan hände annat.";
		expect(descriptionRepeatsLede("Det var en kall morgon i Uppsala.", body)).toBe(true);
		expect(descriptionRepeatsLede("En omräkning i Uppsala prövade tålamodet.", body)).toBe(false);
	});
});
