import { describe, expect, it } from "vitest";
import { slugify } from "./utils.js";

describe("slugify", () => {
	it("converts basic text to slug", () => {
		expect(slugify("Hello World")).toBe("hello-world");
	});

	it("handles Swedish characters", () => {
		expect(slugify("Ödmjukhet och Ärlighetens Väg")).toBe("odmjukhet-och-arlighetens-vag");
	});

	// Regression: only å, ä and ö were folded, so every other accented letter hit the
	// `[^a-z0-9]` catch-all and turned into a hyphen. "Moskén som skulle skada" was
	// written to disk as mosk-n-som-skulle-skada.md — a hole in the first word, caught
	// before deploy. An accented letter must never widen into a word separator.
	it("folds accents to their base letter instead of dropping them", () => {
		expect(slugify("Moskén som skulle skada")).toBe("mosken-som-skulle-skada");
		expect(slugify("Café")).toBe("cafe");
		expect(slugify("Ibn Rushds naïva läsare")).toBe("ibn-rushds-naiva-lasare");
	});

	// ø/æ/ð/þ are atomic code points: NFD does not decompose them, so folding them
	// needs its own rule. The corpus covers the Norse sagas — these turn up in names.
	it("folds Nordic letters that do not decompose", () => {
		expect(slugify("Ragnarøk")).toBe("ragnarok");
		expect(slugify("Ælfred och Þorsteinn")).toBe("aelfred-och-thorsteinn");
	});

	it("truncates at word boundary, not mid-word", () => {
		const long = "Sibawayhs revolution mannen som gav arabiskan skelett";
		const slug = slugify(long);
		expect(slug.length).toBeLessThanOrEqual(50);
		expect(slug).not.toMatch(/-$/); // no trailing hyphen
		expect(slug).toBe("sibawayhs-revolution-mannen-som-gav-arabiskan");
	});

	it("never produces trailing hyphens", () => {
		// This input previously produced "neuralink-och-den-insparrade-sjalen-ibn-al-jawzis-"
		const long = "Neuralink och den inspärrade själen: Ibn al-Jawzis diagnos";
		const slug = slugify(long);
		expect(slug).not.toMatch(/-$/);
		expect(slug.length).toBeLessThanOrEqual(50);
	});

	it("keeps short slugs unchanged", () => {
		expect(slugify("ensamhet")).toBe("ensamhet");
	});

	it("falls back to hash for non-Latin text", () => {
		const slug = slugify("الصبر والتوبة");
		expect(slug).toMatch(/^topic-[a-z0-9]+$/);
	});

	it("handles exactly 50 chars without truncation", () => {
		// 50 chars after slugify: "a-b" repeated pattern
		const input = "abcde fghij klmno pqrst uvwxy zabcd efghi jklmn o";
		const slug = slugify(input);
		expect(slug.length).toBeLessThanOrEqual(50);
		expect(slug).not.toMatch(/-$/);
	});
});
