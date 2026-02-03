/**
 * Search-related types for quote and content discovery
 */

import type { Language, QuoteLength } from "./quote.js";

/**
 * Options for semantic search
 */
export interface SearchOptions {
	limit?: number;
	language?: Language;
}

/**
 * Formatted quote for use in authored content
 */
export interface FormattedQuote {
	text: string;
	attribution: string;
	category: string;
	keywords: string[];
	tone: string;
	standalone: number;
	length: QuoteLength;
	language: Language;
	score: number;
}

/**
 * Formatted quote with database ID
 */
export interface FormattedQuoteWithId extends FormattedQuote {
	id: number;
}

/**
 * Database inventory overview
 */
export interface Inventory {
	total: number;
	categories: { name: string; count: number; quality: number }[];
	tones: { name: string; count: number }[];
	authors: { name: string; count: number }[];
	languages: { sv: number; ar: number; en: number };
	quality: { standalone4Plus: number; standalone5: number };
}
