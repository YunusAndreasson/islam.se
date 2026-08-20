/**
 * Swedish number rendering for chart labels, captions and alt text.
 *
 * `Intl.NumberFormat("sv-SE")` already does the house thing: U+00A0 between thousands
 * (196 000, never 196,000) and a decimal comma (12,5). It also puts a non-breaking space
 * before the percent sign, which is the Swedish convention and the one the corpus uses.
 * So this file is thin on purpose — it picks sensible precision and gets out of the way.
 *
 * ⚠️ Every numeral these produce ends up inside an SVG <text> or an HTML span that sets
 * `font-variant-numeric: lining-nums tabular-nums`. The body default is oldstyle-nums
 * (typography.css), which is right for prose and wrong for a column of figures: oldstyle
 * digits have varying heights and widths, so a stack of values will not align.
 */

const PLAIN = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });
const ONE_DECIMAL = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 });
const TWO_DECIMALS = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 2 });

/**
 * Precision follows magnitude, the way a writer would choose it: thousands are read as
 * whole numbers, a value under ten carries its decimals because that is where they mean
 * something. Explicit decimals in the source are respected up to two places — an author
 * who wrote `12,5` gets 12,5, not 13.
 */
export function formatNumber(value: number, decimals?: number): string {
	if (!Number.isFinite(value)) return "–";
	if (decimals !== undefined) {
		return new Intl.NumberFormat("sv-SE", {
			minimumFractionDigits: decimals,
			maximumFractionDigits: decimals,
		}).format(value);
	}
	const magnitude = Math.abs(value);
	if (Number.isInteger(value)) return PLAIN.format(value);
	if (magnitude >= 100) return PLAIN.format(value);
	if (magnitude >= 10) return ONE_DECIMAL.format(value);
	return TWO_DECIMALS.format(value);
}

/**
 * How many decimals a whole chart should use — the most any single value needs, capped at
 * two.
 *
 * ⚠️ WITHOUT THIS, ONE CHART PRINTS FOUR DIFFERENT PRECISIONS. formatNumber() decides per
 * value: integers get none, ≥10 gets one, below that two. The WHO alcohol chart therefore
 * rendered 12,01 as **12**, beside 8,99, 0,1 and 0. The first of those is not a formatting
 * quibble — it drops a digit the source publishes, on a page that cites the source. A
 * column of figures is read down, and it has to be read at one precision.
 */
export function seriesDecimals(values: number[]): number {
	let needed = 0;
	for (const v of values) {
		if (!Number.isFinite(v)) continue;
		// Compare against successively coarser rounding rather than parsing the float's
		// text, which would turn 8.99 into 8.990000000000001 on some inputs.
		if (Math.abs(v - Math.round(v)) > 1e-9) {
			needed = Math.max(needed, Math.abs(v * 10 - Math.round(v * 10)) > 1e-9 ? 2 : 1);
		}
	}
	return needed;
}

/**
 * A value with its unit, as it appears at the end of a bar. "procent" and "%" both render
 * as the symbol with a non-breaking space, because that is what fits beside a bar; the
 * caption carries the spelled-out unit instead.
 */
export function formatValue(value: number, unit?: string, decimals?: number): string {
	const number = formatNumber(value, decimals);
	if (!Number.isFinite(value)) return number;
	if (!unit) return number;
	const u = unit.trim().toLowerCase();
	if (u === "%" || u === "procent") return `${number}\u00A0%`;
	return `${number}\u00A0${unit.trim()}`;
}

/** A share of a whole, for `stack` segment labels and the alt text. */
export function formatShare(part: number, total: number): string {
	if (!(Number.isFinite(part) && total > 0)) return "–";
	return `${ONE_DECIMAL.format((part / total) * 100)}\u00A0%`;
}

/**
 * Joins a list the way Swedish prose does — "a, b och c" — for the generated alt text.
 * A chart's aria-label is read aloud as a sentence, so it needs the conjunction; a comma
 * before the last item would be an English habit the house style pass would strip anyway.
 */
export function joinSwedish(parts: string[]): string {
	if (parts.length === 0) return "";
	if (parts.length === 1) return parts[0] ?? "";
	return `${parts.slice(0, -1).join(", ")} och ${parts[parts.length - 1]}`;
}

/**
 * House punctuation for author-written chart text.
 *
 * Prose gets its guillemets from remark-smartypants — but that plugin skips `code` nodes,
 * and a chart spec IS a code node. Without this, an author obeying the house rule (write
 * straight quotes; the pipeline converts them) would get "…" in the caption while the
 * paragraph above it got »…«. The alternative — telling authors to type »…« inside the
 * fence — makes scripts/check-house-style.py flag the file, and rightly so: the rule is
 * that the SOURCE uses straight quotes everywhere.
 */
export function housePunctuation(text: string): string {
	return text.replace(/"([^"]*)"/g, "»$1«").replace(/(\w)'(\w)/g, "$1\u2019$2");
}
