/**
 * Book lookup by title/author, and page references for stored passages. Kept apart from
 * search.ts so it can be used (and tested) without loading the embedding model.
 */

import type Database from "better-sqlite3";
import { initBookDatabase, ROMANIZED_ARABIC_AUTHORS } from "./database.js";
import {
	cleanPassageText,
	type PassagePages,
	type PassageSlice,
	resolvePassagePages,
	stitchPassages,
} from "./pages.js";

/**
 * Fold a name for matching: diacritics, ʿ/ʾ and apostrophes, Arabic article prefixes
 * (al-/an-/ar-/as-/at-/…), case and everything that is not a letter or digit go.
 * »al-Aḥkām al-sulṭāniyya« and »AhkamSultaniyya« fold to the same string, and in Arabic
 * script hamza seats fold together (أ/إ/آ → ا).
 */
export function foldName(name: string): string {
	return name
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.replace(/[ʿʾʻʼ'`’‘´]/g, "")
		.toLowerCase()
		.replace(/(^|[\s\-_.,(])(?:al|an|ar|as|at|ad|az|ash|ath|adh|el)[-\s]/g, "$1")
		.replace(/[^\p{L}\p{N}]/gu, "");
}

/** Author and title segments of an OpenITI URI in a source URL (0450AbuHasanMawardi.AhkamSultaniyya). */
function openItiUri(sourceUrl: string): { author: string; title: string } | null {
	const m = /\/\d{4}([A-Za-z]+)\.([A-Za-z]+)\//.exec(sourceUrl);
	return m ? { author: m[1] ?? "", title: m[2] ?? "" } : null;
}

export interface BookRef {
	id: number;
	title: string;
	author: string;
	language: string;
}

/**
 * Books whose title (or OpenITI title URI) contains `book`, and whose author (or OpenITI
 * author URI, or the romanized form of an Arabic-script author) contains `author` —
 * case-, diacritic- and article-insensitive. Either filter may be omitted.
 */
export function findBooks(
	filter: { book?: string; author?: string },
	db?: Database.Database,
): BookRef[] {
	const database = db ?? initBookDatabase();
	const rows = database
		.prepare("SELECT id, title, author, language, source_url as sourceUrl FROM books ORDER BY id")
		.all() as (BookRef & { sourceUrl: string })[];

	const bookQ = filter.book ? foldName(filter.book) : "";
	const authorQ = filter.author ? foldName(filter.author) : "";
	const romanizedFor = new Map<string, string[]>();
	for (const [roman, arabic] of Object.entries(ROMANIZED_ARABIC_AUTHORS)) {
		romanizedFor.set(arabic, [...(romanizedFor.get(arabic) ?? []), roman]);
	}

	return rows
		.filter((row) => {
			const uri = openItiUri(row.sourceUrl);
			if (bookQ) {
				const titles = [row.title, uri?.title ?? ""].map(foldName);
				if (!titles.some((t) => t.includes(bookQ))) return false;
			}
			if (authorQ) {
				const names = [row.author, uri?.author ?? "", ...(romanizedFor.get(row.author) ?? [])].map(
					foldName,
				);
				if (!names.some((n) => n.includes(authorQ))) return false;
			}
			return true;
		})
		.map(({ id, title, author, language }) => ({ id, title, author, language }));
}

const ARABIC_BY_ROMANIZED = new Map(
	Object.entries(ROMANIZED_ARABIC_AUTHORS).map(([roman, arabic]) => [
		foldName(roman).replace(/h$/, ""),
		arabic,
	]),
);

/**
 * One key per author, whatever the spelling. The same author is stored in Arabic script on
 * some books and romanised on others (»ابن القيم« on seven, »Ibn al-Qayyim« on three), and a
 * per-author cap keyed on the raw string counted them as two authors.
 */
export function authorKey(author: string): string {
	const arabic = ARABIC_BY_ROMANIZED.get(foldName(author).replace(/h$/, ""));
	return foldName(arabic ?? author);
}

const FOLLOWING_PASSAGES = 12;

/** Page(s) of a passage, reading ahead in the same book when it holds no page marker. */
export function getPassagePages(
	passage: { id: number; bookId: number; text: string; startPosition: number },
	matchOffset?: number,
	db?: Database.Database,
): PassagePages {
	const database = db ?? initBookDatabase();
	// Passages of one book are inserted in order, so ids are consecutive within a book.
	const following = () =>
		database
			.prepare(
				`SELECT text, start_position as startPosition FROM passages
				 WHERE id > ? AND id <= ? AND book_id = ? ORDER BY id`,
			)
			.all(passage.id, passage.id + FOLLOWING_PASSAGES, passage.bookId) as PassageSlice[];
	return resolvePassagePages(passage, following, matchOffset);
}

export interface PassageContext {
	bookTitle: string;
	bookAuthor: string;
	/** The passages included, in order. */
	passageIds: number[];
	/** Continuous text, markup stripped, the shared overlap between neighbours removed. */
	text: string;
	/** Pages the text spans ("21:535–536"); null if the edition has none. */
	pages: string | null;
}

/**
 * A passage with its neighbours in the same book, as one continuous text. A search hit is
 * 800 characters cut at an arbitrary point; a ruling's condition or the end of a hadith
 * is often in the next one.
 */
export function getPassageContext(
	id: number,
	before = 1,
	after = 1,
	db?: Database.Database,
): PassageContext | null {
	const database = db ?? initBookDatabase();
	const centre = database
		.prepare(
			`SELECT p.book_id as bookId, b.title as bookTitle, b.author as bookAuthor
			 FROM passages p JOIN books b ON b.id = p.book_id WHERE p.id = ?`,
		)
		.get(id) as { bookId: number; bookTitle: string; bookAuthor: string } | undefined;
	if (!centre) return null;
	// Passages of one book are inserted in order, so ids are consecutive within a book.
	const rows = database
		.prepare(
			`SELECT id, text, start_position as startPosition FROM passages
			 WHERE book_id = ? AND id BETWEEN ? AND ? ORDER BY id`,
		)
		.all(centre.bookId, id - before, id + after) as Array<{
		id: number;
		text: string;
		startPosition: number;
	}>;
	const first = rows[0];
	const last = rows[rows.length - 1];
	if (!(first && last)) return null;
	const from = getPassagePages({ ...first, bookId: centre.bookId }, undefined, database).page;
	const to = getPassagePages({ ...last, bookId: centre.bookId }, undefined, database).pages;
	const end = to?.split("–").pop() ?? null;
	// »6:68–69« within a volume, »27:412–28:1« across two (the form formatPageSpan uses).
	const sameVolume = from && end && from.split(":")[0] === end.split(":")[0];
	const span = sameVolume && end ? `${from}–${end.split(":")[1] ?? end}` : `${from}–${end}`;
	return {
		bookTitle: centre.bookTitle,
		bookAuthor: centre.bookAuthor,
		passageIds: rows.map((r) => r.id),
		text: cleanPassageText(stitchPassages(rows.map((r) => r.text))),
		pages: from && end && end !== from ? span : (from ?? to),
	};
}
