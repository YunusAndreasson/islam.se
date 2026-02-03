import {
	closeDatabase,
	extractQuotes,
	fetchText,
	generateLocalEmbeddings,
	initDatabase,
	insertEmbedding,
	insertQuote,
	saveExtractionResult,
} from "@islam-se/quotes";
import type { Command } from "commander";

export function registerImportUrlCommand(program: Command): void {
	program
		.command("import-url")
		.description("Import quotes from a single Gutenberg URL")
		.argument("<url>", "Gutenberg URL to import")
		.option("--author <author>", "Author name (if known)")
		.option("--title <title>", "Work title (if known)")
		.action(async (url: string, options: { author?: string; title?: string }) => {
			try {
				console.log(`Fetching: ${url}`);
				const result = await fetchText(url);
				console.log(`  ${result.cached ? "Cached" : "Downloaded"}: ${result.filename}`);
				console.log(`  Text length: ${result.text.length} characters`);

				console.log("\nExtracting quotes with Claude...");
				const extraction = await extractQuotes(
					result.text,
					url,
					{
						author: options.author,
						title: options.title,
					},
					(msg) => console.log(`  ${msg}`),
				);
				console.log(`  Total: ${extraction.quotes.length} unique quotes`);

				// Save extraction for review
				const outputPath = saveExtractionResult(extraction, result.filename);
				console.log(`  Saved to: ${outputPath}`);

				// Store in database with embeddings
				console.log("\nStoring in database with embeddings...");
				initDatabase();

				// First pass: insert quotes and collect those that need embeddings
				const quotesToEmbed: { id: number; text: string }[] = [];
				let skipped = 0;

				for (const quote of extraction.quotes) {
					const quoteId = insertQuote(quote, {
						sourceUrl: url,
						language: "sv",
						sourceType: "gutenberg",
					});
					if (quoteId !== null) {
						quotesToEmbed.push({ id: quoteId, text: quote.text });
					} else {
						skipped++;
					}
				}

				// Batch generate embeddings (1 API call instead of N)
				if (quotesToEmbed.length > 0) {
					console.log(`  Generating ${quotesToEmbed.length} embeddings in batch...`);
					const texts = quotesToEmbed.map((q) => q.text);
					const embeddings = await generateLocalEmbeddings(texts);

					for (let j = 0; j < quotesToEmbed.length; j++) {
						const quote = quotesToEmbed[j];
						const embedding = embeddings[j];
						if (quote && embedding) {
							insertEmbedding(quote.id, embedding);
						}
					}
				}

				console.log(`  Stored: ${quotesToEmbed.length}, Skipped (duplicates): ${skipped}`);

				closeDatabase();
				console.log("\nDone!");
			} catch (error) {
				console.error("Error:", error instanceof Error ? error.message : error);
				process.exit(1);
			}
		});
}
