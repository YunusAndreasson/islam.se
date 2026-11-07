/**
 * The ```table fence: grammar and parser.
 *
 * A sibling of the ```chart fence and deliberately the same line grammar, so an author who
 * can write one can write the other:
 *
 *     ```table
 *     source: SCB, Befolkningsstatistik 2025
 *     caption: Utrikes födda från de fem största ursprungsländerna.
 *     note: Födelseland, inte trosbekännelse.
 *     columns: Land | Antal | Andel
 *     data:
 *       Syrien: 196 000 | 1,8
 *       Irak: 146 000 | 1,4
 *     ```
 *
 * WHY A FENCE AND NOT A GFM PIPE TABLE. A pipe table cannot carry a source, so nothing can
 * gate it — and a table is exactly as authoritative to a reader as a bar is. The corpus had
 * no table at all before this, so there was no legacy to preserve and no reason to adopt a
 * form the checkers cannot see. It also keeps the cells out of prose: check-house-style.py
 * reads a pipe row as a sentence and lints it as one.
 *
 * WHAT A TABLE IS FOR, AS AGAINST A CHART. A chart compares magnitudes; a table compares
 * things that are not magnitudes at all — positions, rulings, steps, definitions. Cells are
 * therefore strings, and only the cells that happen to look numeric get tabular figures.
 */
import { cells, dedent, type FigureRow, tokenize } from "../figure/tokenize";

interface TableRow {
	label: string;
	/** One entry per column after the first. Strings — a table cell may be prose. */
	cells: string[];
}

export interface TableSpec {
	/** The full header row. The first entry heads the label column. */
	columns: string[];
	rows: TableRow[];
	/** Required. The table says where it comes from or it does not ship. */
	source: string;
	sourceUrl?: string;
	/** Replaces the caption's lead sentence. Source and note are always appended. */
	caption?: string;
	/** The honest caveat: what this table CANNOT say. */
	note?: string;
	/** One row label kept brass while the rest go muted — the one-vs-rest form. */
	emphasis?: string;
	/** Overrides the generated aria-label. Write a full Swedish sentence. */
	alt?: string;
}

export class TableSpecError extends Error {
	readonly line: number;
	constructor(message: string, line: number) {
		super(`rad ${line}: ${message}`);
		this.name = "TableSpecError";
		this.line = line;
	}
}

const SCALAR_KEYS = new Set([
	"source",
	"sourceUrl",
	"caption",
	"note",
	"emphasis",
	"alt",
	"columns",
]);

/**
 * Five columns, and the limit is the phone rather than taste. DESIGN.md sets the reading
 * column and the rubric asks whether the figure reads at 375 px; past five columns a table
 * either scrolls sideways or sets its cells too small to read. A sixth column is the signal
 * that the table is doing two jobs — split it.
 */
const MAX_COLUMNS = 5;

/** Pass two: the rules that decide whether this table may exist at all. */
function checkForm(columns: string[], rows: TableRow[]): void {
	if (columns.length < 2) {
		throw new TableSpecError("en tabell behöver minst två kolumner — annars är den en lista", 1);
	}
	if (columns.length > MAX_COLUMNS) {
		throw new TableSpecError(
			`${columns.length} kolumner — högst ${MAX_COLUMNS} ryms på en telefon. Dela upp tabellen`,
			1,
		);
	}
	if (rows.length < 2) {
		// One row is a sentence that has been drawn a box around. The prose says it better.
		throw new TableSpecError("en tabell med en enda rad är en mening — skriv den i prosan", 1);
	}
}

export function parseTableSpec(source: string): TableSpec {
	const lines = dedent(source).split("\n");
	const { scalars, rows: rawRows } = tokenize(lines, SCALAR_KEYS, TableSpecError);

	const sourceText = scalars.get("source");
	if (!sourceText) {
		// Same bar as a chart and as scripts/check-source-urls.py: an unsourced figure on a
		// site that ranks is the defect those gates exist to block.
		throw new TableSpecError("»source:« saknas — en tabell utan källa publiceras inte", 1);
	}

	const columnsRaw = scalars.get("columns");
	if (!columnsRaw) {
		throw new TableSpecError("»columns:« saknas — en tabell behöver kolumnrubriker", 1);
	}
	const columns = cells(columnsRaw);

	if (rawRows.length === 0) throw new TableSpecError("»data:« saknas eller är tomt", 1);

	const rows: TableRow[] = rawRows.map((row: FigureRow) => {
		const values = cells(row.raw);
		if (values.length !== columns.length - 1) {
			throw new TableSpecError(
				`»${row.label}« har ${values.length} celler men ${columns.length - 1} deklarerades i columns:`,
				row.line,
			);
		}
		return { label: row.label, cells: values };
	});

	checkForm(columns, rows);

	// Field by field rather than conditional spreads: `exactOptionalPropertyTypes` is on, so
	// `...(x ? { k: x } : {})` still widens k to `string | undefined`.
	const spec: TableSpec = { columns, rows, source: sourceText };
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

	if (spec.emphasis && !rows.some((r) => r.label === spec.emphasis)) {
		throw new TableSpecError(
			`emphasis »${spec.emphasis}« finns inte bland radetiketterna`,
			lines.findIndex((l) => l.trim().startsWith("emphasis:")) + 1,
		);
	}

	return spec;
}
