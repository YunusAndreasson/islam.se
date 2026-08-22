/**
 * rehype-table: turn a ```table fence into a real figure at build time.
 *
 * WHY A FENCE AND NOT A GFM PIPE TABLE. remark-gfm is on, so a pipe table would parse and
 * emit <table> today. It would also be unsourced — there is nowhere in that syntax to put
 * the source, so no checker can require one, and a table is exactly as authoritative to a
 * reader as a chart is. It would additionally be read as prose by check-house-style.py
 * (every cell linted as a sentence), be dropped in silence by generate-pdf.ts, and carry no
 * caption or caveat. The fence buys all of that back for the cost of a parser.
 *
 * The traversal lives in rehype-fence.ts, shared with the ```chart fence — including the
 * two warnings that matter (Shiki's excludeLangs, and the content cache).
 */
import { buildTableHast } from "../lib/table/render";
import { parseTableSpec, type TableSpec, TableSpecError } from "../lib/table/spec";
import { rehypeFence } from "./rehype-fence";

export const rehypeTable = rehypeFence<TableSpec>({
	lang: "table",
	parse: parseTableSpec,
	build: buildTableHast,
	isSpecError: (error): error is TableSpecError => error instanceof TableSpecError,
});
