import type { Command } from "commander";
import { registerBookSearchCommand } from "./book-search.js";
import { registerBookStatsCommand } from "./book-stats.js";
import { registerFixMetadataCommand } from "./fix-metadata.js";
import { registerImportArabicCommand } from "./import-arabic.js";
import { registerImportBookCommand } from "./import-book.js";
import { registerImportBooksCommand } from "./import-books.js";
import { registerImportNorseCommand } from "./import-norse.js";
import { registerImportQuranCommand } from "./import-quran.js";
import { registerImportStatusCommand } from "./import-status.js";
import { registerImportUrlCommand } from "./import-url.js";
import { registerImportUrlsCommand } from "./import-urls.js";
import { registerQuranSearchCommand } from "./quran-search.js";
import { registerQuranStatsCommand } from "./quran-stats.js";
import { registerSearchCommand } from "./search.js";
import { registerStatsCommand } from "./stats.js";
import { registerVerifyResearchCommand } from "./verify-research.js";

/**
 * Register all CLI commands on the program
 */
export function registerAllCommands(program: Command): void {
	// Quote import commands
	registerImportUrlCommand(program);
	registerImportUrlsCommand(program);
	registerImportStatusCommand(program);
	registerImportArabicCommand(program);
	registerImportNorseCommand(program);

	// Quran commands
	registerImportQuranCommand(program);
	registerQuranStatsCommand(program);
	registerQuranSearchCommand(program);

	// Book RAG commands
	registerImportBookCommand(program);
	registerImportBooksCommand(program);
	registerBookStatsCommand(program);
	registerBookSearchCommand(program);

	// Search and stats
	registerSearchCommand(program);
	registerStatsCommand(program);

	// Utilities
	registerFixMetadataCommand(program);
	registerVerifyResearchCommand(program);
}
