import { describe, expect, it } from "vitest";
import { entryGaps, renderTimelineMarkup, timelineAltText, timelineCaptionText } from "./render";
import { leadYear, parseTimelineSpec, TimelineSpecError } from "./spec";

/** Scalars must stand before `data:`, so a variant is built by splicing, not appending. */
function withScalar(spec: string, line: string): string {
	return spec.replace("data:\n", `${line}\ndata:\n`);
}

const SVERIGE = `
source: Simon Sorgenfrei, Islam i Sverige - de första 1300 åren
caption: Från de tidigaste kontakterna till i dag.
emphasis: 1949
data:
  ca 870: Spillingeskatten läggs i jorden på Gotland.
  1556: Ett tatariskt sändebud söker upp det svenska hovet.
  1949: Landets första muslimska förening bildas i Stockholm.
  1952: En konkurrerande församling grundas.
`;

describe("parseTimelineSpec", () => {
	it("reads scalars and entries, and pulls the year out of the label", () => {
		const spec = parseTimelineSpec(SVERIGE);
		expect(spec.source).toBe("Simon Sorgenfrei, Islam i Sverige - de första 1300 åren");
		expect(spec.entries).toHaveLength(4);
		expect(spec.entries[0]).toEqual({
			label: "ca 870",
			text: "Spillingeskatten läggs i jorden på Gotland.",
			year: 870,
		});
	});

	it("defaults to the compressed time scale", () => {
		expect(parseTimelineSpec(SVERIGE).scale).toBe("time");
	});

	it("reads the first year of a span, so »1715-1718« sorts as 1715", () => {
		expect(leadYear("1715-1718")).toBe(1715);
		expect(leadYear("ca 870")).toBe(870);
		expect(Number.isNaN(leadYear("i dag"))).toBe(true);
	});

	it("refuses a chronology with no source", () => {
		expect(() => parseTimelineSpec("data:\n  1949: A\n  1950: B\n  1951: C\n")).toThrow(
			TimelineSpecError,
		);
	});

	it("refuses fewer than three points — that is a sentence", () => {
		expect(() => parseTimelineSpec("source: X\ndata:\n  1949: A\n  1950: B\n")).toThrow(
			/färre än tre punkter/,
		);
	});

	it("refuses points that run backwards, which is nearly always a typo", () => {
		expect(() => parseTimelineSpec("source: X\ndata:\n  1949: A\n  1938: B\n  1951: C\n")).toThrow(
			/kronologisk ordning/,
		);
	});

	it("refuses an emphasis that matches no point", () => {
		expect(() =>
			parseTimelineSpec(withScalar(SVERIGE.replace("emphasis: 1949\n", ""), "emphasis: 1066")),
		).toThrow(/finns inte bland årtalen/);
	});

	it("refuses a point with no event text", () => {
		expect(() => parseTimelineSpec("source: X\ndata:\n  1949: A\n  1950:\n  1951: C\n")).toThrow(
			/saknar händelse/,
		);
	});
});

describe("entryGaps", () => {
	it("gives the first point no gap and every other point a positive one", () => {
		const gaps = entryGaps(parseTimelineSpec(SVERIGE));
		expect(gaps[0]).toBe(0);
		expect(gaps.slice(1).every((g) => g > 0)).toBe(true);
	});

	/* The whole reason the form exists: seven centuries must open a visibly wider gap
	   than three years, or the rail says the events were evenly spread. */
	it("opens a wider gap for a longer silence", () => {
		const gaps = entryGaps(parseTimelineSpec(SVERIGE));
		const centuries = gaps[1] ?? 0; // 870 → 1556
		const years = gaps[3] ?? 0; // 1949 → 1952
		expect(centuries).toBeGreaterThan(years * 2);
	});

	/* …but never so much that the dense end collapses. A linear scale would put the
	   three-year gap at 0.4 % of the long one; the square root keeps it readable. */
	it("keeps the tightest gap legible rather than collapsing it", () => {
		const gaps = entryGaps(parseTimelineSpec(SVERIGE));
		expect(gaps[3]).toBeGreaterThanOrEqual(1);
	});

	it("spaces evenly when asked to", () => {
		const gaps = entryGaps(parseTimelineSpec(withScalar(SVERIGE, "scale: even")));
		expect(new Set(gaps.slice(1)).size).toBe(1);
	});
});

describe("buildTimelineHast", () => {
	it("renders an ordered list of real text, not an image", () => {
		const markup = renderTimelineMarkup(parseTimelineSpec(SVERIGE));
		expect(markup).toContain('<figure class="chart chart--timeline"');
		expect(markup).toContain('<ol class="chart-timeline">');
		expect(markup).toContain("Spillingeskatten läggs i jorden på Gotland.");
		expect(markup).not.toContain("<svg");
	});

	it("carries the gap as an inline margin so the EPUB gets it too", () => {
		const markup = renderTimelineMarkup(parseTimelineSpec(SVERIGE));
		expect(markup).toMatch(/style="margin-top:\d+(\.\d+)?rem"/);
	});

	it("marks one entry brass and dims the rest", () => {
		const markup = renderTimelineMarkup(parseTimelineSpec(SVERIGE));
		expect(markup.match(/chart-tl-item is-emphasis/g)).toHaveLength(1);
		expect(markup.match(/chart-tl-item is-dim/g)).toHaveLength(3);
	});

	it("dims nothing when no entry is emphasised", () => {
		const markup = renderTimelineMarkup(parseTimelineSpec(SVERIGE.replace("emphasis: 1949\n", "")));
		expect(markup).not.toContain("is-dim");
		expect(markup).not.toContain("is-emphasis");
	});

	it("applies house punctuation inside the fence, which smartypants never reaches", () => {
		const markup = renderTimelineMarkup(
			parseTimelineSpec('source: X\ndata:\n  1949: En "förening" bildas.\n  1950: B\n  1951: C\n'),
		);
		expect(markup).toContain("»förening«");
	});

	it("renders identically in both modes — the gaps are inline, the colours are not", () => {
		const spec = parseTimelineSpec(SVERIGE);
		expect(renderTimelineMarkup(spec, "web")).toBe(renderTimelineMarkup(spec, "print"));
	});
});

describe("captions and labels", () => {
	/* The spacing is a claim about elapsed time. A reader who measures the rail must be
	   told it is compressed, so the disclosure is appended and cannot be suppressed. */
	it("discloses the compressed scale in the caption", () => {
		expect(timelineCaptionText(parseTimelineSpec(SVERIGE))).toContain("komprimerad skala");
	});

	it("keeps the author's own note alongside the disclosure", () => {
		const caption = timelineCaptionText(
			parseTimelineSpec(withScalar(SVERIGE, "note: Årtalen är omtvistade.")),
		);
		expect(caption).toContain("Årtalen är omtvistade.");
		expect(caption).toContain("komprimerad skala");
	});

	it("makes no claim about scale when the points are spaced evenly", () => {
		expect(
			timelineCaptionText(parseTimelineSpec(withScalar(SVERIGE, "scale: even"))),
		).not.toContain("komprimerad skala");
	});

	/* The <ol> is text a screen reader already walks entry by entry, so the label
	   orients and gets out of the way rather than reading the whole rail twice. */
	it("labels the figure briefly and names the emphasis, which colour alone cannot say", () => {
		const alt = timelineAltText(parseTimelineSpec(SVERIGE));
		expect(alt).toContain("4 punkter");
		expect(alt).toContain("1949");
		expect(alt).not.toContain("Spillingeskatten");
	});
});

describe("year spans", () => {
	/* remark-smartypants skips code nodes, so a fence never gets the house dash from the
	   markdown pipeline. An author writing the plain hyphen must still get "1709–1714". */
	it("sets a span of years with an en dash", () => {
		const markup = renderTimelineMarkup(
			parseTimelineSpec("source: X\ndata:\n  1709-1714: A\n  1715-1718: B\n  1727: C\n"),
		);
		expect(markup).toContain("1709–1714");
		expect(markup).not.toContain("1709-1714");
	});

	it("leaves a lone year and a non-year label alone", () => {
		const markup = renderTimelineMarkup(
			parseTimelineSpec("source: X\ndata:\n  1949: A\n  1950: B\n  i dag: C\n"),
		);
		expect(markup).toContain(">1949<");
		expect(markup).toContain(">i dag<");
	});
});
