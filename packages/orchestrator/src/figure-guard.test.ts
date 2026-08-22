import { describe, expect, it } from "vitest";
import {
	checkAnchor,
	checkNoFootnoteMarker,
	checkNumberProvenance,
	figureNumbers,
	numbersInText,
	parseSwedishNumber,
} from "./figure-guard";

const PROSE = `## Muslimer i Sverige

Uppskattningarna spänner från omkring 196 000 i en mätning till 810 000 i en annan.
Andelen som besöker en moské varje vecka ligger på 12,5 procent.

Koranen 9:103 nämner allmosan.
`;

describe("parseSwedishNumber", () => {
	it("reads the literals an author actually writes", () => {
		expect(parseSwedishNumber("196000")).toBe(196000);
		expect(parseSwedishNumber("196 000")).toBe(196000);
		expect(parseSwedishNumber("196 000")).toBe(196000);
		expect(parseSwedishNumber("12,5")).toBe(12.5);
		expect(parseSwedishNumber("12.5")).toBe(12.5);
		expect(parseSwedishNumber("90%")).toBe(90);
	});

	it("returns null for a gap rather than pretending it is zero", () => {
		expect(parseSwedishNumber("-")).toBeNull();
		expect(parseSwedishNumber("–")).toBeNull();
		expect(parseSwedishNumber("")).toBeNull();
		expect(parseSwedishNumber("ingen uppgift")).toBeNull();
	});
});

describe("numbersInText", () => {
	it("reads a thousands-grouped number as one number, not two", () => {
		// ⚠️ With \d+ first in the alternation, "196 000" matches as 196 then 000, and a
		// figure claiming 196000 would find no support in a text that plainly states it.
		const found = numbersInText("spänner från 196 000 till 810 000");
		expect(found.has(196000)).toBe(true);
		expect(found.has(810000)).toBe(true);
		expect(found.has(196)).toBe(false);
	});

	it("does not let a Quran reference license a quantity", () => {
		// The prose cited a verse; it never claimed 103 of anything.
		expect(numbersInText("Koranen 9:103 nämner allmosan").has(103)).toBe(false);
	});

	it("reads decimals with the Swedish comma", () => {
		expect(numbersInText("ligger på 12,5 procent").has(12.5)).toBe(true);
	});

	// ⚠️ REGRESSION. The first version masked only \d+:\d+, so an essay with footnotes and a
	// link admitted their digits as "quantities the prose states" — enough for a wholly
	// fabricated chart to pass the one check that exists to make that impossible.
	it("does not let a footnote marker license a quantity", () => {
		const found = numbersInText("Ljuset har stigit.[^1] Vintergatan är borta.[^12]");
		expect(found.has(1)).toBe(false);
		expect(found.has(12)).toBe(false);
	});

	it("does not let digits inside a URL license a quantity", () => {
		const found = numbersInText("se [atlasen](https://api.scb.se/OV0104/v1/ssd/BE/BE0101)");
		expect(found.has(104)).toBe(false);
		expect(found.has(101)).toBe(false);
		expect(found.has(1)).toBe(false);
	});

	it("does not let a footnote definition license a quantity", () => {
		// The apparatus carries page numbers and editions; they are not claims about the world.
		expect(numbersInText("[^3]: Falchi et al., Science Advances 2, s. 447.").has(447)).toBe(false);
	});

	it("does not read a fenced block as prose", () => {
		expect(numbersInText("Text.\n\n```chart\ndata:\n  A: 4711\n```\n").has(4711)).toBe(false);
	});

	it("still reads the quantities the prose does assert", () => {
		const found = numbersInText("Uppskattningarna spänner från 196 000 till 810 000.[^4]");
		expect(found.has(196000)).toBe(true);
		expect(found.has(810000)).toBe(true);
		expect(found.has(4)).toBe(false);
	});
});

describe("figureNumbers", () => {
	const SPEC = `type: bars
unit: personer
source: SCB, 2025
data:
  Syrien: 196000
  Irak: 146 000
`;

	it("collects the values", () => {
		expect(figureNumbers(SPEC).sort()).toEqual([146000, 196000]);
	});

	it("never asks a row label for provenance — a label of 1258 is a year", () => {
		const spec = `type: columns
source: X, 2025
data:
  1258: 12
  1492: 20
`;
		expect(figureNumbers(spec)).toEqual([12, 20]);
	});

	it("reads every cell of a multi-column table row", () => {
		const spec = `source: X, 2025
columns: Land | Antal | Andel
data:
  Syrien: 196000 | 1,8
`;
		expect(figureNumbers(spec).sort((a, b) => a - b)).toEqual([1.8, 196000]);
	});

	it("skips a scalar such as max: — an axis bound is not a claim", () => {
		const spec = `type: bars
max: 999999
source: X, 2025
data:
  Ett: 5
`;
		expect(figureNumbers(spec)).toEqual([5]);
	});
});

describe("checkNumberProvenance", () => {
	const ok = (
		spec: string,
		datasets: Parameters<typeof checkNumberProvenance>[0]["datasets"] = [],
	) => checkNumberProvenance({ spec, proseBefore: PROSE, datasets });

	it("accepts values the vetted prose already states", () => {
		expect(ok("source: X, 2025\ndata:\n  A: 196000\n  B: 810000")).toEqual([]);
	});

	it("matches across number formats — 196 000 in prose is 196000 in a spec", () => {
		// A verbatim string check would reject this and push the stage toward pasting
		// spaced numerals into data:, which parses but reads worse in a diff.
		expect(ok("source: X, 2025\ndata:\n  A: 196 000")).toEqual([]);
	});

	it("REFUSES a number that appears nowhere — the whole point of the guard", () => {
		const reasons = ok("source: X, 2025\ndata:\n  A: 196000\n  B: 500000");
		expect(reasons).toHaveLength(1);
		expect(reasons[0]).toMatch(/500000/);
	});

	it("REFUSES a derived value even when its inputs are present", () => {
		// 196000/810000 = 24,2 % is arithmetic the source never published.
		expect(ok("source: X, 2025\ndata:\n  Andel: 24,2")).toHaveLength(1);
	});

	it("REFUSES a rounded value — if the prose only rounds, the datum is not in the text", () => {
		expect(ok("source: X, 2025\ndata:\n  A: 200000")).toHaveLength(1);
	});

	it("accepts a value carried by a fact-check-verified dataset", () => {
		const datasets = [{ id: "ds-1", rows: [{ label: "Syrien", values: ["71000"] }] }];
		expect(ok("source: X, 2025\ndata:\n  Somalia: 71000", datasets)).toEqual([]);
	});

	it("drops the whole figure, not the offending cell", () => {
		// A table missing one column is worse than no table: it reads as complete.
		const reasons = ok("source: X, 2025\ndata:\n  A: 196000\n  B: 12,5\n  C: 4711");
		expect(reasons).toHaveLength(1);
	});
});

describe("checkNoFootnoteMarker", () => {
	it("refuses a footnote marker inside a fence", () => {
		// It renders as literal text, and normalizeFootnotes() renumbers it anyway.
		expect(checkNoFootnoteMarker("source: X[^3], 2025")).toHaveLength(1);
	});

	it("passes a clean spec", () => {
		expect(checkNoFootnoteMarker("source: X, 2025")).toEqual([]);
	});
});

describe("checkAnchor", () => {
	it("accepts the last sentence of a paragraph", () => {
		expect(checkAnchor(PROSE, "ligger på 12,5 procent.")).toEqual([]);
	});

	it("refuses an anchor mid-paragraph — that is the fence-welding bug", () => {
		expect(checkAnchor(PROSE, "spänner från omkring 196 000 i en mätning")).toHaveLength(1);
	});

	it("refuses an anchor that is not in the essay at all", () => {
		expect(checkAnchor(PROSE, "en mening som inte finns")).toHaveLength(1);
	});

	it("refuses an ambiguous anchor that occurs twice", () => {
		const twice = "Samma mening.\n\nEn annan.\n\nSamma mening.\n";
		expect(checkAnchor(twice, "Samma mening.")).toHaveLength(1);
	});
});
