import { describe, expect, it } from "vitest";
import { genitive, kommunLabel } from "./format";

// Both helpers replace string templates that were wrong on hundreds of generated
// pages: `${name}s breddgrad` printed »Boråss« and »Västeråss« on the prayer-time
// pages, and `${kommun} kommun` printed »Stockholm kommun« on the mosque pages.
describe("genitive", () => {
	it("adds s to a name that does not already end in a sibilant", () => {
		expect(genitive("Stockholm")).toBe("Stockholms");
		expect(genitive("Kiruna")).toBe("Kirunas");
	});

	it("leaves a name ending in s, x or z unchanged instead of doubling the s", () => {
		expect(genitive("Borås")).toBe("Borås");
		expect(genitive("Västerås")).toBe("Västerås");
		expect(genitive("Abbekås")).toBe("Abbekås");
	});
});

describe("kommunLabel", () => {
	it("uses the genitive after a consonant, as the official names do", () => {
		expect(kommunLabel("Stockholm")).toBe("Stockholms kommun");
		expect(kommunLabel("Lund")).toBe("Lunds kommun");
	});

	it("adds no s after a vowel or an s, as in Malmö kommun and Borås kommun", () => {
		expect(kommunLabel("Malmö")).toBe("Malmö kommun");
		expect(kommunLabel("Botkyrka")).toBe("Botkyrka kommun");
		expect(kommunLabel("Borås")).toBe("Borås kommun");
	});
});
