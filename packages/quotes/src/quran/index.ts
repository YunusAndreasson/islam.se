/**
 * Quran database and extraction modules
 */

// Database
export {
	closeQuranDatabase,
	getAllVerses,
	getQuranStats,
	getSurah,
	getVerse,
	initQuranDatabase,
	insertVerse,
	insertVerseEmbedding,
	type QuranStats,
	type QuranVerse,
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
