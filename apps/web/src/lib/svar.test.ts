import { describe, expect, it } from "vitest";
import { svarSeoMetadata } from "./svar";

describe("svar search metadata", () => {
	const fallback = { title: "Editorial title", description: "Editorial description" };

	it.each([
		["islams-fem-pelare", "Islams fem pelare – vilka är de?"],
		["vad-ar-hajj", "Hajj – islams vallfärd till Mecka"],
		["far-muslimska-man-ha-flera-fruar", "Hur många fruar får en muslim ha? Fyra – på ett villkor"],
		["far-muslimer-dricka-alkohol", "Får muslimer dricka alkohol? Därför är det förbjudet"],
	])("gives %s its GSC-backed search title", (slug, title) => {
		expect(svarSeoMetadata(slug, fallback).title).toBe(title);
	});

	it("leaves every unmeasured answer on its editorial metadata", () => {
		expect(svarSeoMetadata("vad-ar-sunna", fallback)).toBe(fallback);
	});
});
