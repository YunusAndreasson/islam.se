import {
	closeBookDatabase,
	getBook,
	summarizeAllUnsummarized,
	summarizeExistingBook,
} from "@islam-se/quotes";
import type { Command } from "commander";

export function registerSummarizeBooksCommand(program: Command): void {
	program
		.command("summarize-books")
		.description("Generate summaries for existing books (backfill --summarize)")
		.option("--book-id <id>", "Summarize a specific book by ID")
		.option("--all", "Summarize all books without summaries")
		.option("--max-chapters <n>", "Skip books with more than N chapters", "200")
		.action(async (options: { bookId?: string; all?: boolean; maxChapters?: string }) => {
			try {
				if (options.bookId) {
					const id = Number.parseInt(options.bookId, 10);
					const book = getBook(id);
					if (!book) {
						console.error(`Book ID ${id} not found.`);
						process.exit(1);
					}
					console.log(`\n📚 Summarizing: "${book.title}" by ${book.author}\n`);
					const result = await summarizeExistingBook(id, {
						onProgress: (msg) => console.log(`   ${msg}`),
					});
					if (!result.success) {
						console.error(`\n❌ Failed: ${result.error}`);
						process.exit(1);
					}
				} else if (options.all) {
					const maxChapters = options.maxChapters
						? Number.parseInt(options.maxChapters, 10)
						: undefined;
					console.log(
						`\n📚 Summarizing all unsummarized books...${maxChapters ? ` (max ${maxChapters} chapters)` : ""}\n`,
					);
					const result = await summarizeAllUnsummarized({
						onProgress: (msg) => console.log(msg),
						maxChapters,
					});
					console.log(`\n${"─".repeat(60)}`);
					console.log("📊 Summary:");
					console.log(`   Summarized: ${result.summarized}`);
					console.log(`   Skipped: ${result.skipped}`);
					console.log(`   Failed: ${result.failed}`);
				} else {
					console.error("Specify --book-id <id> or --all");
					process.exit(1);
				}

				closeBookDatabase();
			} catch (error) {
				console.error("Error:", error instanceof Error ? error.message : error);
				process.exit(1);
			}
		});
}
