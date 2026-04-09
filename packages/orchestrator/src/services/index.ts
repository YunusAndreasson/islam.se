/**
 * Orchestrator services - integrations with quote and book databases
 */

// Article publisher
export {
	ArticlePublisher,
	type PublishedArticle,
	parseFrontmatter,
} from "./article-publisher.js";
// Book service
export {
	type BookSearchOptions,
	type BookSearchResult,
	formatBooksForPrompt,
	formatBooksLean,
	hasBookContent,
	passagesToResearchFormat,
	searchBooksComprehensive,
	searchBooksForBrilliance,
} from "./book-service.js";
// Ideation service
export {
	type EnrichedIdea,
	type EnrichedIdeationOutput,
	type EnrichedQuote,
	type Idea,
	type IdeaProductionStatus,
	type IdeationOutput,
	IdeationService,
	type IdeationServiceOptions,
} from "./ideation-service.js";
// Podcast service
export { type PodcastResult, PodcastService } from "./podcast-service.js";
// Quote service
export {
	formatQuotesForPrompt,
	formatQuotesLean,
	type QuoteSearchOptions,
	type QuoteSearchResult,
	quotesToResearchFormat,
	searchQuotesComprehensive,
	searchQuotesForBrilliance,
} from "./quote-service.js";
// Quran service
export {
	formatQuranForPrompt,
	formatQuranLean,
	searchQuranComprehensive,
} from "./quran-service.js";
