/**
 * Page references and display text for OpenITI book passages.
 *
 * ⚠️ An OpenITI `PageV28P390` marker CLOSES page 390 of volume 28: the text before it
 * stands on that page. Verified against the print, not assumed: Ibn Taymiyya's
 * »ولاية أمر الناس من أعظم واجبات الدين« is cited as Majmūʿ al-fatāwā 28:390, and the
 * first marker after it in the text is PageV28P390; Ibn Ḥajar on the splitting of the
 * chest is Fatḥ al-Bārī 1:460 by the same rule; Ibn Khaldūn's title page ends with its
 * publisher line and then PageV01P001. Reading the marker BEFORE a passage as its page
 * — the obvious rule — puts every citation one page early.
 *
 * Passages are 800-character chunks with 200 characters of overlap, so a passage often
 * contains no marker at all. Its page is then the first marker in the passages that
 * follow it, and a marker only counts if it lies beyond this passage's own text
 * (positions, not marker values, decide that: some editions number pages
 * non-monotonically, and PageV00P000 marks an unnumbered page).
 */

export interface PageMarker {
	/** Offset of the marker in the text it was found in. */
	index: number;
	volume: number;
	page: number;
}

export interface PassagePages {
	/** Page where the passage's text begins, "volume:page" (e.g. "28:390"); null if unknown. */
	page: string | null;
	/** The span the passage covers: "28:390", "1:16–17" or "27:412–28:1"; null if unknown. */
	pages: string | null;
	/** Page of `matchOffset` when one was given (the text-mode hit); null if unknown. */
	matchPage?: string | null;
}

/** A passage as the resolver needs it: its text and absolute start in the book. */
export interface PassageSlice {
	text: string;
	startPosition: number;
}

const MARKER = /PageV(\d+)P(\d+)/g;

export function findPageMarkers(text: string): PageMarker[] {
	const markers: PageMarker[] = [];
	for (const m of text.matchAll(MARKER)) {
		markers.push({ index: m.index ?? 0, volume: Number(m[1]), page: Number(m[2]) });
	}
	return markers;
}

/** PageV00P000 (and any P000) marks an unnumbered page: it says a page ended, not which. */
function isNumbered(marker: PageMarker): boolean {
	return marker.page > 0;
}

export function formatPageRef(marker: { volume: number; page: number }): string {
	return `${marker.volume}:${marker.page}`;
}

export function formatPageSpan(
	start: { volume: number; page: number },
	end: { volume: number; page: number },
): string {
	if (start.volume === end.volume && start.page === end.page) return formatPageRef(start);
	if (start.volume === end.volume) return `${formatPageRef(start)}–${end.page}`;
	return `${formatPageRef(start)}–${formatPageRef(end)}`;
}

/** Characters that are layout, not text: whitespace and OpenITI line/paragraph markup. */
const LAYOUT = /[\s#~|]/;

/**
 * First and last offsets of real text, skipping layout and page markers at either end.
 * A marker at the very start of a passage closes the PREVIOUS page, so it must not be
 * read as the page the passage's text is on.
 */
function contentBounds(text: string): { start: number; end: number } {
	const masked = text.replace(/PageV\d+P\d+/g, (m) => " ".repeat(m.length));
	let start = 0;
	while (start < masked.length && LAYOUT.test(masked.charAt(start))) start++;
	let end = masked.length - 1;
	while (end >= start && LAYOUT.test(masked.charAt(end))) end--;
	return { start, end };
}

/**
 * Resolve the page(s) of a passage.
 *
 * @param current   the passage itself
 * @param following the passages after it in the same book, in order (read lazily; only
 *                  consulted when the passage has no marker after the offset in question)
 * @param matchOffset optional offset into `current.text` — the text-mode hit — whose page
 *                  is reported as `matchPage`
 */
export function resolvePassagePages(
	current: PassageSlice,
	following: () => PassageSlice[],
	matchOffset?: number,
): PassagePages {
	const markers = findPageMarkers(current.text);
	const { start, end } = contentBounds(current.text);
	if (start > end)
		return { page: null, pages: null, matchPage: matchOffset === undefined ? undefined : null };

	let ahead: PassageSlice[] | null = null;
	const pageAt = (offset: number): PageMarker | null => {
		const here = markers.find((m) => m.index >= offset);
		if (here) return here;
		ahead ??= following();
		// Absolute position of `offset`; a marker in a later passage only counts if it lies
		// beyond it (the overlap repeats this passage's tail at the head of the next one).
		const absolute = current.startPosition + offset;
		for (const next of ahead) {
			for (const m of findPageMarkers(next.text)) {
				if (next.startPosition + m.index > absolute) return m;
			}
		}
		return null;
	};

	const first = pageAt(start);
	// At the end of a book there may be no marker after the last words; the span then
	// runs to the last marker inside the passage, which is at least where it reaches.
	const last = pageAt(end) ?? markers.at(-1) ?? null;
	const page = first && isNumbered(first) ? formatPageRef(first) : null;
	const pages = page && first && last && isNumbered(last) ? formatPageSpan(first, last) : page;

	const result: PassagePages = { page, pages };
	if (matchOffset !== undefined) {
		const hit = pageAt(Math.max(matchOffset, start));
		result.matchPage = hit && isNumbered(hit) ? formatPageRef(hit) : null;
	}
	return result;
}

// ============================================================================
// Display text
// ============================================================================

const OPENITI_HINT = /PageV\d+P\d+|(^|\n)(~~|# |###)|#META#|\bms\d+\b/;

/**
 * OpenITI mARkdown → readable text, for display. The database keeps the raw text (the
 * page markers live there); this is what a caller should read and quote.
 *
 * - `#META#` header lines (the first passages of every book) are dropped;
 * - `PageV##P###` page markers and `ms###` milestones are removed;
 * - `~~` continuation lines are joined to the line they continue;
 * - `# ` paragraph starts become line breaks; `### | …` / `### || …` headings keep their
 *   text on a line of their own (»فصل: "في بيان حكم الخلافة"«);
 * - `@QB@`/`@QE@` Qur'an brackets are dropped, `%~%` hemistich breaks become » * «.
 *
 * Non-OpenITI text (the Swedish and English books) is returned trimmed and otherwise
 * untouched.
 */
export function cleanPassageText(raw: string): string {
	if (!OPENITI_HINT.test(raw)) return raw.trim();

	const out: string[] = [];
	const append = (fragment: string) => {
		if (!fragment) return;
		if (out.length > 0) out[out.length - 1] = `${out[out.length - 1]} ${fragment}`;
		else out.push(fragment);
	};

	for (const rawLine of raw.split("\n")) {
		// A header line — or the tail of one, when the passage starts mid-header.
		if (/^#META#|^######OpenITI#|\t:: /.test(rawLine)) continue;
		const line = rawLine
			.replace(/PageV\d+P\d+/g, " ")
			.replace(/\bms\d+\b/g, " ")
			.replace(/@Q[BE]@/g, "")
			.replace(/%~%/g, " * ");

		if (line.startsWith("~~")) {
			append(line.slice(2).trim());
			continue;
		}
		const heading = /^#{2,}\s*\|*\s*(.*)$/.exec(line);
		if (heading) {
			const text = (heading[1] ?? "").replace(/^\$+\s*/, "").trim();
			if (text) out.push(text);
			continue;
		}
		const paragraph = /^#\s*(.*)$/.exec(line);
		if (paragraph) {
			const text = (paragraph[1] ?? "")
				.replace(/^\$+\s*/, "")
				.replace(/^\|+\s*/, "")
				.trim();
			if (text) out.push(text);
			continue;
		}
		const text = line.trim();
		if (text) out.push(text);
	}

	return out
		.map((l) => l.replace(/\s+/g, " ").trim())
		.filter(Boolean)
		.join("\n");
}
