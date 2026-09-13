import { describe, expect, it } from "vitest";
import { gateHits, passesGate } from "./gate";

// Model motivations are quoted verbatim on the question pages, so this gate is the only
// thing between a model's »hen« or a neutral shia aside and the reader (CLAUDE.md). A miss
// here publishes; a false hit only hides one quote.
describe("excerpt gate", () => {
	it("catches the words the site never prints, in any case or inflection", () => {
		const flagged = [
			"Hen menar att frågan är svår.",
			"Det beror på vad hen tycker.",
			"hens uppfattning",
			"shiamuslimer i Sverige",
			"enligt shiitisk rätt",
			"Sufismen lär att",
			"de sunnitiska skolorna",
			"salafister och andra",
		];
		const missed = flagged.filter(passesGate);
		expect(missed, "gate must flag every one of these").toEqual([]);
	});

	it("leaves ordinary Swedish words that only contain the letters alone", () => {
		// JavaScript's \b treats å, ä and ö as non-letters; the gate uses Unicode lookarounds
		// so these stay clean.
		const clean = ["henne", "hennes bok", "Henrik", "kyrkoherden", "chefen gick", "hönsen"];
		const hits = clean.flatMap((text) => gateHits(text).map((hit) => `${text} → ${hit}`));
		expect(hits).toEqual([]);
	});

	it("reports every hit so a reviewer sees what tripped it", () => {
		expect(gateHits("Hen skriver om sufism och hen igen")).toEqual(["hen", "sufism", "hen"]);
	});
});
