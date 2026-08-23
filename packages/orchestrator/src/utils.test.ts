import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatSourceDocs, loadSourceDocs, slugify } from "./utils.js";

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

describe("loadSourceDocs", () => {
	const dir = mkdtempSync(join(tmpdir(), "briefing-"));

	it("reads plain-text briefings verbatim", () => {
		const path = join(dir, "lagesbild.md");
		writeFileSync(path, "# Lägesbild\n\nSCB: 35 procent 2025.");
		expect(loadSourceDocs([path])).toEqual([
			{ name: "lagesbild.md", text: "# Lägesbild\n\nSCB: 35 procent 2025." },
		]);
	});

	// A missing briefing must stop the run at the CLI, before ~2h of pipeline time is
	// spent. The stages have no way to notice an absent document: an empty
	// <briefing_documents> block reads as "nothing to add" and the essay is written
	// around the hole with no gate ever firing.
	it("throws on a path that does not exist rather than yielding an empty briefing", () => {
		expect(() => loadSourceDocs([join(dir, "finns-inte.pdf")])).toThrow(/saknas/);
	});
});

describe("formatSourceDocs", () => {
	it("returns nothing at all when there are no documents", () => {
		expect(formatSourceDocs([])).toBe("");
	});

	// The framing is the whole point of the block: without "attribuera till
	// PRIMÄRKÄLLAN" the author cites the briefing file, which has no public URL and is
	// stripped by the source gate — leaving a figure in the prose with no source at all.
	it("carries the trust and attribution rules alongside every document", () => {
		const block = formatSourceDocs([
			{ name: "ai.pdf", text: "METR: fördubbling var fjärde månad." },
		]);
		expect(block).toContain("VERIFIERAT underlag");
		expect(block).toContain("PRIMÄRKÄLLAN");
		expect(block).toContain('<source_document name="ai.pdf">');
		expect(block).toContain("METR: fördubbling var fjärde månad.");
	});
});
