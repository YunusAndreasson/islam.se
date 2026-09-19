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
	rebuildFts,
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
	searchQuotesHybrid,
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
	type BookPassageHit,
	type BookPassageSearchOptions,
	type BookPassageSearchResult,
	type BookRef,
	type BookWithScore,
	backfillPassageEmbeddings,
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
	cleanOrphanEmbeddings,
	// Pages and display text
	cleanPassageText,
	closeBookDatabase,
	commitBookTransaction,
	deleteBook,
	detectChapters,
	estimatePassageCount,
	findBooks,
	findPageMarkers,
	foldName,
	formatPageRef,
	formatPageSpan,
	getAllBooks,
	getBook,
	getBookByUrl,
	getBookInventory,
	getBookPassages,
	getBookStats,
	getChaptersByBook,
	getPassage,
	getPassagePages,
	getPassagesByBook,
	getPassagesByChapter,
	getPassagesWithoutEmbedding,
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
	type OrphanCleanupResult,
	type PageMarker,
	type Passage,
	type PassagePages,
	type PassageSearchOptions,
	type PassageSlice,
	type PassageWithContext,
	type PassageWithScore,
	rebuildBooksFts,
	resolvePassagePages,
	rollbackBookTransaction,
	runInBookTransaction,
	searchBookPassages,
	searchBooks,
	searchConcepts,
	searchPassages,
	searchPassagesText,
	summarizeAllUnsummarized,
	summarizeExistingBook,
	type TextSearchOptions,
	updateBook,
	updateChapter,
} from "./books/index.js";

// ============================================================================
// Quran
// ============================================================================

export {
	cleanVerseText,
	closeQuranDatabase,
	deleteAllVerseEmbeddings,
	getAllVerses,
	getBernstromRange,
	getBernstromVerse,
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
	rebuildQuranFts,
	resolveSurahNumber,
	type StoredVerse,
	SURAH_NAMES,
	type SurahName,
	searchVerses,
	searchVersesSemantic,
	type VerseWithScore,
} from "./quran/index.js";

// ============================================================================
// Models
// ============================================================================

export {
	getModelId,
	MODEL_MAP,
	type ModelId,
	type ModelTier,
	type PipelineModelTier,
} from "./models.js";
