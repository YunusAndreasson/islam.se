// Fetcher

// Database
export {
	closeDatabase,
	type DatabaseStats,
	getAllQuotes,
	getQuote,
	getStats,
	type InsertQuoteOptions,
	initDatabase,
	insertEmbedding,
	insertQuote,
	type QuoteWithScore,
	type StoredQuote,
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
export { type FetchResult, fetchText, fetchTexts } from "./fetcher.js";

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
