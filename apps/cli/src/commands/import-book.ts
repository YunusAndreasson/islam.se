import { closeBookDatabase, importBook } from "@islam-se/quotes";
import type { Command } from "commander";

export function registerImportBookCommand(program: Command): void {
	program
		.command("import-book")
		.description("Import a book into the RAG database (free local embeddings)")
		.argument("<url>", "URL or local file path to import")
		.option("--title <title>", "Override detected title")
		.option("--author <author>", "Override detected author")
		.option("--language <lang>", "Language: sv, ar, en (default: auto-detect)")
		.option("--summarize", "Enable Claude summarization (uses API, adds concept search)")
		.option("--force", "Re-import even if book already exists")
		.action(
			async (
				url: string,
				options: {
					title?: string;
					author?: string;
					language?: "sv" | "ar" | "en";
					summarize?: boolean;
					force?: boolean;
				},
			) => {
				try {
					console.log(`\n📚 Importing book: ${url}\n`);

					const result = await importBook(url, {
						title: options.title,
						author: options.author,
						language: options.language,
						skipSummarization: !options.summarize,
						forceReimport: options.force,
						onProgress: (msg) => console.log(`   ${msg}`),
					});

					if (result.success) {
						console.log("\n✅ Import complete!");
						console.log(`   Book ID: ${result.bookId}`);
						console.log(`   Chapters: ${result.chaptersImported}`);
						console.log(`   Passages: ${result.passagesImported}`);
					} else {
						console.error(`\n❌ Import failed: ${result.error}`);
						process.exit(1);
					}

					closeBookDatabase();
				} catch (error) {
					console.error("Error:", error instanceof Error ? error.message : error);
					process.exit(1);
				}
			},
		);
}
