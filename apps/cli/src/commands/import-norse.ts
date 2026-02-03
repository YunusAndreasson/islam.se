import {
	closeDatabase,
	extractNorseQuotes,
	fetchText,
	generateLocalEmbeddings,
	initDatabase,
	insertEmbedding,
	insertQuote,
	saveNorseExtractionResult,
} from "@islam-se/quotes";
import type { Command } from "commander";
import {
	createInterruptHandler,
	markUrlAsDone,
	parseUrlFile,
	resetUrlFile,
	resolvePath,
} from "../utils/index.js";

export function registerImportNorseCommand(program: Command): void {
	program
		.command("import-norse")
		.description("Import Norse saga quotes from Gutenberg texts (resumable)")
		.argument("<file>", "File containing Gutenberg URLs (one per line)")
		.option("--reset", "Reset all done markers and start fresh")
		.option("--delay <seconds>", "Delay between URLs in seconds (default: 90)", "90")
		.action(async (fileArg: string, options: { reset?: boolean; delay: string }) => {
			const file = resolvePath(fileArg);

			if (options.reset) {
				resetUrlFile(file);
				console.log("Reset all done markers. Run again without --reset to import.\n");
				return;
			}

			const interrupt = createInterruptHandler();
			interrupt.attach();

			try {
				const { pending, done, total } = parseUrlFile(file);

				console.log(`\n Norse Saga Import Status:`);
				console.log(`   Total URLs: ${total}`);
				console.log(`   Already done: ${done.length}`);
				console.log(`   Remaining: ${pending.length}\n`);

				if (pending.length === 0) {
					console.log("All URLs have been imported!\n");
					return;
				}

				console.log(`Starting import of ${pending.length} Norse texts...\n`);
				console.log("-".repeat(60));

				for (let i = 0; i < pending.length; i++) {
					if (interrupt.state.interrupted) {
						console.log(`\nStopped. ${pending.length - i} URLs remaining.\n`);
						break;
					}

					const url = pending[i];
					if (!url) continue;

					const progress = `[${done.length + i + 1}/${total}]`;
					console.log(`\n${progress} ${url}`);

					try {
						// Fetch from Gutenberg
						const result = await fetchText(url);
						console.log(`   ${result.cached ? "Cached" : "Downloaded"}: ${result.filename}`);

						// Extract quotes
						console.log("   Extracting Norse quotes with Claude...");
						const extraction = await extractNorseQuotes(result.text, url, undefined, (msg) =>
							console.log(`      ${msg}`),
						);
						console.log(`   Found ${extraction.quotes.length} unique quotes`);

						// Save extraction
						saveNorseExtractionResult(extraction, result.filename);

						// Store in database
						initDatabase();
						const quotesToEmbed: { id: number; text: string }[] = [];
						let skipped = 0;

						console.log("   Storing quotes...");
						for (const quote of extraction.quotes) {
							if (!quote) continue;
							const quoteId = insertQuote(quote, {
								sourceUrl: url,
								language: "en",
								sourceType: "gutenberg",
							});
							if (quoteId !== null) {
								quotesToEmbed.push({ id: quoteId, text: quote.text });
							} else {
								skipped++;
							}
						}

						// Batch generate embeddings
						if (quotesToEmbed.length > 0) {
							console.log(`   Generating ${quotesToEmbed.length} embeddings in batch...`);
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

						console.log(`   Stored: ${quotesToEmbed.length}, Skipped: ${skipped}`);

						markUrlAsDone(file, url);
						console.log("   Marked as done");

						const delaySeconds = Number.parseInt(options.delay, 10);
						if (i < pending.length - 1 && delaySeconds > 0 && !interrupt.state.interrupted) {
							console.log(`   Waiting ${delaySeconds}s...`);
							await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
						}
					} catch (error) {
						console.error(`   Error: ${error instanceof Error ? error.message : error}`);
						console.log("   URL not marked as done - will retry on next run");
					}
				}

				closeDatabase();

				if (!interrupt.state.interrupted) {
					console.log(`\n${"-".repeat(60)}`);
					console.log("All done!\n");
				}
			} catch (error) {
				console.error("Error:", error instanceof Error ? error.message : error);
				process.exit(1);
			} finally {
				interrupt.detach();
			}
		});
}
