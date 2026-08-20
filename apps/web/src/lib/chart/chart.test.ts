import { describe, expect, it } from "vitest";
import { formatNumber, formatShare, formatValue, joinSwedish } from "./format";
import { chartAltText, hastToXml, renderChartMarkup, renderChartSvg } from "./render";
import { ChartSpecError, parseChartSpec } from "./spec";

const BARS = `
type: bars
unit: personer
source: SCB, folkmängd efter födelseland, 31 december 2024
data:
  Syrien: 196000
  Irak: 146000
  Iran: 83000
`;

const LINE = `
type: line
series: Anmälda | Uppklarade
source: Brå, tabellsamling 2020–2024
data:
  2020: 100 | 20
  2021: 140 | 25
  2022: 180 | 30
`;

const STACK = `
type: stack
source: MUCF, trossamfund 2024
data:
  Ett: 50
  Två: 30
  Tre: 20
`;

describe("parseChartSpec", () => {
	it("reads scalars and rows", () => {
		const spec = parseChartSpec(BARS);
		expect(spec.type).toBe("bars");
		expect(spec.unit).toBe("personer");
		expect(spec.data).toHaveLength(3);
		expect(spec.data[0]).toEqual({ label: "Syrien", values: [196000] });
	});

	it("accepts Swedish number literals as an author writes them", () => {
		const spec = parseChartSpec(`
type: bars
source: X
data:
  Med mellanslag: 196 000
  Med decimalkomma: 12,5
  Med punkt: 12.5
  Negativt: -3
`);
		expect(spec.data.map((d) => d.values[0])).toEqual([196000, 12.5, 12.5, -3]);
	});

	it("treats a bare dash as a gap, not as zero", () => {
		// A missing year in a series must not plot as a collapse to nothing — the
		// renderers filter non-finite values out of the path instead.
		const spec = parseChartSpec(`
type: line
source: X
data:
  2020: 10
  2021: -
  2022: 12
`);
		expect(Number.isNaN(spec.data[1]?.values[0] as number)).toBe(true);
	});

	it("splits multi-series rows on the pipe", () => {
		const spec = parseChartSpec(LINE);
		expect(spec.series).toEqual(["Anmälda", "Uppklarade"]);
		expect(spec.data[1]?.values).toEqual([140, 25]);
	});

	describe("refuses a spec that would publish a defect", () => {
		it("without a source — an unsourced number does not ship", () => {
			expect(() => parseChartSpec("type: bars\ndata:\n  A: 1\n")).toThrow(/source/);
		});

		it("with more than two series — the site has two data colours", () => {
			// DESIGN.md allows four colours total and says brass earns its place by
			// encoding something. A third series would need a third hue; the answer to
			// that is small multiples, not a wider palette.
			expect(() =>
				parseChartSpec("type: line\nseries: A | B | C\nsource: X\ndata:\n  1: 1 | 2 | 3\n"),
			).toThrow(/högst 2/);
		});

		it("when a row's value count disagrees with the series count", () => {
			expect(() => parseChartSpec("type: line\nseries: A | B\nsource: X\ndata:\n  1: 1\n")).toThrow(
				/2 serier/,
			);
		});

		it("on an unknown key, rather than silently ignoring it", () => {
			expect(() => parseChartSpec("type: bars\ncolour: red\nsource: X\ndata:\n  A: 1\n")).toThrow(
				/okänd nyckel/,
			);
		});

		it("on an emphasis that matches no row", () => {
			expect(() =>
				parseChartSpec("type: bars\nemphasis: Norge\nsource: X\ndata:\n  Sverige: 1\n"),
			).toThrow(/finns inte/);
		});

		it("on a negative share in a stack", () => {
			expect(() => parseChartSpec("type: stack\nsource: X\ndata:\n  A: -1\n")).toThrow(/negativt/);
		});

		it("and names the offending line, so the build error is actionable", () => {
			try {
				parseChartSpec("type: bars\nsource: X\ndata:\n  A: 1\n  B: sju\n");
				expect.unreachable("should have thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(ChartSpecError);
				expect((error as ChartSpecError).line).toBe(5);
				expect((error as Error).message).toContain("rad 5");
			}
		});
	});
});

describe("Swedish formatting", () => {
	it("uses a non-breaking space for thousands and a comma for decimals", () => {
		// 196,000 would be an English habit the house style pass strips from prose; a
		// chart is prose too.
		expect(formatNumber(196000)).toBe("196 000");
		expect(formatNumber(12.5)).toBe("12,5");
		expect(formatNumber(196000)).not.toContain(",");
	});

	it("renders percent with the symbol and a non-breaking space", () => {
		expect(formatValue(12.5, "procent")).toBe("12,5 %");
		expect(formatValue(12.5, "%")).toBe("12,5 %");
	});

	it("shows a gap as a dash rather than as a number", () => {
		expect(formatNumber(Number.NaN)).toBe("–");
	});

	it("joins with 'och', not with a serial comma", () => {
		expect(joinSwedish(["a", "b", "c"])).toBe("a, b och c");
		expect(joinSwedish(["a"])).toBe("a");
	});

	it("computes a share against the total", () => {
		expect(formatShare(25, 100)).toBe("25 %");
		expect(formatShare(1, 0)).toBe("–");
	});
});

describe("alt text", () => {
	it("is a full Swedish sentence naming the values, not the word 'stapeldiagram' alone", () => {
		const alt = chartAltText(parseChartSpec(BARS));
		expect(alt).toContain("Syrien");
		expect(alt).toContain("196 000");
		expect(alt).toContain("Källa:");
		expect(alt.length).toBeGreaterThan(40);
	});

	it("describes direction for a time series, since the shape is the point", () => {
		const alt = chartAltText(parseChartSpec(LINE));
		expect(alt).toMatch(/stiger|faller|ligger stilla/);
	});

	it("gives shares for a stack", () => {
		expect(chartAltText(parseChartSpec(STACK))).toContain("50 %");
	});

	it("defers to an explicit alt", () => {
		const spec = parseChartSpec(
			"type: bars\nalt: Min egen mening.\nsource: SCB\ndata:\n  Syrien: 1\n",
		);
		expect(chartAltText(spec)).toBe("Min egen mening.");
	});
});

describe("rendering", () => {
	const ALL = ["bars", "columns", "line", "slope", "stack"] as const;

	function specFor(type: (typeof ALL)[number]) {
		if (type === "slope") {
			return parseChartSpec(
				"type: slope\nseries: 2010 | 2020\nsource: X\ndata:\n  A: 10 | 20\n  B: 30 | 15\n",
			);
		}
		if (type === "stack") return parseChartSpec(STACK);
		if (type === "line") return parseChartSpec(LINE);
		return parseChartSpec(`type: ${type}\nsource: X\ndata:\n  A: 10\n  B: 30\n  C: 5\n`);
	}

	for (const type of ALL) {
		describe(type, () => {
			it("carries a non-empty aria-label in both modes", () => {
				for (const mode of ["web", "print"] as const) {
					const markup = renderChartMarkup(specFor(type), mode);
					const label = markup.match(/aria-label="([^"]+)"/);
					expect(label?.[1] ?? "").not.toBe("");
				}
			});

			it("always names its source in the caption", () => {
				expect(renderChartMarkup(specFor(type))).toContain("Källa:");
			});

			it("renders as well-formed XML — the EPUB is XHTML and rejects anything less", () => {
				const markup = renderChartMarkup(specFor(type), "print");
				// Every tag opened is closed or self-closed: counting delimiters is enough
				// to catch the class of bug that makes a reader refuse the file.
				const opens = (markup.match(/<[a-z]/g) ?? []).length;
				const closes = (markup.match(/<\/[a-z]/g) ?? []).length;
				const selfClosing = (markup.match(/\/>/g) ?? []).length;
				expect(opens).toBe(closes + selfClosing);
			});

			it("uses no CSS custom properties in print, where they resolve to nothing", () => {
				expect(renderChartMarkup(specFor(type), "print")).not.toContain("var(--");
			});

			it("uses tokens and never a raw hex on the web", () => {
				// A literal hex here would not follow light-dark(), so the chart would keep
				// its light-mode colours on a dark page.
				expect(renderChartMarkup(specFor(type), "web")).not.toMatch(/#[0-9a-f]{6}/i);
			});
		});
	}

	it("never draws a mark past the plot", () => {
		const spec = parseChartSpec("type: bars\nsource: X\ndata:\n  A: 10\n  B: 100\n");
		const widths = [...renderChartMarkup(spec).matchAll(/width:([\d.]+)%/g)].map((m) =>
			Number(m[1]),
		);
		expect(widths.length).toBeGreaterThan(0);
		for (const w of widths) expect(w).toBeLessThanOrEqual(100);
	});

	it("measures bars from zero, so a difference is never exaggerated", () => {
		// A truncated baseline is the oldest way to mislead with a chart. Half the value
		// must be half the bar.
		const spec = parseChartSpec("type: bars\nsource: X\ndata:\n  A: 50\n  B: 100\n");
		const widths = [...renderChartMarkup(spec).matchAll(/width:([\d.]+)%/g)].map((m) =>
			Number(m[1]),
		);
		expect(widths).toEqual([50, 100]);
	});

	it("fills a stack to exactly 100 per cent", () => {
		const widths = [...renderChartMarkup(parseChartSpec(STACK)).matchAll(/width:([\d.]+)%/g)].map(
			(m) => Number(m[1]),
		);
		expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 5);
	});

	it("omits a gap from the line rather than plotting it as zero", () => {
		const spec = parseChartSpec(
			"type: line\nsource: X\ndata:\n  2020: 10\n  2021: -\n  2022: 12\n",
		);
		const points = renderChartSvg(spec).match(/points="([^"]*)"/)?.[1] ?? "";
		expect(points.trim().split(/\s+/)).toHaveLength(2);
		expect(points).not.toContain("NaN");
	});

	it("paints only the emphasised row in brass", () => {
		const spec = parseChartSpec(
			"type: bars\nemphasis: B\nsource: X\ndata:\n  A: 10\n  B: 30\n  C: 5\n",
		);
		const markup = renderChartMarkup(spec);
		expect((markup.match(/is-dim/g) ?? []).length).toBe(2);
	});

	it("escapes markup in author-supplied text", () => {
		const spec = parseChartSpec("type: bars\nsource: A & B <Ltd>\ndata:\n  A: 1\n");
		const markup = renderChartMarkup(spec);
		expect(markup).toContain("A &amp; B &lt;Ltd&gt;");
		expect(markup).not.toContain("<Ltd>");
	});

	it("links the source when a URL is given, and stays plain text when it is not", () => {
		const withUrl = parseChartSpec(
			"type: bars\nsourceUrl: https://example.org/t\nsource: SCB\ndata:\n  Syrien: 1\n",
		);
		expect(renderChartMarkup(withUrl)).toContain('href="https://example.org/t"');
		expect(renderChartMarkup(parseChartSpec(BARS))).not.toContain("<a ");
	});
});

describe("hastToXml", () => {
	it("self-closes void elements", () => {
		expect(
			hastToXml({ type: "element", tagName: "rect", properties: { x: 1 }, children: [] }),
		).toBe('<rect x="1" />');
	});

	it("does not self-close a container, which would break the XHTML tree", () => {
		expect(hastToXml({ type: "element", tagName: "span", properties: {}, children: [] })).toBe(
			"<span></span>",
		);
	});
});

describe("house punctuation", () => {
	// remark-smartypants converts straight quotes to guillemets in prose but SKIPS code
	// nodes — and a chart spec is a code node. Without this the caption under a paragraph
	// set in »…« would itself read "…", and an author who typed »…« in the fence to
	// compensate would trip scripts/check-house-style.py.
	it("converts straight quotes in the caption, as the prose pipeline does", () => {
		const spec = parseChartSpec(
			'type: bars\nsource: Falchi m.fl., "The New World Atlas", Science Advances 2016\ndata:\n  A: 1\n',
		);
		const markup = renderChartMarkup(spec);
		expect(markup).toContain("»The New World Atlas«");
		expect(markup).not.toContain('"The New World Atlas"');
	});

	it("applies the same conversion to the alt text a screen reader gets", () => {
		const spec = parseChartSpec('type: bars\nsource: X "Y" Z\ndata:\n  A: 1\n');
		expect(chartAltText(spec)).toContain("»Y«");
	});
});

describe("slope-diagrammets alt-text", () => {
	// Bug 2026-08-20: `slope` shared the `line` branch, which reads data rows as time
	// points. In a slope the rows are CATEGORIES and the two series are the time points,
	// so the shared branch emitted »från Islamofobiska till Övriga motiv… Serien faller
	// från 328 till 67« — comparing one category's start with another's, and asserting a
	// change that never occurred. Sighted readers saw four correct lines; screen-reader
	// users were told something false. Alt text is the accessible rendering of the chart,
	// so a wrong sentence there is a wrong chart.
	const spec = parseChartSpec(`
type: slope
series: 2020 | 2024
unit: motiv
source: Brå, tabell 7A
data:
  Islamofobiska: 328 | 199
  Antisemitiska: 170 | 217
`);

	it("beskriver varje kategoris egen förflyttning", () => {
		const alt = chartAltText(spec);
		expect(alt, "kategorin ska gå från sitt eget första till sitt eget andra värde").toContain(
			"Islamofobiska från 328",
		);
		expect(alt).toContain("till 199");
		expect(alt, "en stigande kategori får inte beskrivas som fallande").toContain(
			"Antisemitiska från 170",
		);
		expect(alt).toContain("till 217");
	});

	it("nämner båda tidpunkterna och aldrig en kategori som tidsaxel", () => {
		const alt = chartAltText(spec);
		expect(alt).toContain("mellan 2020 och 2024");
		expect(
			alt,
			"»från <kategori> till <kategori>« är den gamla buggen — kategorier är inte en tidsaxel",
		).not.toMatch(/från Islamofobiska till/);
	});
});

describe("linjediagrammets alt-text namnger toppen", () => {
	// Bug 2026-08-20: describeExtremes() compared only first and last point, so the 114
	// suras by verse count were described as »Serien faller från 7 verser till 6 verser«.
	// True of the endpoints, blind to the peak of 286 that is the entire figure. A
	// screen-reader user got a flat line where a sighted one saw a cliff.
	it("nämner högsta punkten när den inte ligger i en ände", () => {
		const alt = chartAltText(
			parseChartSpec(`
type: line
unit: verser
source: Koranen
data:
  1: 7
  2: 286
  113: 5
  114: 6
`),
		);
		expect(alt, "toppen mitt i serien måste nämnas").toContain("286");
		expect(alt).toMatch(/Högst är 2/);
	});

	it("lägger inte till något för en monoton serie", () => {
		const alt = chartAltText(
			parseChartSpec(`
type: line
unit: procent
source: Svenska kyrkan
data:
  1972: 95,2
  2000: 82,9
  2025: 50,7
`),
		);
		expect(alt, "ändpunkterna ÄR ytterligheterna här — ingen extra mening").not.toMatch(/Högst är/);
		expect(alt).not.toMatch(/Lägst är/);
	});
});

describe("slope-etiketter krockar inte", () => {
	// Measured on moske.md: »Kristofobiska 73« and »Övriga motiv 67« are 6 units apart on
	// a 328-unit scale, so their labels landed on the same baseline and smeared together.
	// The fix nudges the TEXT apart; the line must still start at the true value.
	// The full four rows matter: with only the two small ones the axis maximum collapses
	// to ~73 and they are no longer close on the scale. The collision only exists because
	// 73 and 67 sit near the bottom of a 328-unit axis.
	const spec = parseChartSpec(`
type: slope
series: 2020 | 2024
source: Brå, tabell 7A, 2024
data:
  Islamofobiska: 328 | 199
  Antisemitiska: 170 | 217
  Kristofobiska: 73 | 36
  Övriga motiv: 67 | 52
`);

	it("håller etiketterna på skilda rader", () => {
		const svg = renderChartSvg(spec);
		const ys = [
			...svg.matchAll(/<text[^>]*\sy="([\d.]+)"[^>]*>[^<]*(?:Kristofobiska|Övriga)[^<]*<\/text>/g),
		].map((m) => Number(m[1]));
		expect(ys.length, "båda etiketterna ska finnas i utdata").toBe(2);
		const [a = 0, b = 0] = ys;
		expect(
			Math.abs(a - b),
			`etiketterna ligger ${Math.abs(a - b).toFixed(1)} enheter isär — de smetar ihop`,
		).toBeGreaterThan(10);
	});

	it("flyttar inte datapunkterna", () => {
		const svg = renderChartSvg(spec);
		// The two left-hand circles of the colliding pair must still sit at the y their
		// values dictate — close together — even though their labels were pushed apart.
		const cys = [...svg.matchAll(/<circle[^>]*cy="([\d.]+)"/g)].map((m) => Number(m[1]));
		expect(cys.length).toBe(8); // four categories, two endpoints each
		// Rows 3 and 4 are the colliding pair; their left-hand circles are indices 4 and 6.
		const leftPair = [cys[4], cys[6]].filter((v): v is number => v !== undefined);
		expect(
			Math.abs((leftPair[0] ?? 0) - (leftPair[1] ?? 0)),
			"punkterna ska ligga kvar där värdena säger, bara texten flyttas",
		).toBeLessThan(10);
	});
});

describe("ett diagram, en precision", () => {
	// Bug 2026-08-20: formatNumber() chose precision per value — integers none, ≥10 one
	// decimal, below that two. The WHO alcohol chart therefore printed 12,01 as **12**
	// beside 8,99, 0,1 and 0. Dropping a published digit on a page that cites the source
	// is not a formatting quibble. A column of figures is read down and must be read at
	// one precision.
	it("ger alla värden samma antal decimaler", () => {
		const alt = chartAltText(
			parseChartSpec(`
type: bars
unit: liter
source: WHO, 2019
data:
  Frankrike: 12,01
  Sverige: 8,99
  Bangladesh: 0,00
`),
		);
		// ⚠️ formatValue() separates value and unit with a NON-BREAKING space. A test
		// literal with a plain space fails against output that is correct.
		expect(alt, "12,01 får inte tappa sina decimaler").toContain("12,01\u00A0liter");
		expect(alt).toContain("8,99\u00A0liter");
		expect(alt, "noll ska bära samma precision som kolumnen i övrigt").toContain("0,00\u00A0liter");
	});

	it("lämnar heltalsdiagram orörda", () => {
		const alt = chartAltText(
			parseChartSpec(`
type: bars
source: islam.se, 2026
data:
  Stockholm: 44
  Gotland: 1
`),
		);
		expect(alt, "heltal ska inte få påhittade decimaler").toContain("Stockholm 44");
		expect(alt).not.toMatch(/44,0/);
	});
});
