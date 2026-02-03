import {
	closeDatabase,
	extractArabicQuotes,
	generateLocalEmbeddings,
	initDatabase,
	insertEmbedding,
	insertQuote,
	parseOpenITIUri,
	saveArabicExtractionResult,
} from "@islam-se/quotes";
import type { Command } from "commander";
import {
	createInterruptHandler,
	markUrlAsDone,
	parseUrlFile,
	resetUrlFile,
	resolvePath,
} from "../utils/index.js";

export function registerImportArabicCommand(program: Command): void {
	program
		.command("import-arabic")
		.description("Import Arabic quotes from OpenITI texts (resumable)")
		.argument("<file>", "File containing OpenITI URLs (one per line)")
		.option("--reset", "Reset all done markers and start fresh")
		.option("--delay <seconds>", "Delay between URLs in seconds (default: 30)", "30")
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

				console.log(`\n📚 Arabic Import Status:`);
				console.log(`   Total URLs: ${total}`);
				console.log(`   Already done: ${done.length}`);
				console.log(`   Remaining: ${pending.length}\n`);

				if (pending.length === 0) {
					console.log("✅ All URLs have been imported!\n");
					return;
				}

				console.log(`Starting import of ${pending.length} Arabic texts...\n`);
				console.log("─".repeat(60));

				for (let i = 0; i < pending.length; i++) {
					if (interrupt.state.interrupted) {
						console.log(`\n⏸️  Stopped. ${pending.length - i} URLs remaining.\n`);
						break;
					}

					const url = pending[i];
					if (!url) continue;

					const progress = `[${done.length + i + 1}/${total}]`;
					const meta = parseOpenITIUri(url);
					console.log(`\n${progress} 📖 ${meta.author} - ${meta.title}`);
					console.log(`   ${url}`);

					try {
						// Fetch from GitHub
						console.log("   ⬇️  Fetching from OpenITI...");
						const response = await fetch(url);
						if (!response.ok) {
							throw new Error(`HTTP ${response.status}: ${response.statusText}`);
						}
						const text = await response.text();
						console.log(`   📄 Downloaded ${text.length} characters`);

						// Extract quotes
						console.log("   🤖 Extracting Arabic quotes with Claude...");
						const extraction = await extractArabicQuotes(text, url, meta, (msg) =>
							console.log(`      ${msg}`),
						);
						console.log(`   📝 Found ${extraction.quotes.length} unique quotes`);

						// Save extraction
						const filename = url.split("/").pop() || "arabic-quotes";
						saveArabicExtractionResult(extraction, filename);

						// Store in database
						initDatabase();
						const quotesToEmbed: { id: number; text: string }[] = [];
						let skipped = 0;

						console.log("   💾 Storing quotes...");
						for (const quote of extraction.quotes) {
							if (!quote) continue;
							const quoteId = insertQuote(quote, {
								sourceUrl: url,
								language: "ar",
								sourceType: "openiti",
							});
							if (quoteId !== null) {
								quotesToEmbed.push({ id: quoteId, text: quote.text });
							} else {
								skipped++;
							}
						}

						// Batch generate embeddings
						if (quotesToEmbed.length > 0) {
							console.log(`   🔢 Generating ${quotesToEmbed.length} embeddings in batch...`);
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

						console.log(`   ✅ Stored: ${quotesToEmbed.length}, Skipped: ${skipped}`);

						markUrlAsDone(file, url);
						console.log("   ✓ Marked as done");

						const delaySeconds = Number.parseInt(options.delay, 10);
						if (i < pending.length - 1 && delaySeconds > 0 && !interrupt.state.interrupted) {
							console.log(`   ⏳ Waiting ${delaySeconds}s...`);
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
