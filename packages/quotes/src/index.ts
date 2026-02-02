// Fetcher

// Book Chunking
export {
	type ChapterInfo,
	type ChunkInfo,
	type ChunkingOptions,
	type ChunkingResult,
	chunkBook,
	chunkText,
	detectChapters,
	estimatePassageCount,
} from "./book-chunker.js";
// Book Database (RAG)
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
} from "./book-database.js";
// Book Import
export {
	type ImportOptions,
	type ImportResult,
	importBook,
	importBooksFromFile,
} from "./book-importer.js";
// Book Search
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
} from "./book-search.js";
// Database
export {
	closeDatabase,
	type DatabaseStats,
	getAllQuotes,
	getQuote,
	getStats,
	getUnknownAuthorSourceUrls,
	type InsertQuoteOptions,
	initDatabase,
	insertEmbedding,
	insertQuote,
	type QuoteWithScore,
	type StoredQuote,
	updateQuoteMetadataBySource,
} from "./database.js";
// Embeddings (OpenAI - requires API key)
export { generateEmbedding, generateEmbeddings, getEmbeddingDimensions } from "./embeddings.js";
// Embeddings (Local - no API key required)
export {
	generateLocalEmbedding,
	generateLocalEmbeddings,
	getLocalEmbeddingDimensions,
	preloadLocalModel,
} from "./embeddings-local.js";
// Extractor (Swedish)
export {
	type ExtractionResult,
	ExtractionResultSchema,
	extractQuotes,
	type Quote,
	QuoteSchema,
	saveExtractionResult,
} from "./extractor.js";
// Extractor (Arabic)
export {
	type ArabicExtractionResult,
	ArabicExtractionResultSchema,
	type ArabicQuote,
	ArabicQuoteSchema,
	cleanOpenITIText,
	extractArabicQuotes,
	parseOpenITIUri,
	saveArabicExtractionResult,
} from "./extractor-arabic.js";
// Extractor (Norse)
export {
	extractNorseQuotes,
	type NorseExtractionResult,
	NorseExtractionResultSchema,
	type NorseQuote,
	NorseQuoteSchema,
	saveNorseExtractionResult,
} from "./extractor-norse.js";
export {
	extractMetadataFromUrl,
	type FetchResult,
	fetchText,
	fetchTexts,
	type TextMetadata,
} from "./fetcher.js";
// Quran Database
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
} from "./quran-database.js";
// Quran Extractor
export {
	getParseStats,
	parseQuranText,
} from "./quran-extractor.js";
// Search
export {
	type FormattedQuote,
	type FormattedQuoteWithId,
	findByCategory,
	findQuotesByFilter,
	findQuotesForLLM,
	findQuotesForTopic,
	// No-API-required functions
	findQuotesLocal,
	findQuotesPaired,
	findSimilarQuotes,
	getCategories,
	// LLM-optimized functions
	getInventory,
	getRandomQuote,
	type Inventory,
	searchQuotes,
	searchQuotesByText,
	searchQuotesText,
} from "./search.js";
