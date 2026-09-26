import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { genitive, kommunLabel, leadSentences, swedishQuotes } from "./format";

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

// A frontmatter description never passes through smartypants, so a quotation typed in
// one reached the front page as ASCII — »Selma Lagerlöfs Jerusalem, "Vi Ingemarer…"« on
// the lead essay's standfirst, the paragraph every visitor reads (four essays, 2026-09).
describe("swedishQuotes", () => {
	it("turns each balanced pair of straight quotes into »…«", () => {
		expect(swedishQuotes('Lagerlöfs Jerusalem, "Vi Ingemarer", har gått i arv')).toBe(
			"Lagerlöfs Jerusalem, »Vi Ingemarer«, har gått i arv",
		);
		expect(swedishQuotes('"Bara förlåt." Och: "För din egen skull."')).toBe(
			"»Bara förlåt.« Och: »För din egen skull.«",
		);
	});

	it("leaves an unpaired quote and every apostrophe as typed rather than guessing", () => {
		expect(swedishQuotes('ett "halvt citat')).toBe('ett "halvt citat');
		expect(swedishQuotes("Ibn Qayyim's ʿilm")).toBe("Ibn Qayyim's ʿilm");
	});

	it("is idempotent, so running it twice never nests or flips a pair", () => {
		const once = swedishQuotes('"a" och "b"');
		expect(swedishQuotes(once)).toBe(once);
	});
});

describe("published essay descriptions", () => {
	const dir = new URL("../../../../data/articles/", import.meta.url).pathname;
	const files = readdirSync(dir).filter((f) => f.endsWith(".md"));

	it("carry no straight double quote inside the text", () => {
		expect(files.length, "no essays found — the path to data/articles moved").toBeGreaterThan(20);
		const offenders = files.filter((f) => {
			const line = readFileSync(`${dir}${f}`, "utf8")
				.split("\n")
				.find((l) => l.startsWith("description:"));
			if (!line) return false;
			const value = line.slice("description:".length).trim();
			// A YAML double-quoted scalar escapes an inner quote as \"; any other form
			// carries it bare.
			return value.startsWith('"') ? value.slice(1, -1).includes('\\"') : value.includes('"');
		});
		expect(
			offenders,
			`these descriptions print ASCII quotes on the front page and share cards — write »…«: ${offenders.join(", ")}`,
		).toEqual([]);
	});
});

describe("leadSentences", () => {
	const deck =
		"Släktens formel i Selma Lagerlöfs Jerusalem, »Vi Ingemarer behöva bara gå Guds vägar«, har gått i arv i hundratals år innan den splittrar socknen. Koranen fördömer och berömmer samma handling, att följa fäderna, och ger formeln det innehåll den saknade.";

	it("keeps whole sentences only — never a cut inside one", () => {
		const out = leadSentences(deck, 170);
		expect(out, "the first sentence must survive whole").toBe(
			"Släktens formel i Selma Lagerlöfs Jerusalem, »Vi Ingemarer behöva bara gå Guds vägar«, har gått i arv i hundratals år innan den splittrar socknen.",
		);
		expect(out.endsWith("…")).toBe(false);
	});

	it("takes the next sentence too when it fits", () => {
		expect(leadSentences(deck, 1000)).toBe(deck);
	});

	it("always keeps the first sentence, even when it alone is longer than the limit", () => {
		expect(leadSentences(deck, 20)).toBe(leadSentences(deck, 170));
	});

	it("does not end a sentence on an abbreviation or an initial", () => {
		const text =
			"Han citerar t.ex. Ibn Taymiyya och J. R. R. Tolkien i samma andetag. Sedan tystnar han.";
		expect(leadSentences(text, 70)).toBe(
			"Han citerar t.ex. Ibn Taymiyya och J. R. R. Tolkien i samma andetag.",
		);
	});

	it("ends a sentence after a closing quote", () => {
		expect(leadSentences("Han sa »Nej.« Sedan gick han.", 10)).toBe("Han sa »Nej.«");
	});

	it("returns a text with no sentence end as it is", () => {
		expect(leadSentences("  en rad utan punkt  ", 5)).toBe("en rad utan punkt");
	});

	it("keeps every essay's lead whole and no longer than its full deck", () => {
		const dir = new URL("../../../../data/articles/", import.meta.url);
		for (const file of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
			const match = readFileSync(new URL(file, dir), "utf8").match(
				/^description:\s*"?(.*?)"?\s*$/m,
			);
			if (!match?.[1]) continue;
			const full = match[1].replace(/\\"/g, '"');
			const lead = leadSentences(full, 170);
			expect(full.startsWith(lead), `${file}: the lead must be the deck's own opening`).toBe(true);
			expect(
				/[.!?][»«"')\]]*$/.test(lead) || lead === full.trim(),
				`${file}: »${lead}« ends mid-sentence`,
			).toBe(true);
		}
	});
});
