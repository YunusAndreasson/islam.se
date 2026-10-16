import { describe, expect, it } from "vitest";
import { currentNavHref, destinations, isNavCurrent } from "./navigation";

describe("isNavCurrent", () => {
	it("keeps a section current on its index and detail pages", () => {
		expect(isNavCurrent("/svar/", "/svar/")).toBe(true);
		expect(isNavCurrent("/svar/vad-ar-tawhid/", "/svar/")).toBe(true);
		expect(isNavCurrent("/moskeer/stockholm/", "/moskeer/")).toBe(true);
	});

	it("treats the home destination as exact-only", () => {
		expect(isNavCurrent("/", "/")).toBe(true);
		expect(isNavCurrent("/svar/", "/")).toBe(false);
	});

	it("supports a section override for root-level content", () => {
		expect(isNavCurrent("/spegeln-som-blev-fonster/", "/essaer/", "/essaer/")).toBe(true);
		expect(isNavCurrent("/spegeln-som-blev-fonster/", "/svar/", "/essaer/")).toBe(false);
	});
});

describe("currentNavHref", () => {
	it("prefers the most specific destination when routes overlap", () => {
		expect(currentNavHref("/om/redaktion/", ["/om/", "/om/redaktion/"])).toBe("/om/redaktion/");
	});

	it("respects an explicit section override", () => {
		expect(currentNavHref("/spegeln-som-blev-fonster/", ["/svar/", "/essaer/"], "/essaer/")).toBe(
			"/essaer/",
		);
	});
});

describe("destinations", () => {
	it("names each destination as the mast does, with the line the menu gives it", () => {
		const [svar, bonetider] = destinations(["/svar/", "/bonetider/"]);
		expect(svar?.label, "a way on must use the destination's one name (DESIGN.md »Names«)").toBe(
			"Frågor och svar",
		);
		expect(svar?.sub, "the menu's own gloss, so the two cannot describe one page twice").toBe(
			"Källbelagda svar på vanliga frågor.",
		);
		expect(bonetider?.label).toBe("Bönetider");
	});

	it("refuses an href that is no destination, rather than render a way on to nowhere", () => {
		expect(() => destinations(["/finns-inte/"])).toThrow(/not a destination/);
	});
});
