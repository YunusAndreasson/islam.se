/**
 * Knut Bernström's translation — the house translation for QUOTED verses — and sura
 * name resolution.
 *
 * `verses.text_bernstrom` holds Bernström verbatim from quran.com (translation 48),
 * filled by `scripts/quran-db.py bernstrom`: markup stripped, dashes and quote marks as
 * published. `text_swedish` is a different translation (Kent Asante Wennerström, from a
 * scan) and must not be quoted as Bernström. The svar and fördjupning producers check
 * every quoted verse against this text (scripts/check-quran-quotes.py).
 */

import type Database from "better-sqlite3";
import { initQuranDatabase } from "./database.js";

/**
 * Bernström's text of one verse, or null if the verse does not exist or has no
 * Bernström text.
 */
export function getBernstromVerse(
	surah: number,
	ayah: number,
	db?: Database.Database,
): string | null {
	if (!(Number.isInteger(surah) && Number.isInteger(ayah))) return null;
	const database = db ?? initQuranDatabase();
	const row = database
		.prepare(
			"SELECT text_bernstrom AS text FROM verses WHERE surah_number = ? AND verse_number = ?",
		)
		.get(surah, ayah) as { text: string | null } | undefined;
	return row?.text ? row.text : null;
}

/**
 * Bernström's text of verses `fromAyah`..`toAyah` (inclusive) of one sura, joined with a
 * space. Null unless EVERY verse in the range has a text: a range with a silent gap
 * would be a misquotation.
 */
export function getBernstromRange(
	surah: number,
	fromAyah: number,
	toAyah: number,
	db?: Database.Database,
): string | null {
	if (!(Number.isInteger(surah) && Number.isInteger(fromAyah) && Number.isInteger(toAyah))) {
		return null;
	}
	if (fromAyah < 1 || toAyah < fromAyah) return null;
	const database = db ?? initQuranDatabase();
	const rows = database
		.prepare(
			`SELECT verse_number AS ayah, text_bernstrom AS text FROM verses
			 WHERE surah_number = ? AND verse_number BETWEEN ? AND ?
			 ORDER BY verse_number`,
		)
		.all(surah, fromAyah, toAyah) as { ayah: number; text: string | null }[];
	if (rows.length !== toAyah - fromAyah + 1) return null;
	if (rows.some((r, i) => r.ayah !== fromAyah + i || !r.text)) return null;
	return rows.map((r) => r.text).join(" ");
}

// ============================================================================
// Sura names
// ============================================================================

export interface SurahName {
	number: number;
	/** Transliteration as the site writes it (»an-Nisāʾ«, »Āl ʿImrān«). */
	transliteration: string;
	/** Swedish name as stored in quran.db (`surah_name_swedish`). */
	swedish: string;
	/** Other transliterations and Swedish names in use (Bernström's, quran.com's, the site's). */
	aliases: readonly string[];
}

// [number, transliteration, Swedish name in quran.db, ...aliases]
const TABLE: readonly (readonly [number, string, string, ...string[]])[] = [
	[1, "al-Fātiḥa", "Inledningen", "Öppningen", "al-Fatihah", "Umm al-Kitāb"],
	[2, "al-Baqara", "Kon"],
	[3, "Āl ʿImrān", "Imrāns ätt", "Ali Imran", "Āli ʿImrān"],
	[4, "an-Nisāʾ", "Kvinnorna", "Kvinnor"],
	[5, "al-Māʾida", "Den himmelska måltiden"],
	[6, "al-Anʿām", "Boskapen", "Boskap"],
	[7, "al-Aʿrāf", "Höjderna"],
	[8, "al-Anfāl", "Krigsbytena", "Krigsbyte"],
	[9, "at-Tawba", "Ångern", "Ånger", "Barāʾa"],
	[10, "Yūnus", "Jona", "Jonah"],
	[11, "Hūd", "Eber"],
	[12, "Yūsuf", "Josef"],
	[13, "ar-Raʿd", "Åskan"],
	[14, "Ibrāhīm", "Abraham"],
	[15, "al-Ḥijr", "Den steniga trakten"],
	[16, "an-Naḥl", "Bina", "Biet"],
	[17, "al-Isrāʾ", "Den nattliga färden", "Den nattliga resan", "Banī Isrāʾīl"],
	[18, "al-Kahf", "Grottan"],
	[19, "Maryam", "Maria"],
	[20, "Ṭā Hā", "Bokstäverna Ta Ha", "Ta-Ha"],
	[21, "al-Anbiyāʾ", "Profeterna", "al-Anbya"],
	[22, "al-Ḥajj", "Vallfärden"],
	[23, "al-Muʾminūn", "De troende"],
	[24, "an-Nūr", "Ljuset", "Ljus"],
	[25, "al-Furqān", "Urskiljningen", "Måttstocken"],
	[26, "ash-Shuʿarāʾ", "Poeterna"],
	[27, "an-Naml", "Myrorna"],
	[28, "al-Qaṣaṣ", "Historien", "Berättelsen"],
	[29, "al-ʿAnkabūt", "Spindeln"],
	[30, "ar-Rūm", "Romarna", "Bysantinerna"],
	[31, "Luqmān", "Lukman"],
	[32, "as-Sajda", "Nedfallet mot marken", "De faller ned i tillbedjan"],
	[33, "al-Aḥzāb", "De sammansvurna"],
	[34, "Sabaʾ", "Saba"],
	[35, "Fāṭir", "Alstraren", "Skaparen", "Himlarnas och jordens skapare", "al-Malāʾika"],
	[36, "Yā Sīn", "Bokstäverna Ya Sin"],
	[37, "aṣ-Ṣāffāt", "De ordnade", "I sluten ordning"],
	[38, "Ṣād", "Bokstaven Sad"],
	[39, "az-Zumar", "Skarorna"],
	[40, "Ghāfir", "Förlåtaren", "Han som förlåter", "al-Muʾmin"],
	[
		41,
		"Fuṣṣilat",
		"Tydligt framställda",
		"En fast och klar förkunnelse",
		"Fast och klart framställda",
		"Ḥā Mīm as-Sajda",
	],
	[42, "ash-Shūrā", "Överläggningen", "Samråd", "ash-Shuraa"],
	[43, "az-Zukhruf", "Lyxens bländverk", "Guld"],
	[44, "ad-Dukhān", "Röken", "Rök"],
	[45, "al-Jāthiya", "De som faller på knä", "På knä"],
	[46, "al-Aḥqāf", "Sanddynerna", "Sanddynorna"],
	[47, "Muḥammad", "Muhammed", "al-Qitāl"],
	[48, "al-Fatḥ", "Segern"],
	[49, "al-Ḥujurāt", "De inre gemaken", "De inre rummen"],
	[50, "Qāf", "Bokstaven Qaf"],
	[51, "adh-Dhāriyāt", "De som virvlar upp"],
	[52, "aṭ-Ṭūr", "Berget", "Sinai berg"],
	[53, "an-Najm", "Stjärnan"],
	[54, "al-Qamar", "Månen"],
	[55, "ar-Raḥmān", "Den Nåderike"],
	[56, "al-Wāqiʿa", "Det som måste komma"],
	[57, "al-Ḥadīd", "Järnet"],
	[58, "al-Mujādila", "Hon som vädjade", "Hon som vädjar", "al-Mujādala"],
	[59, "al-Ḥashr", "Mönstringen"],
	[60, "al-Mumtaḥana", "Hon som sätts på prov", "Den som skall förhöras"],
	[61, "aṣ-Ṣaff", "Slagordningen", "I slutna led"],
	[62, "al-Jumuʿa", "Fredagsbönen"],
	[63, "al-Munāfiqūn", "Hycklarna"],
	[64, "at-Taghābun", "Självbedrägeriet", "Då vinnarna och förlorarna byter plats"],
	[65, "aṭ-Ṭalāq", "Skilsmässan", "Skilsmässa"],
	[66, "at-Taḥrīm", "Förbudet"],
	[67, "al-Mulk", "Herraväldet", "Herravälde", "Tabārak"],
	[68, "al-Qalam", "Pennan", "Nūn"],
	[69, "al-Ḥāqqa", "Den oundvikliga", "Sanningens stund"],
	[70, "al-Maʿārij", "Uppgångarna", "Vägarna upp till Gud"],
	[71, "Nūḥ", "Noa"],
	[72, "al-Jinn", "De osynliga", "Osynliga väsen"],
	[73, "al-Muzzammil", "Den insvepte", "Du som täcker över dig"],
	[74, "al-Muddaththir", "Den som söker stillhet", "Du som sveper in dig"],
	[75, "al-Qiyāma", "Uppståndelsen"],
	[76, "al-Insān", "Människan", "ad-Dahr"],
	[77, "al-Mursalāt", "De utsända", "De som sänds ut"],
	[78, "an-Nabaʾ", "Tillkännagivandet", "ʿAmma"],
	[79, "an-Nāziʿāt", "De som drar ut", "De som stiger över horisonten"],
	[80, "ʿAbasa", "Han rynkade pannan", "Med bister min"],
	[81, "at-Takwīr", "Mörkläggningen", "När solen lindas in"],
	[82, "al-Infiṭār", "Sönderbristningen", "När himlen rämnar"],
	[83, "al-Muṭaffifīn", "De som snålar", "De som snålar med mått och vikt"],
	[84, "al-Inshiqāq", "Klyvningen", "När himlen brister i stycken"],
	[85, "al-Burūj", "Stjärnbilderna"],
	[86, "aṭ-Ṭāriq", "Den nattlige besökaren", "Den nattliga besökaren"],
	[87, "al-Aʿlā", "Den Högste"],
	[88, "al-Ghāshiya", "Det överväldigande", "Det som skall överskugga allt"],
	[89, "al-Fajr", "Gryningen", "Gryningsljuset"],
	[90, "al-Balad", "Staden", "Landet"],
	[91, "ash-Shams", "Solen"],
	[92, "al-Layl", "Natten"],
	[93, "aḍ-Ḍuḥā", "Den ljusnande morgonen", "Det klara morgonljuset"],
	[94, "ash-Sharḥ", "Öppnandet", "Har Vi inte öppnat ditt bröst", "al-Inshirāḥ"],
	[95, "at-Tīn", "Fikonträdet"],
	[96, "al-ʿAlaq", "Grodden", "Iqraʾ"],
	[97, "al-Qadr", "Allsmaktens natt", "Allmaktens natt"],
	[98, "al-Bayyina", "Det klara vittnesbördet"],
	[99, "az-Zalzala", "Jordbävningen", "När jorden skälver"],
	[100, "al-ʿĀdiyāt", "De stormande", "Stridshästarna"],
	[101, "al-Qāriʿa", "Det bedövande dånet", "Det dundrande slaget"],
	[102, "at-Takāthur", "Rikedomstävlingen", "Tävlan i rikedom"],
	[103, "al-ʿAṣr", "Eftermiddagen", "Den flyende tiden"],
	[104, "al-Humaza", "Förtalaren", "Baktalaren"],
	[105, "al-Fīl", "Elefanten"],
	[106, "Quraysh", "Quraysh", "Quraish", "Qurayš"],
	[107, "al-Māʿūn", "Den lilla vänligheten", "Den minsta hjälp"],
	[108, "al-Kawthar", "Överflödet", "Det goda i överflöd"],
	[109, "al-Kāfirūn", "Förnekarna", "Sanningens förnekare"],
	[110, "an-Naṣr", "Hjälpen", "Guds hjälp"],
	[111, "al-Masad", "Palmfibrerna", "Ett tvinnat rep", "al-Lahab", "Tabbat"],
	[112, "al-Ikhlāṣ", "Den rena tron", "at-Tawḥīd"],
	[113, "al-Falaq", "Gryningsljuset", "Gryningens Herre"],
	[114, "an-Nās", "Människorna", "Människornas Herre"],
];

export const SURAH_NAMES: readonly SurahName[] = TABLE.map(
	([number, transliteration, swedish, ...aliases]) => ({
		number,
		transliteration,
		swedish,
		aliases,
	}),
);

/**
 * Fold a sura name to a matching key: diacritics, ʿ/ʾ and apostrophes, »sura«, the Arabic
 * article (al-/an-/ar-/as-/at-/ad-/az-/ash-/adh-/…), case, spaces and hyphens go; a final
 * -ah becomes -a (al-Baqarah = al-Baqara) and doubled letters collapse (Ṣaff = Saf).
 */
function foldSurah(name: string): string {
	return name
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.replace(/[ʿʾʻʼ'`’‘´]/g, "")
		.replace(/đ/gi, "d")
		.replace(/[*_]/g, "")
		.toLowerCase()
		.trim()
		.replace(/^sura[ht]?\s+/, "")
		.replace(/(^|[\s\-(])(?:al|an|ar|as|at|ad|az|ash|ath|adh|el|ul)[-\s]+/g, "$1")
		.replace(/[^\p{L}\p{N}]/gu, "")
		.replace(/ah$/, "a")
		.replace(/(.)\1+/g, "$1");
}

// Key → sura number. Precedence on a clash: transliteration, then the Swedish name in
// quran.db, then aliases; a clash within one level makes the key ambiguous (dropped).
const SURAH_INDEX: Map<string, number> = (() => {
	const levels = [
		SURAH_NAMES.map((s) => [s.number, [s.transliteration]] as const),
		SURAH_NAMES.map((s) => [s.number, [s.swedish]] as const),
		SURAH_NAMES.map((s) => [s.number, s.aliases] as const),
	];
	const index = new Map<string, number>();
	for (const level of levels) {
		const found = new Map<string, number | null>();
		for (const [number, names] of level) {
			for (const name of names) {
				const key = foldSurah(name);
				if (!key || index.has(key)) continue;
				const prior = found.get(key);
				found.set(key, prior === undefined || prior === number ? number : null);
			}
		}
		for (const [key, number] of found) if (number !== null) index.set(key, number);
	}
	return index;
})();

/**
 * Sura number from a name or number as it appears in a citation: »an-Nisāʾ
 * (Kvinnorna)«, »Kvinnorna«, »an-Nisa«, »al-Nisāʾ«, »4«, »Sura 4«, »Āl ʿImrān (Imrāns
 * ätt)«, »Kon (al-Baqara)«. Diacritics, ʿ/ʾ, hyphens, case and article variants are
 * ignored. Null if nothing matches or the parts of »X (Y)« disagree.
 */
export function resolveSurahNumber(name: string): number | null {
	const raw = name.trim();
	if (!raw) return null;
	const numeric = /^(?:sura[ht]?\s+)?(\d{1,3})$/i.exec(raw);
	if (numeric) {
		const n = Number(numeric[1]);
		return n >= 1 && n <= 114 ? n : null;
	}

	// »X (Y)«: the name and its gloss. Either part may carry the known form.
	const parts = [raw];
	const paren = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(raw);
	if (paren) parts.push(paren[1] ?? "", paren[2] ?? "");
	const hits = new Set<number>();
	for (const part of parts) {
		const n = SURAH_INDEX.get(foldSurah(part));
		if (n !== undefined) hits.add(n);
	}
	return hits.size === 1 ? ([...hits][0] ?? null) : null;
}
