/**
 * Quran verse types for the Islamic content database
 */

/**
 * A Quran verse before storage
 */
export interface QuranVerse {
	surahNumber: number;
	surahNameArabic: string;
	surahNameSwedish: string;
	verseNumber: number;
	textSwedish: string;
	textArabic?: string;
	commentary?: string;
	translator: string;
}

/**
 * A verse stored in the database
 */
export interface StoredVerse extends QuranVerse {
	id: number;
	createdAt: string;
}

/**
 * A verse with similarity score from search
 */
export interface VerseWithScore extends StoredVerse {
	score: number;
}

/**
 * Statistics about the Quran database
 */
export interface QuranStats {
	totalVerses: number;
	surahs: number;
	versesWithCommentary: number;
	versesWithArabic: number;
	translators: string[];
}
