/**
 * Book and passage types for RAG (Retrieval Augmented Generation)
 */

import type { Language } from "./quote.js";

/**
 * A book in the database
 */
export interface Book {
	id: number;
	title: string;
	author: string;
	language: Language;
	sourceUrl: string;
	summary: string | null;
	keyConcepts: string[];
	totalChapters: number;
	totalPassages: number;
	importedAt: string;
}

/**
 * A chapter within a book
 */
export interface Chapter {
	id: number;
	bookId: number;
	chapterNumber: number;
	title: string | null;
	summary: string | null;
	keyConcepts: string[];
	startPosition: number;
	endPosition: number;
}

/**
 * A passage (chunk) of text within a book
 */
export interface Passage {
	id: number;
	bookId: number;
	chapterId: number | null;
	passageNumber: number;
	text: string;
	startPosition: number;
	endPosition: number;
}

/**
 * Passage with book and chapter context
 */
export interface PassageWithContext extends Passage {
	bookTitle: string;
	bookAuthor: string;
	chapterTitle: string | null;
	chapterNumber: number | null;
}

/**
 * Passage with similarity score from search
 */
export interface PassageWithScore extends PassageWithContext {
	score: number;
}

/**
 * Chapter with similarity score from search
 */
export interface ChapterWithScore extends Chapter {
	bookTitle: string;
	bookAuthor: string;
	score: number;
}

/**
 * Book with similarity score from search
 */
export interface BookWithScore extends Book {
	score: number;
}

/**
 * Statistics about the book database
 */
export interface BookDatabaseStats {
	totalBooks: number;
	totalChapters: number;
	totalPassages: number;
	byLanguage: {
		swedish: number;
		arabic: number;
		english: number;
	};
	totalCharsIndexed: number;
}

/**
 * Inventory of book database content
 */
export interface BookInventory {
	totalBooks: number;
	totalPassages: number;
	books: {
		id: number;
		title: string;
		author: string;
		language: Language;
		passages: number;
		chapters: number;
		concepts: string[];
	}[];
}

/**
 * A matched concept from book search
 */
export interface ConceptMatch {
	bookId: number;
	bookTitle: string;
	bookAuthor: string;
	concept: string;
	chapterTitle: string | null;
	relevantPassages: PassageWithScore[];
}
