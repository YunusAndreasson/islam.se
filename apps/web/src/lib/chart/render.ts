/**
 * Chart geometry. One builder, two destinations.
 *
 * WEB (`mode: "web"`) puts `bars`, `columns` and `stack` in HTML + CSS and `line` /
 * `slope` in SVG. That split is not indecision — it is what the site already does:
 * /moskeer draws its decade and county bars as CSS boxes, and the bönetider annual chart
 * is static SVG. CSS bars win where they win because their labels are REAL TEXT: a long
 * Swedish category ("Bosniakiska islamiska samfundet") wraps, scales with the reader's
 * font size, and can be selected and searched. SVG <text> can do none of those.
 *
 * PRINT (`mode: "print"`) renders every form as SVG, because Typst and EPUB take an image
 * and cannot take a stylesheet. Print also substitutes literal colours: there are no CSS
 * custom properties out there, so `var(--color-brass)` would paint nothing at all.
 *
 * ONE COLOUR. DESIGN.md allows four colours on the whole site and says the brass "earns
 * its place by encoding something". So a chart separates its series by direct labelling,
 * by position, and by brass-against-muted — never by hue. If a chart needs a third
 * colour, the chart is wrong; split it into small multiples.
 */
import {
	formatNumber,
	formatShare,
	formatValue,
	housePunctuation,
	joinSwedish,
	seriesDecimals,
} from "./format";
import type { ChartDatum, ChartSpec } from "./spec";

// ---------------------------------------------------------------------------
// A minimal hast, so the rehype plugin, the EPUB and the .astro component can all
// consume one tree. Same hand-built approach as src/plugins/rehype-quran-verse.ts.
// ---------------------------------------------------------------------------

export interface HastText {
	type: "text";
	value: string;
}
export interface HastElement {
	type: "element";
	tagName: string;
	properties: Record<string, string | number | boolean | undefined>;
	children: HastNode[];
}
export type HastNode = HastElement | HastText;

export type ChartMode = "web" | "print";

function h(
	tagName: string,
	properties: Record<string, string | number | boolean | undefined> = {},
	children: (HastNode | string | null | false)[] = [],
): HastElement {
	return {
		type: "element",
		tagName,
		properties,
		children: children
			.filter((c): c is HastNode | string => c !== null && c !== false)
			.map((c) => (typeof c === "string" ? { type: "text" as const, value: c } : c)),
	};
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

/** Light-scheme literals for print. Mirrors tokens.css — change both together. */
const PRINT = {
	brass: "#b8862f",
	muted: "#776d61",
	// --color-divider / --color-rule resolved against --color-bg #fff6e8, since neither
	// color-mix() nor light-dark() survives outside a browser.
	divider: "#e4dbcd",
	rule: "#cbc2b5",
	bg: "#fff6e8",
	// currentColor, not a literal: an EPUB reader in night mode recolours text but not an
	// SVG fill, so a hard #1a1914 would leave the labels near-black on a black page. Typst
	// resolves currentColor to black, which is what the printed book wants anyway.
	text: "currentColor",
} as const;

function palette(mode: ChartMode) {
	if (mode === "print") return PRINT;
	return {
		brass: "var(--color-brass)",
		muted: "var(--color-muted)",
		divider: "var(--color-divider)",
		rule: "var(--color-rule)",
		bg: "var(--color-bg)",
		text: "var(--color-text)",
	} as const;
}

/** Brass unless an `emphasis` is set and this row is not it — the one-vs-rest form. */
function markColour(spec: ChartSpec, label: string, mode: ChartMode): string {
	const p = palette(mode);
	if (!spec.emphasis) return p.brass;
	return label === spec.emphasis ? p.brass : p.muted;
}

/** Series 0 is brass, series 1 is muted. Two is the ceiling; spec.ts enforces it. */
function seriesColour(index: number, mode: ChartMode): string {
	const p = palette(mode);
	return index === 0 ? p.brass : p.muted;
}

// ---------------------------------------------------------------------------
// Scales
// ---------------------------------------------------------------------------

function finite(values: number[]): number[] {
	return values.filter((v) => Number.isFinite(v));
}

function allValues(spec: ChartSpec): number[] {
	return finite(spec.data.flatMap((d) => d.values));
}

/**
 * Bars and columns are measured from zero, always. A truncated baseline triples the
 * apparent difference between two numbers, which is the oldest way to mislead with a
 * chart and not one this site is going to start with.
 */
function axisMax(spec: ChartSpec): number {
	if (spec.max !== undefined) return spec.max;
	const values = allValues(spec);
	const top = values.length > 0 ? Math.max(...values, 0) : 1;
	return top > 0 ? top : 1;
}

function pct(value: number, max: number): number {
	if (!Number.isFinite(value) || max <= 0) return 0;
	return Math.max(0, Math.min(100, (value / max) * 100));
}

// ---------------------------------------------------------------------------
// Alt text — a full Swedish sentence, never "stapeldiagram"
// ---------------------------------------------------------------------------

const TYPE_NAMES: Record<ChartSpec["type"], string> = {
	bars: "Stapeldiagram",
	columns: "Stapeldiagram",
	line: "Linjediagram",
	slope: "Lutningsdiagram",
	stack: "Andelsdiagram",
};

export function chartAltText(spec: ChartSpec): string {
	if (spec.alt) return housePunctuation(spec.alt);
	const unit = spec.unit ? ` i ${spec.unit}` : "";
	const dp = seriesDecimals(allValues(spec));

	if (spec.type === "stack") {
		const total = allValues(spec).reduce((a, b) => a + b, 0);
		const parts = spec.data.map((d) => `${d.label} ${formatShare(d.values[0] ?? 0, total)}`);
		return housePunctuation(`Andelsdiagram: ${joinSwedish(parts)}. Källa: ${spec.source}.`);
	}

	// ⚠️ `slope` and `line` disagree about what a data row IS, and sharing an alt-text
	// branch made the slope lie. In `line` a row is a point in time, so "från first till
	// last" describes the x-axis correctly. In `slope` a row is a CATEGORY and the two
	// SERIES are the time points — so the shared branch produced »från Islamofobiska till
	// Övriga motiv… Serien faller från 328 till 67«, which compares the first category's
	// start against the last category's start and states a change that never happened.
	// Sighted readers saw four correct lines; screen-reader users were told a falsehood.
	// Found 2026-08-20 on moske.md. Describe each category's own move instead.
	if (spec.type === "slope") {
		const [from = "", to = ""] = spec.series;
		const moves = spec.data.map((d) => {
			const a = d.values[0];
			const b = d.values[1];
			if (a === undefined || b === undefined || Number.isNaN(a) || Number.isNaN(b)) {
				return `${d.label} saknar värde`;
			}
			return `${d.label} från ${formatValue(a, spec.unit, dp)} till ${formatValue(b, spec.unit, dp)}`;
		});
		const span = from && to ? ` mellan ${from} och ${to}` : "";
		return housePunctuation(
			`Lutningsdiagram${span}: ${joinSwedish(moves)}. Källa: ${spec.source}.`,
		);
	}

	if (spec.type === "line") {
		const first = spec.data[0];
		const last = spec.data[spec.data.length - 1];
		const named = spec.series.filter((s) => s !== "");
		const which = named.length > 0 ? ` för ${joinSwedish(named)}` : "";
		const span = first && last && first !== last ? ` från ${first.label} till ${last.label}` : "";
		return housePunctuation(
			`${TYPE_NAMES[spec.type]}${which}${span}${unit}. ${describeExtremes(spec)} Källa: ${spec.source}.`,
		);
	}

	const parts = spec.data.map(
		(d) => `${d.label} ${formatValue(d.values[0] ?? Number.NaN, spec.unit, dp)}`,
	);
	return housePunctuation(
		`${TYPE_NAMES[spec.type]}: ${joinSwedish(parts)}. Källa: ${spec.source}.`,
	);
}

/** The one sentence a sighted reader gets from the shape: where it starts and ends. */
function describeExtremes(spec: ChartSpec): string {
	const dp = seriesDecimals(allValues(spec));
	const first = spec.data[0];
	const last = spec.data[spec.data.length - 1];
	if (!(first && last)) return "";
	const a = first.values[0];
	const b = last.values[0];
	if (a === undefined || b === undefined) return "";
	if (!(Number.isFinite(a) && Number.isFinite(b))) return "";
	const direction = b > a ? "stiger" : b < a ? "faller" : "ligger stilla";
	let sentence = `Serien ${direction} från ${formatValue(a, spec.unit, dp)} till ${formatValue(b, spec.unit, dp)}.`;

	// ⚠️ First-to-last is the whole story only for a monotonic line. Charting the 114
	// suras by verse count produced »Serien faller från 7 verser till 6 verser« — true of
	// the endpoints and blind to the peak of 286 that is the entire point of the figure.
	// A screen-reader user got a flat line; a sighted one saw a cliff. Name the extreme
	// whenever it does not sit at an end.
	const points = spec.data
		.map((d) => ({ label: d.label, v: d.values[0] }))
		.filter(
			(p): p is { label: string; v: number } => typeof p.v === "number" && Number.isFinite(p.v),
		);
	if (points.length > 2) {
		const peak = points.reduce(
			(m, p) => (p.v > m.v ? p : m),
			points[0] as { label: string; v: number },
		);
		const low = points.reduce(
			(m, p) => (p.v < m.v ? p : m),
			points[0] as { label: string; v: number },
		);
		const ends = [points[0]?.label, points[points.length - 1]?.label];
		if (!ends.includes(peak.label)) {
			sentence += ` Högst är ${peak.label} med ${formatValue(peak.v, spec.unit, dp)}.`;
		}
		if (!ends.includes(low.label) && low.label !== peak.label) {
			sentence += ` Lägst är ${low.label} med ${formatValue(low.v, spec.unit, dp)}.`;
		}
	}
	return sentence;
}

// ---------------------------------------------------------------------------
// Caption
// ---------------------------------------------------------------------------

/** With the unit off the marks, the caption is where it has to appear. */
function unitLead(spec: ChartSpec): string | null {
	const u = spec.unit?.trim();
	if (!u) return null;
	if (u === "%" || u.toLowerCase() === "procent") return null;
	return `${u.charAt(0).toUpperCase()}${u.slice(1)}.`;
}

/**
 * The caption as flat text, for destinations that cannot take markup — the Typst book,
 * and anywhere the figure has to be described in one line. Shares `unitLead` with the
 * web caption so a chart says the same thing on screen and on paper.
 */
export function chartCaptionText(spec: ChartSpec): string {
	const lead = spec.caption ?? unitLead(spec);
	return housePunctuation([lead, `Källa: ${spec.source}.`, spec.note].filter(Boolean).join(" "));
}

function captionNodes(spec: ChartSpec): HastNode[] {
	const nodes: HastNode[] = [];
	const lead = spec.caption ?? unitLead(spec);
	if (lead) {
		nodes.push(h("span", { className: "chart-cap-lead" }, [housePunctuation(lead)]));
	}
	const sourceChildren: (HastNode | string)[] = ["Källa: "];
	if (spec.sourceUrl) {
		sourceChildren.push(
			h("a", { href: spec.sourceUrl, rel: "nofollow" }, [housePunctuation(spec.source)]),
		);
	} else {
		sourceChildren.push(housePunctuation(spec.source));
	}
	sourceChildren.push(".");
	nodes.push(h("span", { className: "chart-cap-source" }, sourceChildren));
	if (spec.note) {
		nodes.push(h("span", { className: "chart-cap-note" }, [housePunctuation(spec.note)]));
	}
	return nodes;
}

// ---------------------------------------------------------------------------
// SVG text metrics
//
// ⚠️ px, and NOT a --step-- token. This is the same call AnnualPrayerChart.astro makes,
// for the same reason: text inside a viewBox is measured in USER UNITS, so 12px here
// scales with the chart and keeps its proportion to the padding and the gridlines. A rem
// token would resolve against the reader's root font size instead, so a 20px browser
// default would grow the labels ~35 % while the geometry around them stood still, and
// they would collide. Do not "snap this to the scale".
// ---------------------------------------------------------------------------

/**
 * ⚠️ Text inside a viewBox is measured in USER UNITS, so its rendered size is
 * AXIS_PX × (rendered width / viewBox width). That ratio is the whole problem with a
 * responsive SVG chart, and it is why the two SVG forms use a 560-unit box rather than
 * the 760 the print forms use: at 560 an axis label lands at ~14px on a 42rem column and
 * ~11px at the 32rem floor the stylesheet scrolls to. At 760 the same label would be 5px
 * on a phone — which is what a naive width:100% SVG chart does, and it is unreadable.
 *
 * Still px and NOT a --step-- token, for the reason AnnualPrayerChart.astro:190 records:
 * a rem token resolves against the reader's root font size, so a 20px browser default
 * would grow the labels ~35 % while the geometry around them stood still.
 */
const AXIS_PX = 12;
/** viewBox width for the two SVG forms. See AXIS_PX. */
const SVG_W = 560;
/** Rough advance width per character at AXIS_PX, for reserving label gutters. */
const CHAR_W = 0.55;

function svgRoot(
	width: number,
	height: number,
	label: string,
	children: (HastNode | false)[],
): HastElement {
	return h(
		"svg",
		{
			className: "chart-svg",
			viewBox: `0 0 ${width} ${height}`,
			role: "img",
			"aria-label": label,
			xmlns: "http://www.w3.org/2000/svg",
		},
		children,
	);
}

function svgText(
	x: number,
	y: number,
	value: string,
	opts: { anchor?: string; fill: string; size?: number; className?: string } = { fill: "" },
): HastElement {
	return h(
		"text",
		{
			x: round(x),
			y: round(y),
			"text-anchor": opts.anchor ?? "start",
			fill: opts.fill,
			"font-size": opts.size ?? AXIS_PX,
			"font-family": "Literata, Georgia, serif",
			...(opts.className ? { className: opts.className } : {}),
		},
		[value],
	);
}

function round(n: number): number {
	return Math.round(n * 10) / 10;
}

// ---------------------------------------------------------------------------
// bars — ranked horizontal. The default form.
// ---------------------------------------------------------------------------

/**
 * "44 moskéer" repeated down seven rows is noise; the unit belongs once, in the caption.
 * A percent sign is the exception — one character, and it reads as part of the number.
 */
function barValue(value: number, unit?: string, decimals?: number): string {
	const u = unit?.trim().toLowerCase();
	if (u === "%" || u === "procent") return formatValue(value, unit, decimals);
	return formatNumber(value, decimals);
}

function barsWeb(spec: ChartSpec, alt: string): HastElement {
	const max = axisMax(spec);
	return h("div", { className: "chart-plot chart-bars", role: "img", "aria-label": alt }, [
		...spec.data.map((d) => {
			const value = d.values[0] ?? Number.NaN;
			const dim = Boolean(spec.emphasis) && d.label !== spec.emphasis;
			return h("div", { className: dim ? "chart-bar-row is-dim" : "chart-bar-row" }, [
				h("span", { className: "chart-bar-label" }, [d.label]),
				h("span", { className: "chart-bar-track" }, [
					h("span", {
						className: "chart-bar-fill",
						style: `width:${round(pct(value, max))}%`,
					}),
				]),
				h("span", { className: "chart-bar-value" }, [barValue(value, spec.unit)]),
			]);
		}),
	]);
}

function barsSvg(spec: ChartSpec, alt: string, mode: ChartMode): HastElement {
	const p = palette(mode);
	const max = axisMax(spec);
	const W = 760;
	const rowH = 30;
	const gap = 8;
	const labelW = Math.min(
		260,
		Math.max(90, Math.max(...spec.data.map((d) => d.label.length)) * AXIS_PX * CHAR_W),
	);
	const valueW = Math.max(
		60,
		Math.max(...spec.data.map((d) => barValue(d.values[0] ?? 0, spec.unit).length)) *
			AXIS_PX *
			CHAR_W,
	);
	const trackX = labelW + 12;
	const trackW = W - trackX - valueW - 12;
	const H = spec.data.length * (rowH + gap);

	return svgRoot(W, H, alt, [
		...spec.data.flatMap((d, i) => {
			const y = i * (rowH + gap);
			const value = d.values[0] ?? Number.NaN;
			const w = (pct(value, max) / 100) * trackW;
			const mid = y + rowH / 2 + AXIS_PX * 0.35;
			return [
				svgText(labelW, mid, d.label, { anchor: "end", fill: p.text }),
				h("rect", {
					x: round(trackX),
					y: round(y + rowH * 0.18),
					width: round(Math.max(w, 2)),
					height: round(rowH * 0.64),
					rx: 2,
					fill: markColour(spec, d.label, mode),
				}),
				svgText(trackX + w + 8, mid, barValue(value, spec.unit), { fill: p.muted }),
			];
		}),
	]);
}

// ---------------------------------------------------------------------------
// columns — vertical, ordinal x axis
// ---------------------------------------------------------------------------

function columnsWeb(spec: ChartSpec, alt: string): HastElement {
	const dp = seriesDecimals(allValues(spec));
	const max = axisMax(spec);
	const grouped = spec.series.length > 1;
	return h("div", { className: "chart-plot chart-columns", role: "img", "aria-label": alt }, [
		h(
			"div",
			{ className: "chart-col-grid" },
			spec.data.map((d) =>
				h("div", { className: "chart-col" }, [
					// ⚠️ For a single series the bar is a DIRECT child of the track, carrying its
					// own height:% — the /moskeer .mk-growth-track idiom. An intermediate
					// full-height wrapper would grow to fill the track and shove the value label
					// up to a fixed line, detaching it from the column it belongs to.
					h(
						"div",
						{ className: "chart-col-track" },
						grouped
							? [
									h(
										"div",
										{ className: "chart-col-bars" },
										d.values.map((v, si) =>
											h("span", {
												className: si === 0 ? "chart-col-bar" : "chart-col-bar is-second",
												style: `height:${round(pct(v, max))}%`,
											}),
										),
									),
								]
							: [
									h("span", { className: "chart-col-value" }, [
										formatNumber(d.values[0] ?? Number.NaN, dp),
									]),
									h("span", {
										className: "chart-col-bar",
										style: `height:${round(pct(d.values[0] ?? Number.NaN, max))}%`,
									}),
								],
					),
					h("span", { className: "chart-col-label" }, [d.label]),
				]),
			),
		),
		grouped ? legend(spec) : null,
	]);
}

function columnsSvg(spec: ChartSpec, alt: string, mode: ChartMode): HastElement {
	const dp = seriesDecimals(allValues(spec));
	const p = palette(mode);
	const max = axisMax(spec);
	const W = 760;
	const H = 300;
	const padB = 30;
	const padT = 20;
	const plotH = H - padB - padT;
	const slot = W / spec.data.length;
	const barW = Math.min(52, slot * 0.52) / spec.series.length;

	return svgRoot(W, H, alt, [
		h("line", {
			x1: 0,
			y1: round(padT + plotH),
			x2: W,
			y2: round(padT + plotH),
			stroke: p.divider,
			"stroke-width": 1,
		}),
		...spec.data.flatMap((d, i) => {
			const cx = i * slot + slot / 2;
			const group = d.values.length * barW;
			return [
				...d.values.map((v, si) => {
					const bh = (pct(v, max) / 100) * plotH;
					return h("rect", {
						x: round(cx - group / 2 + si * barW + 1),
						y: round(padT + plotH - bh),
						width: round(barW - 2),
						height: round(Math.max(bh, 2)),
						rx: 2,
						fill: spec.series.length > 1 ? seriesColour(si, mode) : markColour(spec, d.label, mode),
					});
				}),
				spec.series.length === 1 &&
					svgText(
						cx,
						round(padT + plotH - (pct(d.values[0] ?? 0, max) / 100) * plotH - 6),
						formatNumber(d.values[0] ?? Number.NaN, dp),
						{
							anchor: "middle",
							fill: p.muted,
						},
					),
				svgText(cx, H - 10, d.label, { anchor: "middle", fill: p.muted }),
			];
		}),
	]);
}

// ---------------------------------------------------------------------------
// stack — one 100 % bar. Replaces the pie, which would need hues this site lacks.
// ---------------------------------------------------------------------------

function stackTotal(spec: ChartSpec): number {
	return allValues(spec).reduce((a, b) => a + b, 0);
}

function stackWeb(spec: ChartSpec, alt: string): HastElement {
	const total = stackTotal(spec);
	const fill = (d: ChartDatum, i: number) =>
		spec.emphasis ? markColour(spec, d.label, "web") : rampColour(i, spec.data.length, "web");
	return h("div", { className: "chart-plot chart-stack", role: "img", "aria-label": alt }, [
		h(
			"div",
			{ className: "chart-stack-bar" },
			spec.data.map((d, i) =>
				h("span", {
					className: "chart-stack-seg",
					style: `width:${round(pct(d.values[0] ?? 0, total))}%;background:${fill(d, i)}`,
				}),
			),
		),
		h(
			"ul",
			{ className: "chart-stack-key" },
			spec.data.map((d, i) =>
				h("li", {}, [
					h("span", { className: "chart-stack-chip", style: `background:${fill(d, i)}` }),
					h("span", { className: "chart-stack-name" }, [d.label]),
					h("span", { className: "chart-stack-val" }, [formatShare(d.values[0] ?? 0, total)]),
				]),
			),
		),
	]);
}

/**
 * The ordered ramp: brass at the head fading toward muted at the tail. This is how an
 * ordered many-category chart stays inside one hue — lightness carries the order, which
 * is also the only encoding that survives a greyscale print.
 */
function rampColour(index: number, count: number, mode: ChartMode): string {
	const p = palette(mode);
	if (count <= 1) return p.brass;
	const t = index / (count - 1);
	if (mode === "print") {
		// Mix brass toward muted in sRGB, since color-mix() is a browser function.
		const from = [0xb8, 0x86, 0x2f];
		const to = [0x77, 0x6d, 0x61];
		const mixed = from.map((c, i) => Math.round(c + ((to[i] as number) - c) * t));
		return `#${mixed.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
	}
	return `color-mix(in oklab, var(--color-brass) ${round(100 - t * 70)}%, var(--color-muted))`;
}

function stackSvg(spec: ChartSpec, alt: string, mode: ChartMode): HastElement {
	const p = palette(mode);
	const total = stackTotal(spec);
	const W = 760;
	const barH = 46;
	const lineH = 22;
	const H = barH + 16 + spec.data.length * lineH;
	let x = 0;

	const segments = spec.data.map((d, i) => {
		const w = (pct(d.values[0] ?? 0, total) / 100) * W;
		const node = h("rect", {
			x: round(x),
			y: 0,
			width: round(Math.max(w - 1.5, 1)),
			height: barH,
			fill: spec.emphasis ? markColour(spec, d.label, mode) : rampColour(i, spec.data.length, mode),
		});
		x += w;
		return node;
	});

	return svgRoot(W, H, alt, [
		...segments,
		...spec.data.map((d, i) =>
			h("g", {}, [
				h("rect", {
					x: 0,
					y: round(barH + 16 + i * lineH - 9),
					width: 10,
					height: 10,
					rx: 2,
					fill: spec.emphasis
						? markColour(spec, d.label, mode)
						: rampColour(i, spec.data.length, mode),
				}),
				svgText(18, round(barH + 16 + i * lineH), d.label, { fill: p.text }),
				svgText(W, round(barH + 16 + i * lineH), formatShare(d.values[0] ?? 0, total), {
					anchor: "end",
					fill: p.muted,
				}),
			]),
		),
	]);
}

// ---------------------------------------------------------------------------
// line — one or two series over time, labelled at the end, never in a legend box
// ---------------------------------------------------------------------------

function lineSvg(spec: ChartSpec, alt: string, mode: ChartMode): HastElement {
	const dp = seriesDecimals(allValues(spec));
	const p = palette(mode);
	const max = axisMax(spec);
	const named = spec.series.some((s) => s !== "");
	const W = SVG_W;
	const H = 240;
	const padT = 26;
	const padB = 28;
	const padL = 0;
	const endGutter = named
		? Math.max(...spec.series.map((s) => s.length)) * AXIS_PX * CHAR_W + 14
		: 8;
	const plotW = W - padL - endGutter;
	const plotH = H - padT - padB;

	const x = (i: number) =>
		padL + (spec.data.length <= 1 ? 0 : (i / (spec.data.length - 1)) * plotW);
	const y = (v: number) => padT + plotH - (pct(v, max) / 100) * plotH;

	// Ticks: first, last, and roughly every sixth in between — enough to orient, few
	// enough that they never collide at 375px. A regular tick sitting right on top of the
	// last one is dropped: with 8 points the naive rule put 2022 and 2023 side by side.
	const step = Math.max(1, Math.ceil(spec.data.length / 6));
	const lastIdx = spec.data.length - 1;
	const ticks = spec.data
		.map((d, i) => ({ d, i }))
		.filter(({ i }) => {
			if (i === 0 || i === lastIdx) return true;
			if (i % step !== 0) return false;
			return lastIdx - i >= step && i >= step / 2;
		});

	return svgRoot(W, H, alt, [
		// Zero baseline and a single hairline at the top of the scale, labelled with the
		// real maximum. Without it a line chart is a shape with no magnitude — the reader
		// can see that it rises but not from what to what. Two rules is the whole grid;
		// DESIGN.md does not want a ladder of them.
		h("line", {
			x1: 0,
			y1: round(padT + plotH),
			x2: round(padL + plotW),
			y2: round(padT + plotH),
			stroke: p.divider,
			"stroke-width": 1,
		}),
		h("line", {
			x1: 0,
			y1: round(padT),
			x2: round(padL + plotW),
			y2: round(padT),
			stroke: p.divider,
			"stroke-width": 1,
		}),
		svgText(0, round(padT - 5), formatValue(max, spec.unit, dp), { fill: p.muted }),
		...spec.series.map((_name, si) => {
			const points = spec.data
				.map((d, i) => ({ v: d.values[si], i }))
				.filter((pt): pt is { v: number; i: number } => Number.isFinite(pt.v))
				.map((pt) => `${round(x(pt.i))},${round(y(pt.v))}`)
				.join(" ");
			return h("polyline", {
				points,
				fill: "none",
				stroke: seriesColour(si, mode),
				"stroke-width": 2,
				"stroke-linejoin": "round",
				"stroke-linecap": "round",
			});
		}),
		...(named
			? spec.series.map((name, si) => {
					const lastIndex = [...spec.data]
						.map((d, i) => ({ v: d.values[si], i }))
						.filter((pt) => Number.isFinite(pt.v))
						.pop();
					if (!lastIndex) return false;
					return svgText(
						round(x(lastIndex.i) + 8),
						round(y(lastIndex.v as number) + AXIS_PX * 0.35),
						name,
						{ fill: seriesColour(si, mode), className: "chart-endlabel" },
					);
				})
			: []),
		...ticks.map(({ d, i }) =>
			svgText(round(x(i)), H - 8, d.label, {
				anchor: i === 0 ? "start" : i === lastIdx ? "end" : "middle",
				fill: p.muted,
				className: i === 0 || i === lastIdx ? "chart-tick" : "chart-tick is-minor",
			}),
		),
	]);
}

// ---------------------------------------------------------------------------
// slope — two dates, N categories. One brass, the rest muted.
// ---------------------------------------------------------------------------

function slopeSvg(spec: ChartSpec, alt: string, mode: ChartMode): HastElement {
	const dp = seriesDecimals(allValues(spec));
	const p = palette(mode);
	const max = axisMax(spec);
	const W = SVG_W;
	const H = 260;
	const padT = 30;
	const padB = 20;
	const gutter = Math.max(
		110,
		Math.max(...spec.data.map((d) => d.label.length)) * AXIS_PX * CHAR_W + 60,
	);
	const left = gutter;
	const right = W - gutter;
	const plotH = H - padT - padB;
	const y = (v: number) => padT + plotH - (pct(v, max) / 100) * plotH;

	// Two categories with near-identical values put their labels on the same line.
	// Measured on moske.md: »Kristofobiska 73« and »Övriga motiv 67« sat 2 user units
	// apart and the text collided into an unreadable smear, while the lines themselves
	// were fine. Nudge the LABELS apart without moving the data points — the line still
	// starts at its true value, only the text slides.
	const rows = spec.data
		.map((d) => ({ d, a: d.values[0], b: d.values[1] }))
		.filter(
			(r): r is { d: ChartDatum; a: number; b: number } =>
				Number.isFinite(r.a) && Number.isFinite(r.b),
		);
	const labelY = (values: number[]): number[] => {
		const gap = AXIS_PX * 1.15;
		const order = values.map((v, i) => ({ i, y: y(v) })).sort((m, n) => m.y - n.y);
		for (let k = 1; k < order.length; k++) {
			const prev = order[k - 1];
			const cur = order[k];
			if (prev && cur && cur.y - prev.y < gap) cur.y = prev.y + gap;
		}
		const out = new Array<number>(values.length);
		for (const o of order) out[o.i] = o.y;
		return out;
	};
	const leftLabelY = labelY(rows.map((r) => r.a));
	const rightLabelY = labelY(rows.map((r) => r.b));

	return svgRoot(W, H, alt, [
		svgText(left, 14, spec.series[0] ?? "", { anchor: "middle", fill: p.muted }),
		svgText(right, 14, spec.series[1] ?? "", { anchor: "middle", fill: p.muted }),
		...rows.flatMap(({ d, a, b }, ri) => {
			const colour = markColour(spec, d.label, mode);
			const ya = y(a);
			const yb = y(b);
			const tya = leftLabelY[ri] ?? ya;
			const tyb = rightLabelY[ri] ?? yb;
			return [
				h("line", {
					x1: round(left),
					y1: round(ya),
					x2: round(right),
					y2: round(yb),
					stroke: colour,
					"stroke-width": 2,
				}),
				h("circle", { cx: round(left), cy: round(ya), r: 3.5, fill: colour }),
				h("circle", { cx: round(right), cy: round(yb), r: 3.5, fill: colour }),
				svgText(
					round(left - 10),
					round(tya + AXIS_PX * 0.35),
					`${d.label}  ${formatNumber(a, dp)}`,
					{
						anchor: "end",
						fill: colour,
					},
				),
				svgText(round(right + 10), round(tyb + AXIS_PX * 0.35), formatNumber(b, dp), {
					fill: colour,
				}),
			];
		}),
	]);
}

// ---------------------------------------------------------------------------
// Shared legend, used only where a direct label genuinely will not fit
// ---------------------------------------------------------------------------

function legend(spec: ChartSpec): HastElement {
	return h(
		"ul",
		{ className: "chart-legend" },
		spec.series.map((name, si) =>
			h("li", {}, [
				h("span", {
					className: si === 0 ? "chart-legend-chip" : "chart-legend-chip is-second",
				}),
				name,
			]),
		),
	);
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

function plot(spec: ChartSpec, alt: string, mode: ChartMode): HastElement {
	if (mode === "print") {
		switch (spec.type) {
			case "bars":
				return barsSvg(spec, alt, mode);
			case "columns":
				return columnsSvg(spec, alt, mode);
			case "stack":
				return stackSvg(spec, alt, mode);
			case "line":
				return lineSvg(spec, alt, mode);
			case "slope":
				return slopeSvg(spec, alt, mode);
		}
	}
	switch (spec.type) {
		case "bars":
			return barsWeb(spec, alt);
		case "columns":
			return columnsWeb(spec, alt);
		case "stack":
			return stackWeb(spec, alt);
		case "line":
			return lineWeb(spec, alt);
		case "slope":
			return svgPlot(slopeSvg(spec, alt, mode));
	}
}

/**
 * ⚠️ EVERY SVG form must be wrapped in .chart-plot, unconditionally.
 *
 * That element is the horizontal scroll container, and `.chart-svg { min-width: 32rem }`
 * depends on it: without the wrapper the min-width has nothing to scroll inside and
 * pushes the FIGURE wider than the viewport, which makes the whole PAGE scroll sideways.
 * Caught in Zen at 375px, after headless Chromium had shown nothing wrong — the slope
 * form returned a bare <svg> and the bug was invisible until a real narrow viewport.
 */
function svgPlot(svg: HastElement, extra: (HastNode | false | null)[] = []): HastElement {
	return h("div", { className: "chart-plot" }, [svg, ...extra]);
}

/**
 * The line chart plus the legend the stylesheet reveals under 480px, where the in-SVG
 * end labels are enlarged past the gutter that was measured for them. Two renderings of
 * the same three words costs a few bytes; a label sliced off at the edge costs the reader
 * the series name.
 */
function lineWeb(spec: ChartSpec, alt: string): HastElement {
	const svg = lineSvg(spec, alt, "web");
	if (!spec.series.some((s) => s !== "")) return svgPlot(svg);
	return svgPlot(svg, [legend(spec)]);
}

/** The <figure> a chart becomes, for the rehype plugin, the EPUB and Chart.astro. */
export function buildChartHast(spec: ChartSpec, mode: ChartMode = "web"): HastElement {
	const alt = chartAltText(spec);
	return h("figure", { className: `chart chart--${spec.type}` }, [
		plot(spec, alt, mode),
		h("figcaption", { className: "chart-cap" }, captionNodes(spec)),
	]);
}

/**
 * The same figure as a string. Used by Chart.astro (set:html) and by the PDF path, which
 * writes the SVG to a file for Typst's `image()`.
 *
 * ⚠️ Serialised as well-formed XML — void elements self-close and every attribute value
 * is escaped. The EPUB is XHTML, where a bare `&` or an unclosed <rect> is not a
 * rendering quirk but a file the reader refuses to open.
 */
export function renderChartMarkup(spec: ChartSpec, mode: ChartMode = "web"): string {
	return hastToXml(buildChartHast(spec, mode));
}

/** Just the <svg>, for embedding in Typst. Always print mode. */
export function renderChartSvg(spec: ChartSpec): string {
	return hastToXml(plot(spec, chartAltText(spec), "print"));
}

const VOID_TAGS = new Set(["rect", "circle", "line", "polyline", "path", "br", "img", "use"]);

/** hast property name → serialised attribute name. */
function attrName(key: string): string {
	if (key === "className") return "class";
	return key;
}

export function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

export function hastToXml(node: HastNode): string {
	if (node.type === "text") return escapeXml(node.value);
	const attrs = Object.entries(node.properties)
		.filter(([, v]) => v !== undefined && v !== false && v !== "")
		.map(([k, v]) => ` ${attrName(k)}="${escapeXml(String(v))}"`)
		.join("");
	if (node.children.length === 0 && VOID_TAGS.has(node.tagName)) {
		return `<${node.tagName}${attrs} />`;
	}
	const inner = node.children.map(hastToXml).join("");
	return `<${node.tagName}${attrs}>${inner}</${node.tagName}>`;
}
