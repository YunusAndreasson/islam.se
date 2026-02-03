import { readFileSync } from "node:fs";
import type { QuranVerse } from "./database.js";

// Surah names mapping (number -> Arabic name, Swedish name)
const SURAH_NAMES: Record<number, { arabic: string; swedish: string }> = {
	1: { arabic: "الفاتحة", swedish: "Inledningen" },
	2: { arabic: "البقرة", swedish: "Kon" },
	3: { arabic: "آل عمران", swedish: "Imrāns ätt" },
	4: { arabic: "النساء", swedish: "Kvinnorna" },
	5: { arabic: "المائدة", swedish: "Den himmelska måltiden" },
	6: { arabic: "الأنعام", swedish: "Boskapen" },
	7: { arabic: "الأعراف", swedish: "Höjderna" },
	8: { arabic: "الأنفال", swedish: "Krigsbytena" },
	9: { arabic: "التوبة", swedish: "Ångern" },
	10: { arabic: "يونس", swedish: "Jona" },
	11: { arabic: "هود", swedish: "Eber" },
	12: { arabic: "يوسف", swedish: "Josef" },
	13: { arabic: "الرعد", swedish: "Åskan" },
	14: { arabic: "إبراهيم", swedish: "Abraham" },
	15: { arabic: "الحجر", swedish: "Den steniga trakten" },
	16: { arabic: "النحل", swedish: "Bina" },
	17: { arabic: "الإسراء", swedish: "Den nattliga färden" },
	18: { arabic: "الكهف", swedish: "Grottan" },
	19: { arabic: "مريم", swedish: "Maria" },
	20: { arabic: "طه", swedish: "Bokstäverna Ta Ha" },
	21: { arabic: "الأنبياء", swedish: "Profeterna" },
	22: { arabic: "الحج", swedish: "Vallfärden" },
	23: { arabic: "المؤمنون", swedish: "De troende" },
	24: { arabic: "النور", swedish: "Ljuset" },
	25: { arabic: "الفرقان", swedish: "Urskiljningen" },
	26: { arabic: "الشعراء", swedish: "Poeterna" },
	27: { arabic: "النمل", swedish: "Myrorna" },
	28: { arabic: "القصص", swedish: "Historien" },
	29: { arabic: "العنكبوت", swedish: "Spindeln" },
	30: { arabic: "الروم", swedish: "Romarna" },
	31: { arabic: "لقمان", swedish: "Lukman" },
	32: { arabic: "السجدة", swedish: "Nedfallet mot marken" },
	33: { arabic: "الأحزاب", swedish: "De sammansvurna" },
	34: { arabic: "سبأ", swedish: "Saba" },
	35: { arabic: "فاطر", swedish: "Alstraren" },
	36: { arabic: "يس", swedish: "Bokstäverna Ya Sin" },
	37: { arabic: "الصافات", swedish: "De ordnade" },
	38: { arabic: "ص", swedish: "Bokstaven Sad" },
	39: { arabic: "الزمر", swedish: "Skarorna" },
	40: { arabic: "غافر", swedish: "Förlåtaren" },
	41: { arabic: "فصلت", swedish: "Tydligt framställda" },
	42: { arabic: "الشورى", swedish: "Överläggningen" },
	43: { arabic: "الزخرف", swedish: "Lyxens bländverk" },
	44: { arabic: "الدخان", swedish: "Röken" },
	45: { arabic: "الجاثية", swedish: "De som faller på knä" },
	46: { arabic: "الأحقاف", swedish: "Sanddynerna" },
	47: { arabic: "محمد", swedish: "Muhammed" },
	48: { arabic: "الفتح", swedish: "Segern" },
	49: { arabic: "الحجرات", swedish: "De inre gemaken" },
	50: { arabic: "ق", swedish: "Bokstaven Qaf" },
	51: { arabic: "الذاريات", swedish: "De som virvlar upp" },
	52: { arabic: "الطور", swedish: "Berget" },
	53: { arabic: "النجم", swedish: "Stjärnan" },
	54: { arabic: "القمر", swedish: "Månen" },
	55: { arabic: "الرحمن", swedish: "Den Nåderike" },
	56: { arabic: "الواقعة", swedish: "Det som måste komma" },
	57: { arabic: "الحديد", swedish: "Järnet" },
	58: { arabic: "المجادلة", swedish: "Hon som vädjade" },
	59: { arabic: "الحشر", swedish: "Mönstringen" },
	60: { arabic: "الممتحنة", swedish: "Hon som sätts på prov" },
	61: { arabic: "الصف", swedish: "Slagordningen" },
	62: { arabic: "الجمعة", swedish: "Fredagsbönen" },
	63: { arabic: "المنافقون", swedish: "Hycklarna" },
	64: { arabic: "التغابن", swedish: "Självbedrägeriet" },
	65: { arabic: "الطلاق", swedish: "Skilsmässan" },
	66: { arabic: "التحريم", swedish: "Förbudet" },
	67: { arabic: "الملك", swedish: "Herraväldet" },
	68: { arabic: "القلم", swedish: "Pennan" },
	69: { arabic: "الحاقة", swedish: "Den oundvikliga" },
	70: { arabic: "المعارج", swedish: "Uppgångarna" },
	71: { arabic: "نوح", swedish: "Noa" },
	72: { arabic: "الجن", swedish: "De osynliga" },
	73: { arabic: "المزمل", swedish: "Den insvepte" },
	74: { arabic: "المدثر", swedish: "Den som söker stillhet" },
	75: { arabic: "القيامة", swedish: "Uppståndelsen" },
	76: { arabic: "الإنسان", swedish: "Människan" },
	77: { arabic: "المرسلات", swedish: "De utsända" },
	78: { arabic: "النبأ", swedish: "Tillkännagivandet" },
	79: { arabic: "النازعات", swedish: "De som drar ut" },
	80: { arabic: "عبس", swedish: "Han rynkade pannan" },
	81: { arabic: "التكوير", swedish: "Mörkläggningen" },
	82: { arabic: "الانفطار", swedish: "Sönderbristningen" },
	83: { arabic: "المطففين", swedish: "De som snålar" },
	84: { arabic: "الانشقاق", swedish: "Klyvningen" },
	85: { arabic: "البروج", swedish: "Stjärnbilderna" },
	86: { arabic: "الطارق", swedish: "Den nattlige besökaren" },
	87: { arabic: "الأعلى", swedish: "Den Högste" },
	88: { arabic: "الغاشية", swedish: "Det överväldigande" },
	89: { arabic: "الفجر", swedish: "Gryningen" },
	90: { arabic: "البلد", swedish: "Staden" },
	91: { arabic: "الشمس", swedish: "Solen" },
	92: { arabic: "الليل", swedish: "Natten" },
	93: { arabic: "الضحى", swedish: "Den ljusnande morgonen" },
	94: { arabic: "الشرح", swedish: "Öppnandet" },
	95: { arabic: "التين", swedish: "Fikonträdet" },
	96: { arabic: "العلق", swedish: "Grodden" },
	97: { arabic: "القدر", swedish: "Allsmaktens natt" },
	98: { arabic: "البينة", swedish: "Det klara vittnesbördet" },
	99: { arabic: "الزلزلة", swedish: "Jordbävningen" },
	100: { arabic: "العاديات", swedish: "De stormande" },
	101: { arabic: "القارعة", swedish: "Det bedövande dånet" },
	102: { arabic: "التكاثر", swedish: "Rikedomstävlingen" },
	103: { arabic: "العصر", swedish: "Eftermiddagen" },
	104: { arabic: "الهمزة", swedish: "Förtalaren" },
	105: { arabic: "الفيل", swedish: "Elefanten" },
	106: { arabic: "قريش", swedish: "Quraysh" },
	107: { arabic: "الماعون", swedish: "Den lilla vänligheten" },
	108: { arabic: "الكوثر", swedish: "Överflödet" },
	109: { arabic: "الكافرون", swedish: "Förnekarna" },
	110: { arabic: "النصر", swedish: "Hjälpen" },
	111: { arabic: "المسد", swedish: "Palmfibrerna" },
	112: { arabic: "الإخلاص", swedish: "Den rena tron" },
	113: { arabic: "الفلق", swedish: "Gryningsljuset" },
	114: { arabic: "الناس", swedish: "Människorna" },
};

/**
 * Removes Arabic characters and diacritics from text
 */
function removeArabic(text: string): string {
	// Arabic Unicode ranges: \u0600-\u06FF (Arabic), \u0750-\u077F (Arabic Supplement),
	// \u08A0-\u08FF (Arabic Extended-A), \uFB50-\uFDFF (Arabic Presentation Forms-A),
	// \uFE70-\uFEFF (Arabic Presentation Forms-B)
	return text
		.replace(
			/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u200F\u200E۝٠-٩]+/g,
			"",
		)
		.trim();
}

/**
 * Cleans up extracted Swedish text
 */
function cleanText(text: string): string {
	return text
		.replace(/\s+/g, " ") // Normalize whitespace
		.replace(/­/g, "") // Remove soft hyphens
		.replace(/\s+([,.;:!?])/g, "$1") // Fix spacing before punctuation
		.trim();
}

// Pattern to match surah headers like "Sura 1 Inledningen" or "Sura 2 Kon"
const SURAH_PATTERN = /^\s*Sura\s+(\d+)\s+/i;

// Pattern to match verse numbers like "1. " at the start of a line
const VERSE_PATTERN = /^(\d+)\.\s+(.+)/;

// Patterns that indicate commentary text
const COMMENTARY_START_PATTERN =
	/^(Allah|Den|De |Det |Han |Hon |Här |Detta|Dessa|Som |Se |Se även|Med |I |Om |På |För |Av |Till |Från |Ur |Eller )/;

interface ParseState {
	verses: QuranVerse[];
	currentSurah: number;
	currentVerseNum: number;
	currentVerseText: string;
	currentCommentary: string;
	inVerse: boolean;
	inCommentary: boolean;
	translator: string;
}

function createParseState(translator: string): ParseState {
	return {
		verses: [],
		currentSurah: 0,
		currentVerseNum: 0,
		currentVerseText: "",
		currentCommentary: "",
		inVerse: false,
		inCommentary: false,
		translator,
	};
}

function saveCurrentVerse(state: ParseState): void {
	if (state.currentSurah > 0 && state.currentVerseNum > 0 && state.currentVerseText) {
		state.verses.push(
			createVerse(
				state.currentSurah,
				state.currentVerseNum,
				state.currentVerseText,
				state.currentCommentary,
				state.translator,
			),
		);
	}
}

function isCommentaryLine(line: string): boolean {
	if (!/^[A-ZÅÄÖ][a-zåäö]/.test(line)) return false;
	return (
		line.includes("(T)") ||
		line.includes("(B)") ||
		line.includes("(K)") ||
		line.includes("(Ö)") ||
		line.length > 100 ||
		COMMENTARY_START_PATTERN.test(line)
	);
}

function processSurahHeader(state: ParseState, surahNum: number): void {
	saveCurrentVerse(state);
	state.currentSurah = surahNum;
	state.currentVerseNum = 0;
	state.currentVerseText = "";
	state.currentCommentary = "";
	state.inVerse = false;
	state.inCommentary = false;
}

function processVerseStart(state: ParseState, verseNum: number, verseText: string): void {
	saveCurrentVerse(state);
	state.currentVerseNum = verseNum;
	state.currentVerseText = verseText;
	state.currentCommentary = "";
	state.inVerse = true;
	state.inCommentary = false;
}

function processVerseContinuation(state: ParseState, line: string): void {
	if (!state.inVerse || state.currentSurah === 0 || line.length === 0) return;

	if (isCommentaryLine(line) || state.inCommentary) {
		state.inCommentary = true;
		state.currentCommentary += (state.currentCommentary ? " " : "") + line;
	} else {
		state.currentVerseText += ` ${line}`;
	}
}

function processLine(state: ParseState, line: string): void {
	const cleanLine = removeArabic(line);

	const surahMatch = cleanLine.match(SURAH_PATTERN);
	if (surahMatch?.[1]) {
		processSurahHeader(state, parseInt(surahMatch[1], 10));
		return;
	}

	const verseMatch = cleanLine.match(VERSE_PATTERN);
	if (verseMatch?.[1] && verseMatch[2] && state.currentSurah > 0) {
		processVerseStart(state, parseInt(verseMatch[1], 10), verseMatch[2]);
		return;
	}

	processVerseContinuation(state, cleanLine);
}

/**
 * Parses the extracted Quran text file
 */
export function parseQuranText(
	filePath: string,
	translator = "Kent Asante Wennerström",
): QuranVerse[] {
	const content = readFileSync(filePath, "utf-8");
	const lines = content.split("\n");
	const state = createParseState(translator);

	for (const line of lines) {
		if (line) processLine(state, line);
	}

	saveCurrentVerse(state);
	return state.verses;
}

function createVerse(
	surahNumber: number,
	verseNumber: number,
	text: string,
	commentary: string,
	translator: string,
): QuranVerse {
	const surahInfo = SURAH_NAMES[surahNumber] || {
		arabic: `سورة ${surahNumber}`,
		swedish: `Sura ${surahNumber}`,
	};

	return {
		surahNumber,
		surahNameArabic: surahInfo.arabic,
		surahNameSwedish: surahInfo.swedish,
		verseNumber,
		textSwedish: cleanText(text),
		commentary: commentary ? cleanText(commentary) : undefined,
		translator,
	};
}

/**
 * Gets statistics about parsed verses
 */
export function getParseStats(verses: QuranVerse[]): {
	totalVerses: number;
	surahs: number;
	versesWithCommentary: number;
	surahBreakdown: Record<number, number>;
} {
	const surahBreakdown: Record<number, number> = {};
	let versesWithCommentary = 0;

	for (const verse of verses) {
		surahBreakdown[verse.surahNumber] = (surahBreakdown[verse.surahNumber] || 0) + 1;
		if (verse.commentary) {
			versesWithCommentary++;
		}
	}

	return {
		totalVerses: verses.length,
		surahs: Object.keys(surahBreakdown).length,
		versesWithCommentary,
		surahBreakdown,
	};
}
