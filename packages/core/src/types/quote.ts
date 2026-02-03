/**
 * Core quote types used across the application
 */

/** Supported languages in the quote database */
export type Language = "sv" | "ar" | "en";

/** Quote length category based on character count */
export type QuoteLength = "short" | "medium" | "long";

/** Source type for imported quotes */
export type SourceType = "gutenberg" | "openiti" | string;

/**
 * A quote stored in the database
 */
export interface StoredQuote {
	id: number;
	text: string;
	author: string;
	workTitle: string;
	category: string;
	keywords: string[];
	tone: string;
	standalone: number;
	length: QuoteLength;
	language: Language;
	sourceType: string | null;
	createdAt: string;
}

/**
 * A quote with similarity score from search results
 */
export interface QuoteWithScore extends StoredQuote {
	score: number;
}

/**
 * Raw row from database before parsing JSON fields
 */
export interface RawQuoteRow {
	id: number;
	text: string;
	author: string;
	workTitle: string;
	category: string;
	keywords: string;
	tone: string;
	standalone: number;
	length: QuoteLength;
	language: Language;
	sourceType: string | null;
	createdAt: string;
}

/**
 * Statistics about the quote database
 */
export interface DatabaseStats {
	totalQuotes: number;
	authors: number;
	works: number;
	byLanguage: {
		swedish: number;
		arabic: number;
		norse: number;
	};
	bySourceType: {
		gutenberg: number;
		openiti: number;
		other: number;
	};
}

/**
 * Options for inserting a quote
 */
export interface InsertQuoteOptions {
	sourceUrl?: string;
	language?: Language;
	sourceType?: SourceType;
}

/**
 * Quote extracted from a text (before storage)
 */
export interface Quote {
	text: string;
	author: string;
	workTitle: string;
	category?: string;
	keywords?: string[];
	tone?: string;
	standalone?: number;
}
