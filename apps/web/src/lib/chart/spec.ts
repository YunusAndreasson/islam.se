/**
 * The ```chart fence: grammar and parser.
 *
 * The corpus is pure prose — no MDX, no raw HTML, no directives — so a chart enters an
 * article as a fenced code block whose body is this format. That choice is what keeps the
 * numbers reviewable: `git diff` shows ten readable lines instead of two hundred lines of
 * SVG coordinates, and the human gate can check each figure against the source it names.
 *
 *     ```chart
 *     type: bars
 *     unit: personer
 *     source: SCB, folkmängd efter födelseland, 31 december 2024
 *     sourceUrl: https://statistikdatabasen.scb.se/api/v2/tables/TAB4822
 *     note: Födelseland, inte trosbekännelse – SCB för ingen religionsstatistik.
 *     emphasis: Syrien
 *     data:
 *       Syrien: 196000
 *       Irak: 146000
 *     ```
 *
 * Hand-rolled and dependency-free, like scripts/lib/essay-corpus.ts `parseFrontmatter`
 * and src/plugins/remark-abbr.ts. A malformed spec THROWS with the offending line number:
 * the build fails loudly rather than rendering half a chart into a published page.
 */

/** The five forms. Closed on purpose — see DIAGRAMFORMER.md in the article-charts skill.
 *  A form that cannot be read in one colour does not belong on this site. */
export const CHART_TYPES = ["bars", "columns", "line", "slope", "stack"] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export interface ChartDatum {
	label: string;
	/** One entry per series. Most charts have exactly one. */
	values: number[];
}

export interface ChartSpec {
	type: ChartType;
	data: ChartDatum[];
	/** Series names, parallel to `ChartDatum.values`. A single unnamed series is `[""]`. */
	series: string[];
	/** Required. The chart says where its numbers come from or it does not ship. */
	source: string;
	sourceUrl?: string;
	/** What the values measure — "personer", "procent", "antal moskéer". */
	unit?: string;
	/** The honest caveat: what this data CANNOT say. Rendered after the source. */
	note?: string;
	/** Overrides the generated caption lead. The source and note are always appended. */
	caption?: string;
	/** One data label painted brass while the rest go muted — the one-vs-rest form. */
	emphasis?: string;
	/** Force the axis maximum. Otherwise derived from the data. */
	max?: number;
	/** Overrides the generated aria-label. Write a full Swedish sentence. */
	alt?: string;
}

export class ChartSpecError extends Error {
	readonly line: number;
	constructor(message: string, line: number) {
		super(`rad ${line}: ${message}`);
		this.name = "ChartSpecError";
		this.line = line;
	}
}

const SCALAR_KEYS = new Set([
	"type",
	"source",
	"sourceUrl",
	"unit",
	"note",
	"caption",
	"emphasis",
	"max",
	"alt",
	"series",
]);

/**
 * Swedish number literals, as an author actually writes them: `196000`, `196 000`
 * (space or non-breaking space as the thousands separator), `12,5` (decimal comma),
 * and `12.5` for anyone who slips into the English habit. A bare `-` means "no value"
 * and yields NaN, which the renderers skip rather than plot as zero — a missing year in
 * a series is a gap, not a collapse to nothing.
 */
export function parseNumber(raw: string, line: number): number {
	const text = raw.trim();
	if (text === "" || text === "-" || text === "–") return Number.NaN;
	const cleaned = text
		.replace(/[\s  ]/g, "")
		.replace(/%$/, "")
		.replace(",", ".");
	const value = Number(cleaned);
	if (!Number.isFinite(value)) {
		throw new ChartSpecError(`»${text}« är inte ett tal`, line);
	}
	return value;
}

/** Splits a `a | b | c` row into trimmed cells. */
function cells(raw: string): string[] {
	return raw.split("|").map((c) => c.trim());
}

/**
 * Strips the common leading whitespace, keeping relative indentation intact.
 *
 * A fence in markdown arrives flush left and this is a no-op. A `spec` passed to
 * Chart.astro as a template literal arrives indented by however deep the JSX sat — and
 * since the grammar tells a scalar from a data row BY indentation, without this every
 * line would read as a data row and nothing would parse.
 */
function dedent(source: string): string {
	const lines = source.split("\n");
	const indents = lines.filter((l) => l.trim() !== "").map((l) => l.length - l.trimStart().length);
	const common = indents.length > 0 ? Math.min(...indents) : 0;
	if (common === 0) return source;
	return lines.map((l) => (l.trim() === "" ? l : l.slice(common))).join("\n");
}

interface Tokens {
	scalars: Map<string, string>;
	rows: { label: string; raw: string; line: number }[];
}

/** Pass one: turn lines into scalars and data rows. Shape only — no meaning yet. */
function tokenize(lines: string[]): Tokens {
	const scalars = new Map<string, string>();
	const rows: Tokens["rows"] = [];
	let inData = false;

	for (let i = 0; i < lines.length; i++) {
		const raw = lines[i] ?? "";
		const lineNo = i + 1;
		const trimmed = raw.trim();
		if (trimmed === "" || trimmed.startsWith("#")) continue;

		const indented = /^\s/.test(raw);
		if (!indented && trimmed === "data:") {
			if (inData) throw new ChartSpecError("»data:« angavs två gånger", lineNo);
			inData = true;
			continue;
		}

		const colon = trimmed.indexOf(":");
		if (colon === -1) {
			throw new ChartSpecError(`»${trimmed}« saknar kolon — varje rad är »nyckel: värde«`, lineNo);
		}
		const key = trimmed.slice(0, colon).trim();
		const value = trimmed.slice(colon + 1).trim();

		if (inData && indented) {
			if (key === "") throw new ChartSpecError("etiketten är tom", lineNo);
			rows.push({ label: key, raw: value, line: lineNo });
			continue;
		}
		if (inData) {
			throw new ChartSpecError(
				`»${key}« står i vänsterkanten men efter »data:« — datarader ska vara indragna`,
				lineNo,
			);
		}
		if (!SCALAR_KEYS.has(key)) {
			throw new ChartSpecError(
				`okänd nyckel »${key}« (tillåtna: ${[...SCALAR_KEYS].sort().join(", ")}, data)`,
				lineNo,
			);
		}
		if (scalars.has(key)) throw new ChartSpecError(`»${key}« angavs två gånger`, lineNo);
		scalars.set(key, value);
	}

	return { scalars, rows };
}

/** Pass two: the rules that decide whether this chart may exist at all. */
function checkForm(type: ChartType, series: string[], data: ChartDatum[]): void {
	if (series.length > 2) {
		// Brass and muted are the only two data colours this site has (DESIGN.md: four
		// colours maximum, brass earns its place by encoding something). A third series
		// would need a third hue, and the answer to that is small multiples.
		throw new ChartSpecError(
			`${series.length} serier — högst 2 ryms i mässing och dämpat. Dela upp i flera diagram`,
			1,
		);
	}
	if (type === "bars" && series.length !== 1) {
		throw new ChartSpecError(
			"bars tar en serie — jämför kategorier, inte kategorier gånger serier",
			1,
		);
	}
	if (type === "slope") {
		if (data.length < 2) throw new ChartSpecError("slope kräver minst två kategorier", 1);
		if (series.length !== 2) {
			throw new ChartSpecError("slope kräver två serier — de två tidpunkterna", 1);
		}
	}
	if (type === "stack") {
		if (series.length !== 1) throw new ChartSpecError("stack tar en serie", 1);
		const negative = data.find((d) => (d.values[0] ?? 0) < 0);
		if (negative) {
			throw new ChartSpecError(
				`»${negative.label}« är negativt — delar av en helhet kan inte vara det`,
				1,
			);
		}
	}
}

function requireType(scalars: Map<string, string>, lines: string[]): ChartType {
	const raw = scalars.get("type");
	if (!raw) throw new ChartSpecError("»type:« saknas", 1);
	if (!(CHART_TYPES as readonly string[]).includes(raw)) {
		throw new ChartSpecError(
			`okänd typ »${raw}« (tillåtna: ${CHART_TYPES.join(", ")})`,
			lines.findIndex((l) => l.trim().startsWith("type:")) + 1,
		);
	}
	return raw as ChartType;
}

export function parseChartSpec(source: string): ChartSpec {
	const lines = dedent(source).split("\n");
	const { scalars, rows } = tokenize(lines);

	const type = requireType(scalars, lines);

	const sourceText = scalars.get("source");
	if (!sourceText) {
		// Not a formatting nicety. An unsourced number on a site that ranks is the defect
		// scripts/check-source-urls.py exists to block; a chart must clear the same bar.
		throw new ChartSpecError("»source:« saknas — ett diagram utan källa publiceras inte", 1);
	}
	if (rows.length === 0) throw new ChartSpecError("»data:« saknas eller är tomt", 1);

	const seriesRaw = scalars.get("series");
	const series = seriesRaw ? cells(seriesRaw) : [""];

	const data: ChartDatum[] = rows.map((row) => {
		const values = cells(row.raw).map((c) => parseNumber(c, row.line));
		if (values.length !== series.length) {
			throw new ChartSpecError(
				`»${row.label}« har ${values.length} värden men ${series.length} serier deklarerades`,
				row.line,
			);
		}
		return { label: row.label, values };
	});

	checkForm(type, series, data);

	// Built field by field rather than with conditional spreads: `exactOptionalPropertyTypes`
	// is on, so `...(x ? { k: x } : {})` still widens k to `string | undefined`.
	const spec: ChartSpec = { type, data, series, source: sourceText };
	const sourceUrl = scalars.get("sourceUrl");
	if (sourceUrl) spec.sourceUrl = sourceUrl;
	const unit = scalars.get("unit");
	if (unit) spec.unit = unit;
	const note = scalars.get("note");
	if (note) spec.note = note;
	const caption = scalars.get("caption");
	if (caption) spec.caption = caption;
	const emphasis = scalars.get("emphasis");
	if (emphasis) spec.emphasis = emphasis;
	const alt = scalars.get("alt");
	if (alt) spec.alt = alt;
	const maxRaw = scalars.get("max");
	if (maxRaw) spec.max = parseNumber(maxRaw, 1);

	if (spec.emphasis && !data.some((d) => d.label === spec.emphasis)) {
		throw new ChartSpecError(
			`emphasis »${spec.emphasis}« finns inte bland etiketterna`,
			lines.findIndex((l) => l.trim().startsWith("emphasis:")) + 1,
		);
	}

	return spec;
}
