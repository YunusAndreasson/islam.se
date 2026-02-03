/**
 * Quote extraction modules for different languages
 */

// Arabic extraction
export {
	type ArabicExtractionResult,
	ArabicExtractionResultSchema,
	type ArabicQuote,
	ArabicQuoteSchema,
	cleanOpenITIText,
	extractArabicQuotes,
	parseOpenITIUri,
	saveArabicExtractionResult,
} from "./arabic.js";
// Norse extraction
export {
	extractNorseQuotes,
	type NorseExtractionResult,
	NorseExtractionResultSchema,
	type NorseQuote,
	NorseQuoteSchema,
	saveNorseExtractionResult,
} from "./norse.js";
// Swedish extraction
export {
	type ExtractionResult,
	ExtractionResultSchema,
	extractQuotes,
	type Quote,
	QuoteSchema,
	saveExtractionResult,
} from "./swedish.js";
