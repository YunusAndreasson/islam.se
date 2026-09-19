import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { findBooks, foldName, getPassagePages } from "./lookup.js";

function createDb(): Database.Database {
	const db = new Database(":memory:");
	db.exec(`
		CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT, author TEXT, language TEXT, source_url TEXT);
		CREATE TABLE passages (
			id INTEGER PRIMARY KEY, book_id INTEGER, passage_number INTEGER, text TEXT,
			start_position INTEGER, end_position INTEGER
		);
	`);
	const book = db.prepare(
		"INSERT INTO books (id, title, author, language, source_url) VALUES (?, ?, ?, ?, ?)",
	);
	const oi = (uri: string) =>
		`https://raw.githubusercontent.com/OpenITI/0450AH/master/data/${uri.split(".")[0]}/${uri}/${uri}.Shamela0022881-ara1`;
	book.run(164, "AhkamSultaniyya", "الماوردي", "ar", oi("0450AbuHasanMawardi.AhkamSultaniyya"));
	book.run(
		146,
		"Adab al-Dunya wal-Din",
		"الماوردي",
		"ar",
		oi("0450AbuHasanMawardi.AdabDunyaWaDin"),
	);
	book.run(193, "Majmu al-fatawa", "ابن تيمية", "ar", oi("0728IbnTaymiyya.MajmucFatawa"));
	book.run(
		1,
		"Röda rummet",
		"August Strindberg",
		"sv",
		"https://www.gutenberg.org/cache/epub/1/pg1.txt",
	);
	return db;
}

describe("findBooks", () => {
	let db: Database.Database;
	beforeEach(() => {
		db = createDb();
	});

	const ids = (filter: { book?: string; author?: string }) =>
		findBooks(filter, db).map((b) => b.id);

	it("matches a title regardless of case, diacritics and the Arabic article", () => {
		expect(ids({ book: "AhkamSultaniyya" })).toEqual([164]);
		expect(ids({ book: "al-Aḥkām al-sulṭāniyya" })).toEqual([164]);
		expect(ids({ book: "majmūʿ al-fatāwā" })).toEqual([193]);
		expect(ids({ book: "röda" })).toEqual([1]);
	});

	it("matches a romanized author against an Arabic-script author field", () => {
		// The author field for al-Māwardī is »الماوردي«; a caller types »Mawardi«. The
		// OpenITI URI (0450AbuHasanMawardi) and the romanization table both bridge it.
		expect(ids({ author: "Mawardi" })).toEqual([146, 164]);
		expect(ids({ author: "al-Māwardī" })).toEqual([146, 164]);
		expect(ids({ author: "Ibn Taymiyya" })).toEqual([193]);
		expect(ids({ author: "الماوردي" })).toEqual([146, 164]);
	});

	it("intersects book and author, and returns nothing for no match", () => {
		expect(ids({ book: "Adab", author: "Mawardi" })).toEqual([146]);
		expect(ids({ book: "Ahkam", author: "Taymiyya" })).toEqual([]);
		expect(ids({ book: "no such book" })).toEqual([]);
	});

	it("folds names symmetrically", () => {
		expect(foldName("al-Aḥkām al-Sulṭāniyya")).toBe(foldName("AhkamSultaniyya"));
		expect(foldName("أهل")).toBe(foldName("اهل"));
	});
});

describe("getPassagePages", () => {
	it("reads ahead into the next passages of the SAME book only", () => {
		const db = createDb();
		const add = db.prepare(
			"INSERT INTO passages (id, book_id, passage_number, text, start_position, end_position) VALUES (?, ?, ?, ?, ?, ?)",
		);
		add.run(10, 164, 1, "# بلا علامة", 0, 12);
		add.run(11, 999, 1, "# كتاب آخر PageV09P999", 0, 20); // interleaved other book
		add.run(12, 164, 2, "# تتمة PageV01P017", 10, 30);
		const pages = getPassagePages(
			{ id: 10, bookId: 164, text: "# بلا علامة", startPosition: 0 },
			undefined,
			db,
		);
		expect(pages.page).toBe("1:17");
	});
});
