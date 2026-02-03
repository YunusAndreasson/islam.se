/**
 * Orchestrator services - integrations with quote and book databases
 */

// Article publisher
export {
	type ArticleIndex,
	ArticlePublisher,
	type PublishedArticle,
} from "./article-publisher.js";
// Book service
export {
	type BookSearchOptions,
	type BookSearchResult,
	formatBooksForPrompt,
	hasBookContent,
	passagesToResearchFormat,
	searchBooksComprehensive,
} from "./book-service.js";
// Ideation service
export {
	type EnrichedIdea,
	type EnrichedIdeationOutput,
	type EnrichedQuote,
	enrichIdeasWithQuotes,
	generateIdeas,
	type Idea,
	type IdeaProductionStatus,
	type IdeationOutput,
	IdeationService,
	type IdeationServiceOptions,
} from "./ideation-service.js";
// Quote service
export {
	formatQuotesForPrompt,
	type QuoteSearchOptions,
	type QuoteSearchResult,
	quotesToResearchFormat,
	searchQuotesComprehensive,
} from "./quote-service.js";
