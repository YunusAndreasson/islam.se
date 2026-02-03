/**
 * Book RAG (Retrieval Augmented Generation) system
 */

// Chunking
export {
	type ChapterInfo,
	type ChunkInfo,
	type ChunkingOptions,
	type ChunkingResult,
	chunkBook,
	chunkText,
	detectChapters,
	estimatePassageCount,
} from "./chunker.js";
// Database
export {
	type Book,
	type BookDatabaseStats,
	type BookWithScore,
	type Chapter,
	type ChapterWithScore,
	closeBookDatabase,
	deleteBook,
	getAllBooks,
	getBook,
	getBookByUrl,
	getBookStats,
	getChaptersByBook,
	getPassage,
	getPassagesByBook,
	getPassagesByChapter,
	initBookDatabase,
	insertBook,
	insertChapter,
	insertPassage,
	insertPassageEmbedding,
	insertSummaryEmbedding,
	type Passage,
	type PassageWithContext,
	type PassageWithScore,
	updateBook,
	updateChapter,
} from "./database.js";

// Import
export {
	type ImportOptions,
	type ImportResult,
	importBook,
	importBooksFromFile,
} from "./importer.js";

// Search
export {
	type BookInventory,
	type ConceptMatch,
	type ConceptSearchOptions,
	getBookInventory,
	getBookPassages,
	type HybridSearchOptions,
	type HybridSearchResult,
	type PassageSearchOptions,
	searchBooks,
	searchConcepts,
	searchPassages,
	searchPassagesText,
} from "./search.js";
