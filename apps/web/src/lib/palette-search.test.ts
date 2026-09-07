import { describe, expect, it } from "vitest";
import { createPaletteSearch, type PaletteEntry } from "./palette-search";

function entry(label: string, extra: Partial<PaletteEntry> = {}): PaletteEntry {
	return { type: "Svar", label, sub: "", href: `/${label}/`, ...extra };
}

const labels = (search: ReturnType<typeof createPaletteSearch>, query: string) =>
	search(query).flatMap((section) => section.entries.map((e) => e.label));

describe("palette search", () => {
	it("matches Swedish text, descriptions and alternate questions", () => {
		const search = createPaletteSearch([
			entry("Bön"),
			entry("Om fastan", { sub: "Frågor om ramadan" }),
			entry("Alkohol", { alt: "Får muslimer dricka?" }),
		]);
		expect(labels(search, "  BÖN ")).toEqual(["Bön"]);
		expect(labels(search, "ramadan")).toEqual(["Om fastan"]);
		expect(labels(search, "far muslimer")).toEqual(["Alkohol"]);
		expect(search(" ")).toEqual([]);
		expect(search("unmatched")).toEqual([]);
	});

	it("ranks exact titles, prefixes, words, substrings, descriptions and aliases", () => {
		const search = createPaletteSearch([
			entry("Alias", { alt: "Om bön" }),
			entry("Beskrivning", { sub: "Om bön" }),
			entry("Aftonbön"),
			entry("Om bön"),
			entry("Böner"),
			entry("Bön"),
		]);
		expect(labels(search, "bon")).toEqual([
			"Bön",
			"Böner",
			"Om bön",
			"Aftonbön",
			"Beskrivning",
			"Alias",
		]);
	});

	it("prefers cornerstone answers and then shorter titles for equal matches", () => {
		const search = createPaletteSearch([
			entry("Måste gravida fasta under ramadan?"),
			entry("Om ramadan"),
			entry("Vad är ramadan?", { core: true }),
		]);
		expect(labels(search, "ramadan")).toEqual([
			"Vad är ramadan?",
			"Om ramadan",
			"Måste gravida fasta under ramadan?",
		]);
	});

	it("keeps navigation first and thinker traditions separate", () => {
		const search = createPaletteSearch([
			entry("Bön essä", { type: "Essä" }),
			entry("Bön väst", { type: "Tänkare", group: "western" }),
			entry("Bön sunni", { type: "Tänkare", group: "sunni" }),
			entry("Bön svar"),
			entry("Bön sida", { type: "Sida" }),
		]);
		expect(labels(search, "bön")).toEqual([
			"Bön sida",
			"Bön svar",
			"Bön sunni",
			"Bön väst",
			"Bön essä",
		]);
		expect(search("bön")).toHaveLength(5);
	});

	it("caps essays and answers independently without mutating the source index", () => {
		const entries = Array.from({ length: 12 }, (_, i) => entry(`Bön ${i}`));
		entries.push(...entries.map((e) => ({ ...e, type: "Essä" as const })));
		const original = structuredClone(entries);
		const search = createPaletteSearch(entries);
		expect(search("bön").map((s) => s.entries.length)).toEqual([8, 8]);
		expect(search("bön").map((s) => s.total)).toEqual([12, 12]);
		expect(search("bön", true).map((s) => s.entries.length)).toEqual([12, 12]);
		expect(search("bön")).toEqual(search("BON"));
		expect(entries).toEqual(original);
	});

	it("matches separate words across fields and ranks consecutive matches first", () => {
		const search = createPaletteSearch([
			entry("Fasta", { sub: "Under ramadan" }),
			entry("Fasta ramadan"),
			entry("Ramadan utan fasta"),
			entry("Ramadan"),
		]);
		expect(labels(search, "fasta ramadan")).toEqual([
			"Fasta ramadan",
			"Fasta",
			"Ramadan utan fasta",
		]);
		expect(labels(search, "ramadan, fasta")).toHaveLength(3);
		expect(labels(search, "fasta   ramadan")).toHaveLength(3);
		expect(search("?!")).toEqual([]);
	});

	it("uses typo tolerance only when there are no exact token matches", () => {
		const search = createPaletteSearch([
			entry("Ramadan"),
			entry("Fastan under ramadan"),
			entry("Ramadanmat"),
		]);
		expect(labels(search, "ramdaan")).toContain("Ramadan");
		expect(search("ramdaan")[0]?.loose).toBe(true);
		expect(labels(search, "ramadanmat")).toEqual(["Ramadanmat"]);
		expect(search("ramadanmat")[0]?.loose).toBe(false);
		expect(labels(search, "ramdaan fastan")).toEqual(["Fastan under ramadan"]);
		expect(search("xyz")).toEqual([]);
	});
});
