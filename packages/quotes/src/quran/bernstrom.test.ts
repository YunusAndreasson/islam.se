import Database from "better-sqlite3";
import { beforeAll, describe, expect, it } from "vitest";
import {
	getBernstromRange,
	getBernstromVerse,
	resolveSurahNumber,
	SURAH_NAMES,
} from "./bernstrom.js";

function createDb(): Database.Database {
	const db = new Database(":memory:");
	db.exec(`
		CREATE TABLE verses (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			surah_number INTEGER NOT NULL,
			verse_number INTEGER NOT NULL,
			text_swedish TEXT NOT NULL,
			text_bernstrom TEXT
		)
	`);
	const add = db.prepare(
		"INSERT INTO verses (surah_number, verse_number, text_swedish, text_bernstrom) VALUES (?, ?, ?, ?)",
	);
	add.run(
		2,
		173,
		"Det Han har förbjudit…",
		"Vad Han har förbjudit er är kött av självdöda djur, blod och svinkött - inte den som av trots överträder",
	);
	add.run(
		4,
		58,
		"Allah befaller…",
		"GUD befaller er att till den rättmätige ägaren återlämna det som ni fått er anförtrott",
	);
	add.run(4, 59, "Ni som…", "TROENDE! Lyd Gud och lyd Sändebudet");
	add.run(4, 61, "…", "Och när de uppmanas");
	add.run(4, 62, "…", null); // a row the Bernström fill has not reached
	return db;
}

describe("getBernstromVerse / getBernstromRange", () => {
	let db: Database.Database;
	beforeAll(() => {
		db = createDb();
	});

	it("returns Bernström verbatim — dashes and capitals as published", () => {
		// The svar pipeline once rewrote the opening of 2:173 (»Vad Han har förbjudit …«)
		// because a capital pronoun looked wrong. The house text is not normalised.
		expect(getBernstromVerse(2, 173, db)).toBe(
			"Vad Han har förbjudit er är kött av självdöda djur, blod och svinkött - inte den som av trots överträder",
		);
	});

	it("returns null for a missing verse or a verse without Bernström text", () => {
		expect(getBernstromVerse(4, 60, db)).toBeNull();
		expect(getBernstromVerse(4, 62, db)).toBeNull();
		expect(getBernstromVerse(4.5, 1, db)).toBeNull();
	});

	it("joins a range with single spaces", () => {
		expect(getBernstromRange(4, 58, 59, db)).toBe(
			"GUD befaller er att till den rättmätige ägaren återlämna det som ni fått er anförtrott TROENDE! Lyd Gud och lyd Sändebudet",
		);
		expect(getBernstromRange(4, 58, 58, db)).toBe(getBernstromVerse(4, 58, db));
	});

	it("refuses a range with a gap — a silently dropped verse would be a misquote", () => {
		expect(getBernstromRange(4, 59, 61, db)).toBeNull(); // 4:60 missing
		expect(getBernstromRange(4, 61, 62, db)).toBeNull(); // 4:62 has no text
		expect(getBernstromRange(4, 59, 58, db)).toBeNull(); // reversed
		expect(getBernstromRange(4, 0, 1, db)).toBeNull();
	});
});

describe("resolveSurahNumber", () => {
	it.each([
		["an-Nisāʾ (Kvinnorna)", 4],
		["Kvinnorna", 4],
		["an-Nisa", 4],
		["al-Nisāʾ", 4],
		["4", 4],
		["Sura 4", 4],
		["al-Baqara", 2],
		["al-Baqarah", 2],
		["Kon (al-Baqara)", 2],
		["Āl ʿImrān (Imrāns ätt)", 3],
		["Al Imran", 3],
		["Imrans ätt (Āl ʿImrān)", 3],
		["ar-Rūm (Romarna)", 30],
		["al-Rūm", 30],
		["Yā Sīn", 36],
		["Ṭā Hā", 20],
		["aṣ-Ṣaff", 61],
		["aṣ-Ṣāffāt", 37],
		["*Skaparen* (Fāṭir)", 35],
		["Fussilat (Fast och klart framställda)", 41],
		["Höjderna (al-A'raf)", 7],
		["ʿAbasa", 80],
		["an-Nās", 114],
		["an-Naṣr", 110],
	])("%s → %i", (name, expected) => {
		expect(resolveSurahNumber(name)).toBe(expected);
	});

	it("rejects out-of-range numbers, unknown names and self-contradicting pairs", () => {
		expect(resolveSurahNumber("0")).toBeNull();
		expect(resolveSurahNumber("115")).toBeNull();
		expect(resolveSurahNumber("")).toBeNull();
		expect(resolveSurahNumber("Strindberg")).toBeNull();
		expect(resolveSurahNumber("Kon (an-Nisāʾ)")).toBeNull();
	});

	it("resolves every sura's own transliteration and Swedish name to itself", () => {
		// A folding collision (two suras whose names fold to the same key) would silently
		// send a citation to the wrong sura. Every canonical name must round-trip.
		expect(SURAH_NAMES).toHaveLength(114);
		for (const s of SURAH_NAMES) {
			expect(resolveSurahNumber(s.transliteration), s.transliteration).toBe(s.number);
			expect(resolveSurahNumber(s.swedish), s.swedish).toBe(s.number);
			expect(resolveSurahNumber(`${s.transliteration} (${s.swedish})`)).toBe(s.number);
		}
	});
});
