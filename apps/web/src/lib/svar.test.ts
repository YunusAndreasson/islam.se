import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FAKTA_SLUGS } from "./fakta";
import { answerSection, SVAR_CATEGORIES, svarSeoMetadata } from "./svar";

const ANSWERS = readdirSync(new URL("../../../../data/svar/", import.meta.url))
	.filter((name) => name.endsWith(".md"))
	.map((name) => name.replace(/\.md$/, ""));

// Every answer opens under the kicker of the section it belongs to, as an essay opens under
// its ämne. The pillars' overview (`islams-fem-pelare`) opened without one, because the
// lookup matched a cluster's items and never its overview; `vad-ar-en-kadi` belonged to no
// category and stood alone at the foot of /svar/ under »Övriga frågor« (2026-11-20).
describe("svar sections", () => {
	it("finds the answers", () => {
		expect(ANSWERS.length).toBeGreaterThan(50);
	});

	it.each(ANSWERS)("gives %s a kicker", (id) => {
		expect(answerSection(id), `${id} opens with no section over its title`).not.toBeNull();
	});

	it("puts every answer outside /vad-ar-islam/ in a named /svar/ category, so »Övriga frågor« stays empty", () => {
		const listed = new Set(SVAR_CATEGORIES.flatMap((c) => c.ids));
		const unlisted = ANSWERS.filter((id) => !(FAKTA_SLUGS.has(id) || listed.has(id)));
		expect(
			unlisted,
			"these answers fall into the trailing »Övriga frågor«: add them to a category in lib/svar.ts",
		).toEqual([]);
	});
});

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
