/**
 * ```timeline → hast, for the web page, the EPUB and the markdown twin.
 *
 * The figure is an ordered list against a vertical rail: a dot and a year in the left
 * column, the event beside it. Vertical and not horizontal because a chronology with a
 * dozen entries has to hold at 375 px, and a horizontal axis there gives every event
 * about two centimetres of label.
 *
 * ⚠️ THE FIGURE IS `chart chart--timeline`, NOT A NEW CLASS FAMILY. Same reasoning as
 * the ```table fence: the caption apparatus is identical and chart.css is inlined into
 * every page, so a parallel `timeline-cap*` family would duplicate that stylesheet on
 * ~2 473 pages to say the same thing. It also keeps assert-full-build.mjs counting the
 * figure in its existing `<figure class="chart chart--` comparison.
 *
 * ⚠️ THE SPACING IS THE CLAIM, so it is disclosed. `scale: time` derives each gap from
 * the square root of the years elapsed, which preserves the shape of a lopsided
 * chronology without crushing its dense end. A reader who measures the rail with a ruler
 * would otherwise read a false proportion off it, so timelineCaptionText() appends the
 * disclosure and there is no way to suppress it.
 *
 * ⚠️ `mode` is accepted and deliberately unused, exactly as in the table renderer. The
 * gaps ride on inline styles that work in the EPUB's XHTML as well as in the browser,
 * and the colours come from the destination's own stylesheet. The consequence worth
 * knowing: chart-check's web/print comparison compares two identical strings here, so it
 * cannot catch a mode-dependent regression — there is not a second mode to differ from.
 */

import { figureCaptionNodes, figureCaptionText, housePunctuation } from "../figure/caption";
import { type FigureMode, type HastElement, h, hastToXml } from "../figure/hast";
import type { TimelineSpec } from "./spec";

/**
 * A span of years takes an en dash, not a hyphen: "1709-1714" → "1709–1714".
 *
 * Done here rather than left to the author because remark-smartypants never reaches
 * inside a fence — it skips `code` nodes, and a spec IS a code node — so an author who
 * types the hyphen the house style asks for everywhere else would get it printed. The
 * same reason housePunctuation() exists for quotes.
 */
function yearSpans(label: string): string {
	return label.replace(/(\d{3,4})\s*-\s*(\d{3,4})/g, "$1\u2013$2");
}

/** Gap between two entries, in rem. The floor keeps a dot from touching the one above. */
const MIN_GAP = 1.05;
const MAX_GAP = 4.2;

/**
 * The gap above each entry, in rem — index 0 is always 0, since nothing precedes it.
 *
 * Under `scale: time` the weight is √Δyears. Linear Δ over this site's longest span
 * (ca 870 to today) would give the eleven centuries before 1900 the whole rail and leave
 * the twelve modern entries stacked in the last few pixels; even spacing would say the
 * distribution is uniform, which is the one thing it certainly is not. The square root
 * sits between the two and keeps both readable.
 *
 * Undated entries and any entry under `scale: even` take the floor.
 */
export function entryGaps(spec: TimelineSpec): number[] {
	const gaps = spec.entries.map(() => MIN_GAP);
	gaps[0] = 0;
	if (spec.scale === "even") return gaps;

	const weights = spec.entries.map((entry, i) => {
		const prev = spec.entries[i - 1];
		if (i === 0 || !prev) return 0;
		if (!(Number.isFinite(entry.year) && Number.isFinite(prev.year))) return 0;
		return Math.sqrt(Math.max(0, entry.year - prev.year));
	});
	const peak = Math.max(...weights);
	if (peak === 0) return gaps;

	return weights.map((w, i) =>
		i === 0 ? 0 : Number((MIN_GAP + (MAX_GAP - MIN_GAP) * (w / peak)).toFixed(2)),
	);
}

/** A short orienting sentence — the <ol> is real text a screen reader already navigates. */
export function timelineAltText(spec: TimelineSpec): string {
	if (spec.alt) return spec.alt;
	// Through yearSpans() as well, or the label a screen reader reads out would punctuate
	// its years differently from the ones on screen.
	const first = yearSpans(spec.entries[0]?.label ?? "");
	const last = yearSpans(spec.entries[spec.entries.length - 1]?.label ?? "");
	const lead = spec.caption
		? housePunctuation(spec.caption)
		: `Tidslinje från ${first} till ${last}.`;
	const size = `${spec.entries.length} punkter.`;
	// The emphasis is a claim about which entry the chronology turns on. On the web it is
	// carried by colour, which a screen reader does not report — so it has to be said.
	const emphasis = spec.emphasis ? ` Punkten ${yearSpans(spec.emphasis)} är framhävd.` : "";
	return housePunctuation(`${lead} ${size}${emphasis} Källa: ${spec.source}.`);
}

/** The compression disclosure, appended to every proportional chronology. */
function scaleNote(spec: TimelineSpec): string | undefined {
	if (spec.scale !== "time") return spec.note;
	const disclosure =
		"Avståndet mellan punkterna följer tiden i komprimerad skala, så att de täta åren går att läsa.";
	return spec.note ? `${spec.note} ${disclosure}` : disclosure;
}

export function timelineCaptionText(spec: TimelineSpec): string {
	const note = scaleNote(spec);
	return figureCaptionText(spec.caption ?? null, note ? { ...spec, note } : spec);
}

export function buildTimelineHast(spec: TimelineSpec, _mode: FigureMode = "web"): HastElement {
	const gaps = entryGaps(spec);

	const items = spec.entries.map((entry, i) => {
		const emphasised = spec.emphasis !== undefined && entry.label === spec.emphasis;
		// One entry brass while the rest go muted — the same one-vs-rest encoding a chart
		// and a table use. With no emphasis set nothing is dimmed and the rail stays neutral.
		const dim = spec.emphasis !== undefined && !emphasised;
		const gap = gaps[i] ?? 0;
		return h(
			"li",
			{
				className: `chart-tl-item${emphasised ? " is-emphasis" : dim ? " is-dim" : ""}`,
				style: gap > 0 ? `margin-top:${gap}rem` : undefined,
			},
			[
				h("span", { className: "chart-tl-year" }, [yearSpans(housePunctuation(entry.label))]),
				h("span", { className: "chart-tl-event" }, [housePunctuation(entry.text)]),
			],
		);
	});

	// ⚠️ Wrapped in .chart-plot for the same reason every other form is: below the reading
	// floor a figure must scroll inside its own box rather than make the page scroll.
	const plot = h("div", { className: "chart-plot" }, [
		h("ol", { className: "chart-timeline" }, items),
	]);

	const note = scaleNote(spec);
	return h("figure", { className: "chart chart--timeline", "aria-label": timelineAltText(spec) }, [
		plot,
		h(
			"figcaption",
			{ className: "chart-cap" },
			figureCaptionNodes(spec.caption ?? null, note ? { ...spec, note } : spec),
		),
	]);
}

/** The whole figure as a markup string, for the EPUB and for hand-composed pages. */
export function renderTimelineMarkup(spec: TimelineSpec, mode: FigureMode = "web"): string {
	return hastToXml(buildTimelineHast(spec, mode));
}
