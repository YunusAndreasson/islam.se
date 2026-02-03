/**
 * @islam-se/quotes
 *
 * Core library for fetching, extracting, storing, and searching quotes
 * with local embeddings support.
 */

// ============================================================================
// Fetcher
// ============================================================================

export {
	extractMetadataFromUrl,
	type FetchResult,
	fetchText,
	fetchTexts,
	type TextMetadata,
} from "./fetcher.js";

// ============================================================================
// Database
// ============================================================================

export {
	beginTransaction,
	closeDatabase,
	commitTransaction,
	type DatabaseStats,
	getAllQuotes,
	getQuote,
	getStats,
	getUnknownAuthorSourceUrls,
	type InsertQuoteOptions,
	initDatabase,
	insertEmbedding,
	insertQuote,
	parseQuoteRow,
	type QuoteWithScore,
	type RawQuoteRow,
	rollbackTransaction,
	runInTransaction,
	type StoredQuote,
	updateQuoteMetadataBySource,
} from "./database.js";

// ============================================================================
// Embeddings
// ============================================================================

// OpenAI embeddings (requires API key)
// Local embeddings (no API key required)
export {
	generateEmbedding,
	generateEmbeddings,
	generateLocalEmbedding,
	generateLocalEmbeddings,
	getEmbeddingDimensions,
	getLocalEmbeddingDimensions,
	preloadLocalModel,
} from "./embeddings/index.js";

// ============================================================================
// Extraction
// ============================================================================

// Swedish extraction
// Arabic extraction
// Norse extraction
export {
	type ArabicExtractionResult,
	ArabicExtractionResultSchema,
	type ArabicQuote,
	ArabicQuoteSchema,
	cleanOpenITIText,
	type ExtractionResult,
	ExtractionResultSchema,
	extractArabicQuotes,
	extractNorseQuotes,
	extractQuotes,
	type NorseExtractionResult,
	NorseExtractionResultSchema,
	type NorseQuote,
	NorseQuoteSchema,
	parseOpenITIUri,
	type Quote,
	QuoteSchema,
	saveArabicExtractionResult,
	saveExtractionResult,
	saveNorseExtractionResult,
} from "./extraction/index.js";

// ============================================================================
// Search
// ============================================================================

export {
	type FormattedQuote,
	type FormattedQuoteWithId,
	findQuotesByFilter,
	findQuotesForLLM,
	findQuotesLocal,
	findQuotesPaired,
	getCategories,
	getInventory,
	type Inventory,
	type SearchOptions,
	searchQuotes,
	searchQuotesText,
} from "./search.js";

// ============================================================================
// Books (RAG)
// ============================================================================

export {
	// Database
	type Book,
	type BookDatabaseStats,
	// Search
	type BookInventory,
	type BookWithScore,
	beginBookTransaction,
	type Chapter,
	// Chunking
	type ChapterInfo,
	type ChapterWithScore,
	type ChunkInfo,
	type ChunkingOptions,
	type ChunkingResult,
	type ConceptMatch,
	type ConceptSearchOptions,
	chunkBook,
	chunkText,
	closeBookDatabase,
	commitBookTransaction,
	deleteBook,
	detectChapters,
	estimatePassageCount,
	getAllBooks,
	getBook,
	getBookByUrl,
	getBookInventory,
	getBookPassages,
	getBookStats,
	getChaptersByBook,
	getPassage,
	getPassagesByBook,
	getPassagesByChapter,
	type HybridSearchOptions,
	type HybridSearchResult,
	// Import
	type ImportOptions,
	type ImportResult,
	importBook,
	importBooksFromFile,
	initBookDatabase,
	insertBook,
	insertChapter,
	insertPassage,
	insertPassageEmbedding,
	insertSummaryEmbedding,
	type Passage,
	type PassageSearchOptions,
	type PassageWithContext,
	type PassageWithScore,
	rollbackBookTransaction,
	runInBookTransaction,
	searchBooks,
	searchConcepts,
	searchPassages,
	searchPassagesText,
	updateBook,
	updateChapter,
} from "./books/index.js";

// ============================================================================
// Quran
// ============================================================================

export {
	closeQuranDatabase,
	getAllVerses,
	getParseStats,
	getQuranStats,
	getSurah,
	getVerse,
	initQuranDatabase,
	insertVerse,
	insertVerseEmbedding,
	parseQuranText,
	type QuranStats,
	type QuranVerse,
	type StoredVerse,
	searchVerses,
	searchVersesSemantic,
	type VerseWithScore,
} from "./quran/index.js";
