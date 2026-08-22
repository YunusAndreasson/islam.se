import { describe, expect, it } from "vitest";
import { numericColumns, renderTableMarkup, tableAltText, tableCaptionText } from "./render";
import { parseTableSpec, TableSpecError } from "./spec";

const FOUR_SCHOOLS = `
source: Ibn Rushd, Bidayat al-mujtahid
caption: De fyra rättsskolornas hållning i frågan.
columns: Rättsskola | Hållning | Grund
data:
  Hanafi: Tillåtet | Analogi
  Maliki: Tillåtet | Praxis i Medina
  Shafii: Ogillat | Enskild hadith
  Hanbali: Ogillat | Enskild hadith
`;

const NUMBERS = `
source: SCB, Befolkningsstatistik 2025
sourceUrl: https://www.scb.se/
note: Födelseland, inte trosbekännelse.
columns: Land | Antal | Andel
data:
  Syrien: 196 000 | 1,8
  Irak: 146 000 | 1,4
  Somalia: 71 000 | 0,7
`;

describe("parseTableSpec", () => {
	it("reads scalars, columns and rows", () => {
		const spec = parseTableSpec(FOUR_SCHOOLS);
		expect(spec.source).toBe("Ibn Rushd, Bidayat al-mujtahid");
		expect(spec.columns).toEqual(["Rättsskola", "Hållning", "Grund"]);
		expect(spec.rows).toHaveLength(4);
		expect(spec.rows[0]).toEqual({ label: "Hanafi", cells: ["Tillåtet", "Analogi"] });
	});

	it("keeps cells as strings — a table cell may be prose", () => {
		const spec = parseTableSpec(FOUR_SCHOOLS);
		expect(spec.rows[1]?.cells[1]).toBe("Praxis i Medina");
	});

	it("splits only on the first colon, so a source may contain one", () => {
		const spec = parseTableSpec(`
source: Science Advances 2:6, 2016
columns: A | B
data:
  Ett: 1
  Två: 2
`);
		expect(spec.source).toBe("Science Advances 2:6, 2016");
	});

	// Every refusal below exists because the alternative is a defect on a published page.
	it("refuses a table with no source — the same bar a chart clears", () => {
		expect(() => parseTableSpec("columns: A | B\ndata:\n  Ett: 1\n  Två: 2")).toThrow(
			/»source:« saknas/,
		);
	});

	it("refuses a table with no column headers", () => {
		expect(() => parseTableSpec("source: X 2025\ndata:\n  Ett: 1\n  Två: 2")).toThrow(
			/»columns:« saknas/,
		);
	});

	it("refuses a row whose cell count disagrees with columns:", () => {
		expect(() =>
			parseTableSpec("source: X 2025\ncolumns: A | B | C\ndata:\n  Ett: 1\n  Två: 2 | 3"),
		).toThrow(/»Ett« har 1 celler men 2 deklarerades/);
	});

	it("refuses a sixth column — past five a table cannot be read on a phone", () => {
		expect(() =>
			parseTableSpec(
				"source: X 2025\ncolumns: A | B | C | D | E | F\ndata:\n  Ett: 1|2|3|4|5\n  Två: 1|2|3|4|5",
			),
		).toThrow(/6 kolumner — högst 5/);
	});

	it("refuses a one-row table — that is a sentence with a box drawn round it", () => {
		expect(() => parseTableSpec("source: X 2025\ncolumns: A | B\ndata:\n  Ett: 1")).toThrow(
			/en enda rad är en mening/,
		);
	});

	it("refuses an emphasis that matches no row label", () => {
		expect(() =>
			parseTableSpec("source: X 2025\ncolumns: A | B\nemphasis: Tre\ndata:\n  Ett: 1\n  Två: 2"),
		).toThrow(/emphasis »Tre« finns inte/);
	});

	it("carries the offending line number, so the build log alone locates the fix", () => {
		try {
			parseTableSpec("source: X 2025\ncolumns: A | B\ndata:\n  Ett: 1\n  saknar-kolon");
			expect.unreachable("should have thrown");
		} catch (error) {
			expect(error).toBeInstanceOf(TableSpecError);
			expect((error as TableSpecError).line).toBe(5);
		}
	});
});

describe("numeric columns", () => {
	it("finds them from the data, so the author declares nothing", () => {
		expect(numericColumns(parseTableSpec(NUMBERS))).toEqual([false, true, true]);
	});

	it("treats the row label as a label even when it is a year", () => {
		const spec = parseTableSpec(
			"source: X 2025\ncolumns: År | Antal\ndata:\n  1258: 10\n  1492: 20",
		);
		expect(numericColumns(spec)[0]).toBe(false);
	});

	it("calls a column prose if even one cell is prose — a mixed column is not figures", () => {
		const spec = parseTableSpec(
			"source: X 2025\ncolumns: A | B\ndata:\n  Ett: 10\n  Två: ingen uppgift",
		);
		expect(numericColumns(spec)[1]).toBe(false);
	});
});

describe("alt text", () => {
	// A <table> is navigable by a screen reader in a way an SVG chart is not. Spelling out
	// every cell in the figure's label would make the whole table read twice.
	it("orients rather than repeating the table", () => {
		const alt = tableAltText(parseTableSpec(NUMBERS));
		expect(alt).toMatch(/3 rader/);
		expect(alt).toMatch(/Källa: SCB/);
		expect(alt).not.toMatch(/196/);
	});

	it("uses the caption as its lead when there is one", () => {
		expect(tableAltText(parseTableSpec(FOUR_SCHOOLS))).toMatch(/De fyra rättsskolornas hållning/);
	});

	// The emphasis is carried by colour on the page, and colour is exactly what a screen
	// reader does not report. Without this the figure means less to the reader who needs it
	// most — and it was silently dropped in the PDF and the EPUB for the same reason.
	it("names the emphasised row, which colour alone cannot tell a screen reader", () => {
		const spec = parseTableSpec(NUMBERS.replace("columns:", "emphasis: Irak\ncolumns:"));
		expect(tableAltText(spec)).toMatch(/Raden Irak är framhävd/);
	});

	it("says nothing about emphasis when none is set", () => {
		expect(tableAltText(parseTableSpec(NUMBERS))).not.toMatch(/framhävd/);
	});
});

describe("caption", () => {
	it("names the source and keeps the note", () => {
		const cap = tableCaptionText(parseTableSpec(NUMBERS));
		expect(cap).toContain("Källa: SCB, Befolkningsstatistik 2025.");
		expect(cap).toContain("Födelseland, inte trosbekännelse.");
	});

	it("converts straight quotes to guillemets — remark-smartypants skips code nodes", () => {
		const spec = parseTableSpec(
			'source: X 2025\ncaption: Det de kallar "riktig" statistik.\ncolumns: A | B\ndata:\n  Ett: 1\n  Två: 2',
		);
		expect(tableCaptionText(spec)).toContain("»riktig«");
	});
});

describe("markup", () => {
	it("is a chart--table figure, so the caption CSS and the build guard both find it", () => {
		const html = renderTableMarkup(parseTableSpec(NUMBERS));
		expect(html).toContain('<figure class="chart chart--table"');
		expect(html).toContain('<table class="chart-table">');
	});

	it("wraps the table so a wide figure scrolls itself and never the page", () => {
		expect(renderTableMarkup(parseTableSpec(NUMBERS))).toContain('<div class="chart-plot">');
	});

	it("marks row labels as row headers", () => {
		expect(renderTableMarkup(parseTableSpec(NUMBERS))).toContain('<th scope="row">Syrien</th>');
	});

	it("serialises as well-formed XML, because the EPUB is XHTML", () => {
		const xml = renderTableMarkup(parseTableSpec(NUMBERS), "print");
		// Counting delimiters the way chart.test.ts does — enough to catch the class of bug
		// that makes an EPUB reader refuse the file outright.
		const opens = (xml.match(/<[a-z]/g) ?? []).length;
		const closes = (xml.match(/<\/[a-z]/g) ?? []).length;
		const selfClosing = (xml.match(/\/>/g) ?? []).length;
		expect(opens).toBe(closes + selfClosing);
	});

	it("escapes an ampersand in a cell rather than emitting a broken entity", () => {
		const spec = parseTableSpec("source: X 2025\ncolumns: A | B\ndata:\n  Ett & två: 1\n  Tre: 2");
		expect(renderTableMarkup(spec)).toContain("Ett &amp; två");
	});

	it("dims the other rows only when one is emphasised", () => {
		const plain = renderTableMarkup(parseTableSpec(NUMBERS));
		expect(plain).not.toContain("is-dim");
		const spec = parseTableSpec(NUMBERS.replace("columns:", "emphasis: Irak\ncolumns:"));
		const html = renderTableMarkup(spec);
		expect(html).toContain('class="is-emphasis"');
		expect(html).toContain('class="is-dim"');
	});
});

describe("the shared grammar", () => {
	it("rejects an unknown key, listing what is allowed", () => {
		expect(() =>
			parseTableSpec("source: X 2025\ntype: bars\ncolumns: A | B\ndata:\n  Ett: 1\n  Två: 2"),
		).toThrow(/okänd nyckel »type«/);
	});

	it("rejects a left-flush line after data:, which would silently become a scalar", () => {
		expect(() => parseTableSpec("source: X 2025\ncolumns: A | B\ndata:\n  Ett: 1\nTvå: 2")).toThrow(
			/står i vänsterkanten men efter »data:«/,
		);
	});
});
