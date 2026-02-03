import { closeBookDatabase, importBooksFromFile } from "@islam-se/quotes";
import type { Command } from "commander";
import { resolvePath } from "../utils/index.js";

export function registerImportBooksCommand(program: Command): void {
	program
		.command("import-books")
		.description("Import multiple books from a URL file (resumable)")
		.argument("<file>", "File containing URLs (one per line)")
		.option("--summarize", "Enable Claude summarization (uses API)")
		.option("--language <lang>", "Force language for all books: sv, ar, en")
		.action(
			async (fileArg: string, options: { summarize?: boolean; language?: "sv" | "ar" | "en" }) => {
				const file = resolvePath(fileArg);

				try {
					console.log(`\n📚 Importing books from: ${file}\n`);

					const result = await importBooksFromFile(file, {
						language: options.language,
						skipSummarization: !options.summarize,
						onProgress: (msg) => console.log(msg),
					});

					console.log(`\n${"─".repeat(60)}`);
					console.log("📊 Import Summary:");
					console.log(`   Imported: ${result.imported}`);
					console.log(`   Skipped (already done): ${result.skipped}`);
					console.log(`   Failed: ${result.failed}`);

					closeBookDatabase();
				} catch (error) {
					console.error("Error:", error instanceof Error ? error.message : error);
					process.exit(1);
				}
			},
		);
}
