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
import {
	createInterruptHandler,
	markUrlAsDone,
	parseUrlFile,
	resetUrlFile,
	resolvePath,
} from "../utils/index.js";

export function registerImportUrlsCommand(program: Command): void {
	program
		.command("import-urls")
		.description("Import quotes from a file containing URLs (resumable)")
		.argument("<file>", "File containing URLs (one per line)")
		.option("--reset", "Reset all done markers and start fresh")
		.option("--delay <seconds>", "Delay between URLs in seconds (default: 90)", "90")
		.action(async (fileArg: string, options: { reset?: boolean; delay: string }) => {
			const file = resolvePath(fileArg);

			// Handle reset option
			if (options.reset) {
				resetUrlFile(file);
				console.log("Reset all done markers. Run again without --reset to import.\n");
				return;
			}

			const interrupt = createInterruptHandler();
			interrupt.attach();

			try {
				const { pending, done, total } = parseUrlFile(file);

				console.log(`\n📚 URL Import Status:`);
				console.log(`   Total URLs: ${total}`);
				console.log(`   Already done: ${done.length}`);
				console.log(`   Remaining: ${pending.length}\n`);

				if (pending.length === 0) {
					console.log("✅ All URLs have been imported!\n");
					console.log("Use --reset flag to clear done markers and reimport.");
					return;
				}

				console.log(`Starting import of ${pending.length} URLs...\n`);
				console.log("─".repeat(60));

				for (let i = 0; i < pending.length; i++) {
					if (interrupt.state.interrupted) {
						console.log(`\n⏸️  Stopped. ${pending.length - i} URLs remaining.`);
						console.log(`   Run the command again to resume.\n`);
						break;
					}

					const url = pending[i];
					if (!url) continue;

					const progress = `[${done.length + i + 1}/${total}]`;
					console.log(`\n${progress} 📖 ${url}`);

					try {
						// Fetch
						const result = await fetchText(url);
						console.log(`   ${result.cached ? "📁 Cached" : "⬇️  Downloaded"}: ${result.filename}`);

						// Extract (use metadata from Gutenberg header if available)
						console.log("   🤖 Extracting quotes with Claude...");
						if (result.metadata?.author) {
							console.log(`      Author: ${result.metadata.author}`);
						}
						if (result.metadata?.title) {
							console.log(`      Title: ${result.metadata.title}`);
						}
						const extraction = await extractQuotes(result.text, url, result.metadata, (msg) =>
							console.log(`      ${msg}`),
						);
						console.log(`   📝 Found ${extraction.quotes.length} unique quotes`);

						// Save extraction
						saveExtractionResult(extraction, result.filename);

						// Store in database
						initDatabase();

						// First pass: insert quotes and collect those that need embeddings
						const quotesToEmbed: { id: number; text: string }[] = [];
						let skipped = 0;

						console.log("   💾 Storing quotes...");
						for (const quote of extraction.quotes) {
							if (!quote) continue;
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

						// Batch generate embeddings (much cheaper - 1 API call instead of N)
						if (quotesToEmbed.length > 0) {
							console.log(`   🔢 Generating ${quotesToEmbed.length} embeddings in batch...`);
							const texts = quotesToEmbed.map((q) => q.text);
							const embeddings = await generateLocalEmbeddings(texts);

							// Store embeddings
							for (let j = 0; j < quotesToEmbed.length; j++) {
								const quote = quotesToEmbed[j];
								const embedding = embeddings[j];
								if (quote && embedding) {
									insertEmbedding(quote.id, embedding);
								}
							}
						}

						console.log(`   ✅ Stored: ${quotesToEmbed.length}, Skipped (duplicates): ${skipped}`);

						// Mark as done in the file
						markUrlAsDone(file, url);
						console.log("   ✓ Marked as done");

						// Delay before next URL to avoid rate limits
						const delaySeconds = Number.parseInt(options.delay, 10);
						if (i < pending.length - 1 && delaySeconds > 0 && !interrupt.state.interrupted) {
							console.log(
								`   ⏳ Waiting ${delaySeconds}s before next URL (rate limit protection)...`,
							);
							await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
						}
					} catch (error) {
						console.error(`   ❌ Error: ${error instanceof Error ? error.message : error}`);
						console.log("   ⚠️  URL not marked as done - will retry on next run");
					}
				}

				closeDatabase();

				if (!interrupt.state.interrupted) {
					console.log(`\n${"─".repeat(60)}`);
					console.log("🎉 All done!\n");
				}
			} catch (error) {
				console.error("Error:", error instanceof Error ? error.message : error);
				process.exit(1);
			} finally {
				interrupt.detach();
			}
		});
}
