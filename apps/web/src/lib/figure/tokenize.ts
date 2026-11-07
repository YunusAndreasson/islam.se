/**
 * The shared fence grammar behind ```chart and ```table.
 *
 * Both fences are the same small line format — left-flush `nyckel: värde` scalars, then
 * indented rows under `data:`, cells split on `|`. Only the allowed key set and the error
 * class differ, so those are parameters and everything else lives here once.
 *
 *     type: bars                 ← scalar, left flush
 *     source: SCB, 2024          ← only the FIRST colon splits, so "Science Advances 2:6"
 *     data:                        survives in a source string
 *       Syrien: 196000 | 12,5    ← row, indented; cells split on |
 *
 * Indentation is load-bearing: it is the only thing that tells a scalar from a data row.
 * That is why dedent() runs first — see its own note.
 *
 * ⚠️ The message strings here are asserted verbatim by chart.test.ts across six refusal
 * cases. Reword one and the test fails, which is the intended alarm: these strings are
 * what an author sees in a failed build, and they carry the line number that makes the
 * fix obvious from the log alone.
 */

/** Anything that can be thrown with (message, line). Lets each fence keep its own class
 *  name, so `error instanceof ChartSpecError` in rehype-chart.ts keeps working. */
export type SpecErrorCtor = new (message: string, line: number) => Error;

export interface FigureRow {
	label: string;
	/** The right-hand side, unsplit — the caller decides whether cells are numbers or text. */
	raw: string;
	line: number;
}

export interface FigureTokens {
	scalars: Map<string, string>;
	rows: FigureRow[];
}

/**
 * Strips the common leading whitespace, keeping relative indentation intact.
 *
 * A fence in markdown arrives flush left and this is a no-op. A `spec` passed to
 * A spec passed as a template literal arrives indented by its surrounding code — and
 * since the grammar tells a scalar from a data row BY indentation, without this every
 * line would read as a data row and nothing would parse.
 */
export function dedent(source: string): string {
	const lines = source.split("\n");
	const indents = lines.filter((l) => l.trim() !== "").map((l) => l.length - l.trimStart().length);
	const common = indents.length > 0 ? Math.min(...indents) : 0;
	if (common === 0) return source;
	return lines.map((l) => (l.trim() === "" ? l : l.slice(common))).join("\n");
}

/** Pass one: turn lines into scalars and data rows. Shape only — no meaning yet. */
export function tokenize(
	lines: string[],
	allowedKeys: ReadonlySet<string>,
	Err: SpecErrorCtor,
): FigureTokens {
	const scalars = new Map<string, string>();
	const rows: FigureRow[] = [];
	let inData = false;

	for (let i = 0; i < lines.length; i++) {
		const raw = lines[i] ?? "";
		const lineNo = i + 1;
		const trimmed = raw.trim();
		if (trimmed === "" || trimmed.startsWith("#")) continue;

		const indented = /^\s/.test(raw);
		if (!indented && trimmed === "data:") {
			if (inData) throw new Err("»data:« angavs två gånger", lineNo);
			inData = true;
			continue;
		}

		const colon = trimmed.indexOf(":");
		if (colon === -1) {
			throw new Err(`»${trimmed}« saknar kolon — varje rad är »nyckel: värde«`, lineNo);
		}
		const key = trimmed.slice(0, colon).trim();
		const value = trimmed.slice(colon + 1).trim();

		if (inData && indented) {
			if (key === "") throw new Err("etiketten är tom", lineNo);
			rows.push({ label: key, raw: value, line: lineNo });
			continue;
		}
		if (inData) {
			throw new Err(
				`»${key}« står i vänsterkanten men efter »data:« — datarader ska vara indragna`,
				lineNo,
			);
		}
		if (!allowedKeys.has(key)) {
			throw new Err(
				`okänd nyckel »${key}« (tillåtna: ${[...allowedKeys].sort().join(", ")}, data)`,
				lineNo,
			);
		}
		if (scalars.has(key)) throw new Err(`»${key}« angavs två gånger`, lineNo);
		scalars.set(key, value);
	}

	return { scalars, rows };
}

/** Splits a `a | b | c` row into trimmed cells. */
export function cells(raw: string): string[] {
	return raw.split("|").map((c) => c.trim());
}

/**
 * Swedish number literals, as an author actually writes them: `196000`, `196 000`
 * (space or non-breaking space as the thousands separator), `12,5` (decimal comma),
 * and `12.5` for anyone who slips into the English habit. A bare `-` means "no value"
 * and yields NaN, which the renderers skip rather than plot as zero — a missing year in
 * a series is a gap, not a collapse to nothing.
 */
export function parseSwedishNumber(raw: string, line: number, Err: SpecErrorCtor): number {
	const text = raw.trim();
	if (text === "" || text === "-" || text === "–") return Number.NaN;
	// ⚠️ Escapes, never the literal characters. Written with a literal U+00A0/U+202F in the
	// class, a formatter pass rewrote it to [\s {2}] — a class containing the character «2»,
	// which silently stripped that digit from every value: 12,5 parsed as 1,5 and 328 as 38.
	// The build stayed green; only chart.test.ts caught it.
	const cleaned = text
		.replace(/[\s\u00A0\u202F]/g, "")
		.replace(/%$/, "")
		.replace(",", ".");
	const value = Number(cleaned);
	if (!Number.isFinite(value)) {
		throw new Err(`»${text}« är inte ett tal`, line);
	}
	return value;
}

/**
 * True when a cell reads as a Swedish number — used by the table renderer to decide which
 * columns get tabular figures, and by the pipeline's provenance check to decide which
 * cells must trace back to a vetted source. Deliberately NOT `!isNaN(parse(...))`: a bare
 * dash parses to NaN and must not count as numeric, and a label like "2024" must.
 */
export function looksNumeric(cell: string): boolean {
	const text = cell.trim();
	if (text === "" || text === "-" || text === "–") return false;
	const cleaned = text
		.replace(/[\s\u00A0\u202F]/g, "")
		.replace(/%$/, "")
		.replace(",", ".");
	return cleaned !== "" && Number.isFinite(Number(cleaned));
}
