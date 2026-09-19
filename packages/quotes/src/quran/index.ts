/**
 * Quran database and extraction modules
 */

// Bernström (house translation for quotes) and sura names
export {
	getBernstromRange,
	getBernstromVerse,
	resolveSurahNumber,
	SURAH_NAMES,
	type SurahName,
} from "./bernstrom.js";

// Database
export {
	cleanVerseText,
	closeQuranDatabase,
	deleteAllVerseEmbeddings,
	getAllVerses,
	getQuranStats,
	getSurah,
	getVerse,
	initQuranDatabase,
	insertVerse,
	insertVerseEmbedding,
	type QuranStats,
	type QuranVerse,
	rebuildQuranFts,
	type StoredVerse,
	searchVerses,
	searchVersesSemantic,
	type VerseWithScore,
} from "./database.js";

// Extractor
export {
	getParseStats,
	parseQuranText,
} from "./extractor.js";
