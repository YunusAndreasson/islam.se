/**
 * Orchestrator services - integrations with quote and book databases
 */

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
