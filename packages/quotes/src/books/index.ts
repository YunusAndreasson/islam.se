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
	beginBookTransaction,
	type Chapter,
	type ChapterWithScore,
	cleanOrphanEmbeddings,
	closeBookDatabase,
	commitBookTransaction,
	deleteBook,
	getAllBooks,
	getBook,
	getBookByUrl,
	getBookStats,
	getChaptersByBook,
	getPassage,
	getPassagesByBook,
	getPassagesByChapter,
	getPassagesWithoutEmbedding,
	initBookDatabase,
	insertBook,
	insertChapter,
	insertPassage,
	insertPassageEmbedding,
	insertSummaryEmbedding,
	type OrphanCleanupResult,
	type Passage,
	type PassageWithContext,
	type PassageWithScore,
	rebuildBooksFts,
	rollbackBookTransaction,
	runInBookTransaction,
	updateBook,
	updateChapter,
} from "./database.js";

// Import
export {
	backfillPassageEmbeddings,
	type ImportOptions,
	type ImportResult,
	importBook,
	importBooksFromFile,
	summarizeAllUnsummarized,
	summarizeExistingBook,
} from "./importer.js";

// Lookup by title/author, page references for stored passages
export { type BookRef, findBooks, foldName, getPassagePages } from "./lookup.js";
// Pages and display text
export {
	cleanPassageText,
	findPageMarkers,
	formatPageRef,
	formatPageSpan,
	type PageMarker,
	type PassagePages,
	type PassageSlice,
	resolvePassagePages,
} from "./pages.js";
// Search
export {
	type BookInventory,
	type BookPassageHit,
	type BookPassageSearchOptions,
	type BookPassageSearchResult,
	type ConceptMatch,
	type ConceptSearchOptions,
	getBookInventory,
	getBookPassages,
	type HybridSearchOptions,
	type HybridSearchResult,
	type PassageSearchOptions,
	searchBookPassages,
	searchBooks,
	searchConcepts,
	searchPassages,
	searchPassagesText,
	type TextSearchOptions,
} from "./search.js";
