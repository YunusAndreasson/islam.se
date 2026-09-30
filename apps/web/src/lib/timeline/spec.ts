/**
 * The ```timeline fence: grammar and parser.
 *
 * The third sibling of ```chart and ```table, and deliberately the same line grammar:
 *
 *     ```timeline
 *     source: Simon Sorgenfrei, Islam i Sverige - de första 1300 åren
 *     caption: Från de första kontakterna till i dag.
 *     emphasis: 1949
 *     data:
 *       ca 870: Spillingeskatten läggs i jorden på Gotland.
 *       1523: Gustav Vasa kröns till kung.
 *       1949: Landets första muslimska förening bildas i Stockholm.
 *     ```
 *
 * WHY A THIRD FORM AND NOT A TABLE WITH TWO COLUMNS. A two-column table says that year
 * and event are two comparable fields. A chronology says something a table cannot: that
 * the events are unevenly distributed in time. On this site's oldest subject the whole
 * point is the unevenness — seven centuries of silence, then everything inside one
 * lifetime — and a table renders those two facts as the same row height.
 *
 * WHY THE SPACING IS COMPRESSED. `scale: time` sets the gap between two entries from the
 * square root of the years between them, not from the years themselves. Linear spacing
 * over a 1 200-year span puts nine tenths of the entries in the last tenth of the rail,
 * where they overlap and stop being readable; even spacing throws the information away
 * altogether. The square root keeps the shape of the distribution while keeping every
 * entry legible, and the caption has to say so — `timelineCaptionText()` appends the
 * disclosure automatically, because a reader who measures the gaps must not be misled.
 */
import { dedent, type FigureRow, tokenize } from "../figure/tokenize";

/** How the gap between two entries is decided. */
export const TIMELINE_SCALES = ["time", "even"] as const;
export type TimelineScale = (typeof TIMELINE_SCALES)[number];

export interface TimelineEntry {
	/** As the author wrote it: "ca 870", "1036-1041", "1949". */
	label: string;
	text: string;
	/**
	 * When the label happened, as a fractional year, for ordering and spacing:
	 * "1949" → 1949, "december 2023" → 2023.92, "26 januari 2024" → 2024.07. NaN when
	 * the label carries no year at all — such an entry is simply placed at the minimum
	 * gap rather than refused, so a chronology may end on "i dag".
	 */
	year: number;
}

export interface TimelineSpec {
	entries: TimelineEntry[];
	/** Required. The chronology says where it comes from or it does not ship. */
	source: string;
	sourceUrl?: string;
	/** Replaces the caption's lead sentence. Source and note are always appended. */
	caption?: string;
	/** The honest caveat: what this chronology CANNOT say. */
	note?: string;
	/** One entry label kept brass while the rest go muted — the one-vs-rest form. */
	emphasis?: string;
	/** Overrides the generated aria-label. Write a full Swedish sentence. */
	alt?: string;
	/** Defaults to "time". */
	scale: TimelineScale;
}

export class TimelineSpecError extends Error {
	readonly line: number;
	constructor(message: string, line: number) {
		super(`rad ${line}: ${message}`);
		this.name = "TimelineSpecError";
		this.line = line;
	}
}

const SCALAR_KEYS = new Set(["source", "sourceUrl", "caption", "note", "emphasis", "alt", "scale"]);

/**
 * A reading limit, not a technical one. Past two dozen entries the rail runs several
 * phone screens and the reader loses the shape that is the form's whole reason to exist,
 * at which point the chronology wants splitting by era or writing as prose.
 */
const MAX_ENTRIES = 24;

/** The first 3- or 4-digit year in a label. "ca 870" → 870, "1036-1041" → 1036. */
export function leadYear(label: string): number {
	const match = label.match(/\d{3,4}/);
	return match ? Number(match[0]) : Number.NaN;
}

const MONTHS = [
	"januari",
	"februari",
	"mars",
	"april",
	"maj",
	"juni",
	"juli",
	"augusti",
	"september",
	"oktober",
	"november",
	"december",
];
const MONTH_DATE = new RegExp(`(?:\\b(\\d{1,2})\\s+)?\\b(${MONTHS.join("|")})\\s+(\\d{3,4})`, "i");

/**
 * The label's point in time as a fractional year. A Swedish month (and day) directly
 * before the year places it inside that year; otherwise it is `leadYear()`.
 *
 * ⚠️ Without the month, "december 2023" and "januari 2024" sat a whole year apart and
 * four entries inside 2025 collapsed onto one point — so a chronology of months could
 * only be drawn `scale: even`, which discards the spacing that is the form's reason to
 * exist.
 */
export function labelTime(label: string): number {
	const match = label.match(MONTH_DATE);
	if (!match) return leadYear(label);
	const month = MONTHS.indexOf((match[2] ?? "").toLowerCase());
	const day = match[1] ? Number(match[1]) : 1;
	return Number(match[3]) + (month + (day - 1) / 31) / 12;
}

/** Pass two: the rules that decide whether this chronology may exist at all. */
function checkForm(entries: TimelineEntry[]): void {
	if (entries.length < 3) {
		// Two dated events are a sentence with a comma in it. The prose says it better.
		throw new TimelineSpecError(
			"en tidslinje med färre än tre punkter är en mening – skriv den i prosan",
			1,
		);
	}
	if (entries.length > MAX_ENTRIES) {
		throw new TimelineSpecError(
			`${entries.length} punkter – högst ${MAX_ENTRIES} går att läsa på en telefon. Dela upp tidslinjen`,
			1,
		);
	}
	const dated = entries.filter((e) => Number.isFinite(e.year));
	if (dated.length < 2) {
		throw new TimelineSpecError(
			"minst två punkter måste bära ett årtal – annars är det en lista och inte en tidslinje",
			1,
		);
	}
	for (let i = 1; i < dated.length; i++) {
		const prev = dated[i - 1];
		const cur = dated[i];
		if (prev && cur && cur.year < prev.year) {
			// Out of order is nearly always a typo, and a chronology that runs backwards
			// mid-rail is read as a data error by everyone who notices it.
			throw new TimelineSpecError(
				`»${cur.label}« kommer före »${prev.label}« – punkterna ska stå i kronologisk ordning`,
				1,
			);
		}
	}
}

export function parseTimelineSpec(source: string): TimelineSpec {
	const lines = dedent(source).split("\n");
	const { scalars, rows } = tokenize(lines, SCALAR_KEYS, TimelineSpecError);

	const sourceText = scalars.get("source");
	if (!sourceText) {
		// Same bar as a chart, a table and scripts/check-source-urls.py.
		throw new TimelineSpecError("»source:« saknas – en tidslinje utan källa publiceras inte", 1);
	}
	if (rows.length === 0) throw new TimelineSpecError("»data:« saknas eller är tomt", 1);

	const entries: TimelineEntry[] = rows.map((row: FigureRow) => {
		if (row.raw.trim() === "") {
			throw new TimelineSpecError(`»${row.label}« saknar händelse`, row.line);
		}
		return { label: row.label, text: row.raw.trim(), year: labelTime(row.label) };
	});

	checkForm(entries);

	const scaleRaw = scalars.get("scale");
	if (scaleRaw && !TIMELINE_SCALES.includes(scaleRaw as TimelineScale)) {
		throw new TimelineSpecError(
			`okänd scale »${scaleRaw}« (tillåtna: ${TIMELINE_SCALES.join(", ")})`,
			lines.findIndex((l) => l.trim().startsWith("scale:")) + 1,
		);
	}

	// Field by field rather than conditional spreads: `exactOptionalPropertyTypes` is on,
	// so `...(x ? { k: x } : {})` still widens k to `string | undefined`.
	const spec: TimelineSpec = {
		entries,
		source: sourceText,
		scale: (scaleRaw as TimelineScale) ?? "time",
	};
	const sourceUrl = scalars.get("sourceUrl");
	if (sourceUrl) spec.sourceUrl = sourceUrl;
	const caption = scalars.get("caption");
	if (caption) spec.caption = caption;
	const note = scalars.get("note");
	if (note) spec.note = note;
	const alt = scalars.get("alt");
	if (alt) spec.alt = alt;
	const emphasis = scalars.get("emphasis");
	if (emphasis) spec.emphasis = emphasis;

	if (spec.emphasis && !entries.some((e) => e.label === spec.emphasis)) {
		throw new TimelineSpecError(
			`emphasis »${spec.emphasis}« finns inte bland årtalen`,
			lines.findIndex((l) => l.trim().startsWith("emphasis:")) + 1,
		);
	}

	return spec;
}
