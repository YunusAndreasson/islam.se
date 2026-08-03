import { describe, expect, it } from "vitest";
import {
	adoptRevision,
	bodyAfterFrontmatter,
	looseNameMatch,
	normaliseQuote,
	UNVERIFIABLE_DEEP_LINK,
} from "./fordjupning-producer.js";

describe("bodyAfterFrontmatter", () => {
	// On the ramadan run the eval-correction stage returned a valid rewrite whose metadata
	// would not parse: its `changes[]` quotes prose fragments, and prose fragments contain
	// quote marks. 28 prose issues shipped uncorrected because the body went down with the
	// change-log. The body is recoverable without the metadata.
	it("recovers the body when the metadata JSON is malformed", () => {
		const output =
			'---\n{"verdict": "corrected", "changes": [{"original": "termer som "hilāl""}]}\n---\n\n## Avsnitt\n\nDen rättade texten.';
		expect(bodyAfterFrontmatter(output)).toBe("## Avsnitt\n\nDen rättade texten.");
	});

	it("returns undefined when there is no fenced block to skip", () => {
		expect(bodyAfterFrontmatter("Bara brödtext, ingen frontmatter.")).toBeUndefined();
	});

	it("returns undefined for an empty body after the block", () => {
		expect(bodyAfterFrontmatter('---\n{"verdict": "corrected"}\n---\n\n   ')).toBeUndefined();
	});

	it("returns undefined when there is nothing to recover", () => {
		expect(bodyAfterFrontmatter(undefined)).toBeUndefined();
	});
});

describe("adoptRevision", () => {
	// The bug: the review loop returned the body on the passing round BEFORE reading
	// revisedText, so the last reviewer's edits were always discarded. All four pages
	// produced before 2026-08-01 shipped with them lost, while review-N.json claimed
	// »RÄTTAT AV MIG« for each one — including a real factual error (Trelleborg glossed
	// as 48°N). If this test fails, the passing round is dropping corrections again.
	it("takes the reviewer's text when the round passes", () => {
		const draft = "x".repeat(1000);
		const revised = `${"x".repeat(990)}rättat`;
		expect(adoptRevision(revised, draft)).toEqual({ text: revised, rejected: false });
	});

	it("keeps the draft when the reviewer returned nothing to adopt", () => {
		const draft = "x".repeat(1000);
		expect(adoptRevision(undefined, draft)).toEqual({ text: draft, rejected: false });
	});

	it("rejects a truncated reviewer body rather than shipping half a page", () => {
		// Nothing downstream re-reads the body on the pass path, so a truncated
		// revision would become the published article.
		const draft = "x".repeat(1000);
		const truncated = "x".repeat(400);
		expect(adoptRevision(truncated, draft)).toEqual({ text: draft, rejected: true });
	});

	it("accepts a revision that shrinks the text without truncating it", () => {
		// Reviewers legitimately cut padding; only a collapse counts as truncation.
		const draft = "x".repeat(1000);
		const trimmed = "x".repeat(700);
		expect(adoptRevision(trimmed, draft)).toEqual({ text: trimmed, rejected: false });
	});
});

describe("UNVERIFIABLE_DEEP_LINK", () => {
	// The four links below all reached finished pages. Two were 404; two answered 200 with a
	// DIFFERENT book, which no liveness check can catch — book/23653 is ʿUyūn al-athar, not
	// Mughniyya, and book/1157 is al-Shaybānī's al-Jāmiʿ al-kabīr, not Ibn Taymiyya. The url
	// is therefore dropped and the citation kept by name; a source without a link is correct
	// scholarship, an invented link is a forgery.
	it.each([
		"https://shamela.ws/book/9673",
		"https://shamela.ws/book/13290",
		"https://shamela.ws/book/23653",
		"https://shamela.ws/book/1157",
		"https://shamela.ws/book/8463",
		"https://www.shamela.ws/book/1681",
	])("strips the unverifiable classical deep link %s", (url) => {
		expect(UNVERIFIABLE_DEEP_LINK.test(url)).toBe(true);
	});

	// Sources a human can check at a glance must survive — stripping them would push authors
	// back toward bare, unlinkable bibliographies, which is the failure this replaced.
	it.each([
		"https://quran.com/30/21?translations=48",
		"https://lagen.nu/dom/nja/2017s168",
		"https://www.riksdagen.se/sv/dokument-och-lagar/dokument/proposition/",
		"https://islamqa.info/en/answers/49688",
		"https://hadeethenc.com/en/browse/hadith/58068",
		"https://shamela.org/something-else",
	])("keeps the verifiable source %s", (url) => {
		expect(UNVERIFIABLE_DEEP_LINK.test(url)).toBe(false);
	});
});

describe("normaliseQuote", () => {
	// The corpus is OCR of old print, so typography drifts between quotes.db and anything
	// a model echoes back. Folding it away is what lets the gate compare WORDS — and words
	// are the only thing a forged citation actually changes.
	it("ignores typography the scans vary freely", () => {
		const stored = "Det är det märkliga med den stan, att se'n man en gång sett den";
		const echoed = "Det är det märkliga med den stan — att se’n man en gång sett den";
		expect(normaliseQuote(stored)).toBe(normaliseQuote(echoed));
	});

	it("does NOT ignore a changed word", () => {
		// This is the failure the gate exists for: a real id carrying invented wording.
		// Until 2026-08-03 only the fact-check stage compared text, and on the kaba run it
		// reported the quote MCP tools "not present in my tool list" and compared nothing.
		const stored = normaliseQuote("Man arbetar fåfängt, om ej Herren bygger huset.");
		const forged = normaliseQuote("Man arbetar förgäves, om ej Herren bygger huset.");
		expect(stored).not.toBe(forged);
		expect(stored.includes(forged)).toBe(false);
	});

	it("accepts a shortened quotation, since research may quote a span", () => {
		const stored = normaliseQuote(
			"Ödet är en öken. Där bor Gud. Söker du ditt Sinai, får du hans bud.",
		);
		const span = normaliseQuote("Där bor Gud");
		expect(stored.includes(span)).toBe(true);
	});
});

describe("looseNameMatch", () => {
	it("matches transliteration variants of one name", () => {
		expect(looseNameMatch("Ibn Qudāma", "Ibn Qudama")).toBe(true);
		expect(looseNameMatch("al-Qurṭubī", "al-Qurtubi")).toBe(true);
	});

	it("separates genuinely different people", () => {
		// A re-attribution must still be REPORTED, so this has to come out false: on the
		// Kaba corpus, Boye's Gömda land is filed under "Unknown" and a novel's line belongs
		// to its character, not its author. Both are corrections worth a human's eye.
		expect(looseNameMatch("Karin Boye", "Unknown")).toBe(false);
		expect(looseNameMatch("Erik Gustaf Geijer", "Bedouin tradition")).toBe(false);
	});
});
