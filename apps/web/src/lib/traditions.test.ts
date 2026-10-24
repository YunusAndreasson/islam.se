import { describe, expect, it } from "vitest";
import { byTradition, TRADITIONS } from "./traditions";

describe("the two traditions", () => {
	it("splits thinkers by side and keeps each side's order", () => {
		const thinkers = [
			{ name: "Ibn Taymiyya", tradition: "sunni" as const },
			{ name: "August Strindberg", tradition: "western" as const },
			{ name: "Ibn al-Qayyim", tradition: "sunni" as const },
		];
		const { sunni, western } = byTradition(thinkers, (t) => t.tradition);
		expect(sunni.map((t) => t.name)).toEqual(["Ibn Taymiyya", "Ibn al-Qayyim"]);
		expect(western.map((t) => t.name)).toEqual(["August Strindberg"]);
	});

	it("names each side once, in the forms the pages print", () => {
		// The essay's foot said »Den klassiska traditionen« where the archive, the palette and
		// the Tänkare page said »Den klassiska islamiska traditionen«.
		expect(TRADITIONS.sunni.label).toBe("Den klassiska islamiska traditionen");
		expect(TRADITIONS.western.singular).toBe("Svensk och västerländsk röst");
	});
});
