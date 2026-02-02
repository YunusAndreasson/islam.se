#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SourceValidator } from "@islam-se/orchestrator";
import {
	closeBookDatabase,
	closeDatabase,
	closeQuranDatabase,
	extractArabicQuotes,
	extractMetadataFromUrl,
	extractNorseQuotes,
	extractQuotes,
	fetchText,
	findQuotesLocal,
	generateLocalEmbedding,
	generateLocalEmbeddings,
	getBookStats,
	getParseStats,
	getQuranStats,
	getStats,
	getUnknownAuthorSourceUrls,
	importBook,
	importBooksFromFile,
	initBookDatabase,
	initDatabase,
	initQuranDatabase,
	insertEmbedding,
	insertQuote,
	insertVerse,
	insertVerseEmbedding,
	parseOpenITIUri,
	parseQuranText,
	saveArabicExtractionResult,
	saveExtractionResult,
	saveNorseExtractionResult,
	searchBooks,
	searchVerses,
	searchVersesSemantic,
	updateQuoteMetadataBySource,
} from "@islam-se/quotes";
import { Command } from "commander";
import { config } from "dotenv";

// Load environment variables from project root
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..", "..", "..");
config({ path: join(PROJECT_ROOT, ".env") });

/**
 * Resolve a file path - if relative, resolve from PROJECT_ROOT
 */
function resolvePath(filePath: string): string {
	if (filePath.startsWith("/")) {
		return filePath;
	}
	return join(PROJECT_ROOT, filePath);
}

const program = new Command();

program
	.name("islam-cli")
	.description("CLI for managing the Islam.se quote database")
	.version("0.0.1");

/**
 * Import quotes from a single Gutenberg URL
 */
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

/**
 * Mark a URL as done in the file by prefixing its line with "# DONE "
 */
function markUrlAsDone(filePath: string, url: string): void {
	const content = readFileSync(filePath, "utf-8");
	const lines = content.split("\n");
	const updatedLines = lines.map((line) => {
		if (line.trim() === url) {
			return `# DONE ${line}`;
		}
		return line;
	});
	writeFileSync(filePath, updatedLines.join("\n"), "utf-8");
}

/**
 * Parse URL file and return pending/done URLs
 */
function parseUrlFile(filePath: string): { pending: string[]; done: string[]; total: number } {
	const content = readFileSync(filePath, "utf-8");
	const lines = content.split("\n");

	const pending: string[] = [];
	const done: string[] = [];

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		// Check for done marker
		if (trimmed.startsWith("# DONE ")) {
			const url = trimmed.slice(7).trim();
			if (url.startsWith("http")) {
				done.push(url);
			}
		} else if (trimmed.startsWith("http")) {
			pending.push(trimmed);
		}
	}

	return { pending, done, total: pending.length + done.length };
}

/**
 * Import quotes from a file containing URLs (one per line)
 * Marks URLs as done after successful import, allowing resume on failure
 */
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
			const content = readFileSync(file, "utf-8");
			const resetContent = content.replace(/^# DONE /gm, "");
			writeFileSync(file, resetContent, "utf-8");
			console.log("Reset all done markers. Run again without --reset to import.\n");
			return;
		}

		let interrupted = false;

		// Handle Ctrl+C gracefully
		const handleInterrupt = () => {
			if (interrupted) {
				console.log("\nForce quit.");
				process.exit(1);
			}
			interrupted = true;
			console.log("\n\nInterrupted! Finishing current URL then stopping...");
			console.log("(Press Ctrl+C again to force quit)\n");
		};
		process.on("SIGINT", handleInterrupt);

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
				if (interrupted) {
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
					if (i < pending.length - 1 && delaySeconds > 0 && !interrupted) {
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

			if (!interrupted) {
				console.log(`\n${"─".repeat(60)}`);
				console.log("🎉 All done!\n");
			}
		} catch (error) {
			console.error("Error:", error instanceof Error ? error.message : error);
			process.exit(1);
		} finally {
			process.off("SIGINT", handleInterrupt);
		}
	});

/**
 * Show import status for a URL file
 */
program
	.command("import-status")
	.description("Show import progress for a URL file")
	.argument("<file>", "File containing URLs")
	.action((fileArg: string) => {
		const file = resolvePath(fileArg);
		try {
			const { pending, done, total } = parseUrlFile(file);

			console.log(`\n📚 Import Status for: ${fileArg}\n`);
			console.log(`   Total URLs:    ${total}`);
			console.log(`   ✅ Completed:  ${done.length}`);
			console.log(`   ⏳ Remaining:  ${pending.length}`);

			if (total > 0) {
				const percent = Math.round((done.length / total) * 100);
				const bar = "█".repeat(Math.floor(percent / 5)) + "░".repeat(20 - Math.floor(percent / 5));
				console.log(`\n   [${bar}] ${percent}%`);
			}

			if (pending.length > 0) {
				console.log(`\n   Next up:`);
				for (let i = 0; i < Math.min(3, pending.length); i++) {
					console.log(`   ${i + 1}. ${pending[i]}`);
				}
				if (pending.length > 3) {
					console.log(`   ... and ${pending.length - 3} more`);
				}
			}

			console.log();
		} catch (error) {
			console.error("Error:", error instanceof Error ? error.message : error);
			process.exit(1);
		}
	});

/**
 * Import Arabic quotes from OpenITI texts
 */
program
	.command("import-arabic")
	.description("Import Arabic quotes from OpenITI texts (resumable)")
	.argument("<file>", "File containing OpenITI URLs (one per line)")
	.option("--reset", "Reset all done markers and start fresh")
	.option("--delay <seconds>", "Delay between URLs in seconds (default: 30)", "30")
	.action(async (fileArg: string, options: { reset?: boolean; delay: string }) => {
		const file = resolvePath(fileArg);

		if (options.reset) {
			const content = readFileSync(file, "utf-8");
			const resetContent = content.replace(/^# DONE /gm, "");
			writeFileSync(file, resetContent, "utf-8");
			console.log("Reset all done markers. Run again without --reset to import.\n");
			return;
		}

		let interrupted = false;
		const handleInterrupt = () => {
			if (interrupted) {
				console.log("\nForce quit.");
				process.exit(1);
			}
			interrupted = true;
			console.log("\n\nInterrupted! Finishing current URL then stopping...");
		};
		process.on("SIGINT", handleInterrupt);

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
				if (interrupted) {
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
					if (i < pending.length - 1 && delaySeconds > 0 && !interrupted) {
						console.log(`   ⏳ Waiting ${delaySeconds}s...`);
						await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
					}
				} catch (error) {
					console.error(`   ❌ Error: ${error instanceof Error ? error.message : error}`);
					console.log("   ⚠️  URL not marked as done - will retry on next run");
				}
			}

			closeDatabase();

			if (!interrupted) {
				console.log(`\n${"─".repeat(60)}`);
				console.log("🎉 All done!\n");
			}
		} catch (error) {
			console.error("Error:", error instanceof Error ? error.message : error);
			process.exit(1);
		} finally {
			process.off("SIGINT", handleInterrupt);
		}
	});

/**
 * Import Norse saga/Edda quotes from Gutenberg texts
 */
program
	.command("import-norse")
	.description("Import Norse saga quotes from Gutenberg texts (resumable)")
	.argument("<file>", "File containing Gutenberg URLs (one per line)")
	.option("--reset", "Reset all done markers and start fresh")
	.option("--delay <seconds>", "Delay between URLs in seconds (default: 90)", "90")
	.action(async (fileArg: string, options: { reset?: boolean; delay: string }) => {
		const file = resolvePath(fileArg);

		if (options.reset) {
			const content = readFileSync(file, "utf-8");
			const resetContent = content.replace(/^# DONE /gm, "");
			writeFileSync(file, resetContent, "utf-8");
			console.log("Reset all done markers. Run again without --reset to import.\n");
			return;
		}

		let interrupted = false;
		const handleInterrupt = () => {
			if (interrupted) {
				console.log("\nForce quit.");
				process.exit(1);
			}
			interrupted = true;
			console.log("\n\nInterrupted! Finishing current URL then stopping...");
		};
		process.on("SIGINT", handleInterrupt);

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
				if (interrupted) {
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
					if (i < pending.length - 1 && delaySeconds > 0 && !interrupted) {
						console.log(`   Waiting ${delaySeconds}s...`);
						await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
					}
				} catch (error) {
					console.error(`   Error: ${error instanceof Error ? error.message : error}`);
					console.log("   URL not marked as done - will retry on next run");
				}
			}

			closeDatabase();

			if (!interrupted) {
				console.log(`\n${"-".repeat(60)}`);
				console.log("All done!\n");
			}
		} catch (error) {
			console.error("Error:", error instanceof Error ? error.message : error);
			process.exit(1);
		} finally {
			process.off("SIGINT", handleInterrupt);
		}
	});

/**
 * Semantic search for quotes (uses local embeddings - no API key required)
 */
program
	.command("search")
	.description("Search quotes semantically")
	.argument("<query>", "Search query")
	.option("-n, --limit <number>", "Number of results", "5")
	.option("--lang <language>", "Filter by language (sv, ar, or en)")
	.action(async (query: string, options: { limit: string; lang?: string }) => {
		try {
			const limit = Number.parseInt(options.limit, 10);
			const language = options.lang as "sv" | "ar" | "en" | undefined;

			console.log(`Searching for: "${query}"\n`);

			initDatabase();
			const results = await findQuotesLocal(query, {
				limit,
				language,
				minStandalone: 1, // Show all quality levels in CLI
			});

			if (results.length === 0) {
				console.log("No results found.");
				closeDatabase();
				return;
			}

			for (let i = 0; i < results.length; i++) {
				const quote = results[i];
				if (!quote) continue;

				console.log(
					`${i + 1}. [Score: ${quote.score.toFixed(3)}] [${quote.tone}] [standalone: ${quote.standalone}/5] [${quote.length}]`,
				);
				console.log(`   "${quote.text}"`);
				console.log(`   ${quote.attribution}`);
				console.log(
					`   Category: ${quote.category} | Keywords: ${quote.keywords?.join(", ") || "none"}`,
				);
				console.log();
			}

			closeDatabase();
		} catch (error) {
			console.error("Error:", error instanceof Error ? error.message : error);
			process.exit(1);
		}
	});

/**
 * Show database statistics
 */
program
	.command("stats")
	.description("Show database statistics")
	.action(() => {
		try {
			initDatabase();
			const stats = getStats();

			console.log("\n📊 Database Statistics\n");
			console.log(`   Total quotes: ${stats.totalQuotes}`);
			console.log(`   Authors: ${stats.authors}`);
			console.log(`   Works: ${stats.works}`);

			console.log("\n📚 By Language:");
			console.log(`   Swedish (sv):  ${stats.byLanguage.swedish}`);
			console.log(`   Arabic (ar):   ${stats.byLanguage.arabic}`);
			console.log(`   Norse (en):    ${stats.byLanguage.norse}`);

			console.log("\n📁 By Source:");
			console.log(`   Gutenberg:     ${stats.bySourceType.gutenberg}`);
			console.log(`   OpenITI:       ${stats.bySourceType.openiti}`);
			if (stats.bySourceType.other > 0) {
				console.log(`   Other:         ${stats.bySourceType.other}`);
			}

			console.log();
			closeDatabase();
		} catch (error) {
			console.error("Error:", error instanceof Error ? error.message : error);
			process.exit(1);
		}
	});

/**
 * Import Quran from extracted text file
 */
program
	.command("import-quran")
	.description("Import Quran verses from extracted text file")
	.argument("[file]", "Path to extracted Quran text file", "./data/extracted/koranen-sv.txt")
	.option("--translator <name>", "Translator name", "Kent Asante Wennerström")
	.option("--embeddings", "Generate embeddings for verses")
	.action(async (fileArg: string, options: { translator: string; embeddings?: boolean }) => {
		const file = resolvePath(fileArg);

		try {
			console.log(`\n📖 Importing Quran from: ${file}\n`);

			// Parse the text file
			console.log("   Parsing Quran text...");
			const verses = parseQuranText(file, options.translator);
			const stats = getParseStats(verses);

			console.log(`   Found ${stats.totalVerses} verses across ${stats.surahs} surahs`);
			console.log(`   Verses with commentary: ${stats.versesWithCommentary}`);

			// Store in database
			console.log("\n   Storing in Quran database...");
			initQuranDatabase();

			let stored = 0;
			let skipped = 0;
			const versesToEmbed: { id: number; text: string }[] = [];

			for (const verse of verses) {
				const verseId = insertVerse(verse);
				if (verseId !== null) {
					stored++;
					if (options.embeddings) {
						versesToEmbed.push({ id: verseId, text: verse.textSwedish });
					}
				} else {
					skipped++;
				}
			}

			console.log(`   Stored: ${stored}, Skipped (duplicates): ${skipped}`);

			// Generate embeddings if requested
			if (options.embeddings && versesToEmbed.length > 0) {
				console.log(`\n   Generating embeddings for ${versesToEmbed.length} verses...`);

				// Process in batches of 100
				const batchSize = 100;
				for (let i = 0; i < versesToEmbed.length; i += batchSize) {
					const batch = versesToEmbed.slice(i, i + batchSize);
					const texts = batch.map((v) => v.text);
					const embeddings = await generateLocalEmbeddings(texts);

					for (let j = 0; j < batch.length; j++) {
						const verse = batch[j];
						const embedding = embeddings[j];
						if (verse && embedding) {
							insertVerseEmbedding(verse.id, embedding);
						}
					}

					const progress = Math.min(i + batchSize, versesToEmbed.length);
					console.log(`   Progress: ${progress}/${versesToEmbed.length}`);
				}
			}

			closeQuranDatabase();

			console.log("\n✅ Quran import complete!\n");
		} catch (error) {
			console.error("Error:", error instanceof Error ? error.message : error);
			process.exit(1);
		}
	});

/**
 * Show Quran database statistics
 */
program
	.command("quran-stats")
	.description("Show Quran database statistics")
	.action(() => {
		try {
			initQuranDatabase();
			const stats = getQuranStats();

			console.log("\n📖 Quran Database Statistics\n");
			console.log(`   Total verses:          ${stats.totalVerses}`);
			console.log(`   Surahs:                ${stats.surahs}`);
			console.log(`   With commentary:       ${stats.versesWithCommentary}`);
			console.log(`   With Arabic text:      ${stats.versesWithArabic}`);
			console.log(`   Translators:           ${stats.translators.join(", ") || "none"}`);
			console.log();

			closeQuranDatabase();
		} catch (error) {
			console.error("Error:", error instanceof Error ? error.message : error);
			process.exit(1);
		}
	});

/**
 * Search Quran verses (semantic search by theme)
 */
program
	.command("quran-search")
	.description("Search Quran verses by theme (semantic search)")
	.argument("<query>", "Search query (theme, concept, or keywords)")
	.option("-n, --limit <number>", "Number of results", "10")
	.option("--text", "Use text search instead of semantic search")
	.action(async (query: string, options: { limit: string; text?: boolean }) => {
		try {
			const limit = Number.parseInt(options.limit, 10);

			console.log(
				`\nSearching Quran for: "${query}"${options.text ? " (text search)" : " (semantic)"}\n`,
			);

			initQuranDatabase();

			let results;
			if (options.text) {
				// Text-based search
				results = searchVerses(query, limit).map((v) => ({ ...v, score: 1 }));
			} else {
				// Semantic search using embeddings
				const queryEmbedding = await generateLocalEmbedding(query);
				results = searchVersesSemantic(queryEmbedding, limit);
			}

			if (results.length === 0) {
				console.log("No results found.");
				closeQuranDatabase();
				return;
			}

			for (const verse of results) {
				const score = "score" in verse ? ` [${(verse.score as number).toFixed(3)}]` : "";
				console.log(
					`📖 ${verse.surahNumber}:${verse.verseNumber} (${verse.surahNameSwedish})${score}`,
				);
				console.log(`   "${verse.textSwedish}"`);
				if (verse.commentary) {
					const shortCommentary =
						verse.commentary.length > 150
							? verse.commentary.slice(0, 150) + "..."
							: verse.commentary;
					console.log(`   💬 ${shortCommentary}`);
				}
				console.log();
			}

			closeQuranDatabase();
		} catch (error) {
			console.error("Error:", error instanceof Error ? error.message : error);
			process.exit(1);
		}
	});

/**
 * Verify URLs in a research JSON file
 */
program
	.command("verify-research")
	.description("Verify that URLs in a research JSON file are valid (not hallucinated)")
	.argument("<file>", "Path to research JSON file")
	.action(async (fileArg: string) => {
		const file = resolvePath(fileArg);

		try {
			console.log(`\n🔍 Verifying URLs in: ${file}\n`);

			const content = readFileSync(file, "utf-8");
			const research = JSON.parse(content);

			if (!research.sources || !Array.isArray(research.sources)) {
				console.error("Error: No sources array found in research file");
				process.exit(1);
			}

			const urls = research.sources.map((s: { url: string }) => s.url);
			console.log(`   Found ${urls.length} URLs to verify\n`);

			const validator = new SourceValidator();
			const result = await validator.verifyUrls(urls);

			// Display results
			console.log("Results:");
			for (const r of result.results) {
				const status = r.exists ? "✅" : "❌";
				const info = r.error || `HTTP ${r.status}`;
				const urlDisplay = r.url.length > 70 ? r.url.substring(0, 67) + "..." : r.url;
				console.log(`   ${status} ${urlDisplay}`);
				console.log(`      ${info}`);
			}

			console.log("\n📊 Summary:");
			console.log(`   Total:    ${result.stats.total}`);
			console.log(`   Valid:    ${result.stats.verified}`);
			console.log(`   Invalid:  ${result.stats.failed}`);

			if (result.stats.failedUrls.length > 0) {
				console.log("\n⚠️  Failed URLs (likely hallucinated):");
				for (const url of result.stats.failedUrls) {
					console.log(`   - ${url}`);
				}
				console.log("\nThese URLs should be removed or replaced with valid sources.");
				process.exit(1);
			} else {
				console.log("\n✅ All URLs verified successfully!\n");
			}
		} catch (error) {
			console.error("Error:", error instanceof Error ? error.message : error);
			process.exit(1);
		}
	});

// ============================================================================
// Book RAG Commands
// ============================================================================

/**
 * Import a single book into the RAG database
 */
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

/**
 * Import multiple books from a file containing URLs
 */
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

				console.log("\n" + "─".repeat(60));
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

/**
 * Search books using hybrid search
 */
program
	.command("book-search")
	.description("Search books semantically (all searches are free - local embeddings)")
	.argument("<query>", "Search query")
	.option("-n, --limit <number>", "Number of passage results", "10")
	.option("--mode <mode>", "Search mode: hybrid, passages, concepts", "hybrid")
	.option("--language <lang>", "Filter by language: sv, ar, en")
	.action(
		async (
			query: string,
			options: { limit: string; mode: string; language?: "sv" | "ar" | "en" },
		) => {
			try {
				const limit = Number.parseInt(options.limit, 10);

				console.log(`\n🔍 Searching books for: "${query}" (mode: ${options.mode})\n`);

				initBookDatabase();

				const results = await searchBooks(query, {
					passageLimit: limit,
					conceptLimit: 5,
					minScore: 0.3,
					language: options.language,
				});

				if (results.combined.length === 0 && results.concepts.length === 0) {
					console.log("No results found.");
					closeBookDatabase();
					return;
				}

				// Show concept matches first
				if (
					(options.mode === "hybrid" || options.mode === "concepts") &&
					results.concepts.length > 0
				) {
					console.log("📚 Relevant Themes:\n");
					for (const concept of results.concepts) {
						const title =
							concept.type === "book"
								? concept.bookTitle
								: `${concept.bookTitle}, Ch. ${concept.chapterNumber}`;
						console.log(`   ${title} [${(concept.score * 100).toFixed(0)}%]`);
						console.log(`   ${concept.summary.slice(0, 100)}...`);
						console.log(`   Key concepts: ${concept.keyConcepts.slice(0, 3).join(", ")}`);
						console.log();
					}
				}

				// Show passage matches
				if (
					(options.mode === "hybrid" || options.mode === "passages") &&
					results.combined.length > 0
				) {
					console.log("📖 Matching Passages:\n");
					const passages = options.mode === "hybrid" ? results.combined : results.passages;
					for (let i = 0; i < passages.length; i++) {
						const p = passages[i];
						if (!p) continue;
						console.log(
							`${i + 1}. [${(p.score * 100).toFixed(0)}%] ${p.bookTitle} by ${p.bookAuthor}`,
						);
						if (p.chapterTitle) {
							console.log(`   Chapter: ${p.chapterTitle}`);
						}
						// Show first 200 chars of passage
						const preview = p.text.length > 200 ? p.text.slice(0, 200) + "..." : p.text;
						console.log(`   "${preview}"`);
						console.log();
					}
				}

				closeBookDatabase();
			} catch (error) {
				console.error("Error:", error instanceof Error ? error.message : error);
				process.exit(1);
			}
		},
	);

/**
 * Show book database statistics
 */
program
	.command("book-stats")
	.description("Show book database statistics")
	.action(() => {
		try {
			initBookDatabase();
			const stats = getBookStats();

			console.log("\n📚 Book Database Statistics\n");
			console.log(`   Total books:     ${stats.totalBooks}`);
			console.log(`   Total chapters:  ${stats.totalChapters}`);
			console.log(`   Total passages:  ${stats.totalPassages}`);
			console.log(`   Chars indexed:   ${(stats.totalCharsIndexed / 1_000_000).toFixed(1)}M`);

			console.log("\n📖 By Language:");
			console.log(`   Swedish (sv):    ${stats.byLanguage.swedish}`);
			console.log(`   Arabic (ar):     ${stats.byLanguage.arabic}`);
			console.log(`   English (en):    ${stats.byLanguage.english}`);

			console.log();
			closeBookDatabase();
		} catch (error) {
			console.error("Error:", error instanceof Error ? error.message : error);
			process.exit(1);
		}
	});

/**
 * Fix metadata for quotes with Unknown author (FREE - no API calls)
 * Fetches Gutenberg headers to extract author/title and updates database
 */
program
	.command("fix-metadata")
	.description("Fix author/title for Unknown quotes by re-fetching Gutenberg headers (free)")
	.option("--dry-run", "Show what would be updated without making changes")
	.option("--limit <n>", "Process only first N URLs (for testing)")
	.action(async (options: { dryRun?: boolean; limit?: string }) => {
		try {
			initDatabase();

			console.log("🔍 Finding quotes with Unknown author...\n");
			const sourceUrls = getUnknownAuthorSourceUrls();
			console.log(`Found ${sourceUrls.length} unique source URLs with Unknown author\n`);

			if (sourceUrls.length === 0) {
				console.log("No quotes need fixing!");
				closeDatabase();
				return;
			}

			const limit = options.limit ? Number.parseInt(options.limit, 10) : sourceUrls.length;
			const urlsToProcess = sourceUrls.slice(0, limit);

			let totalUpdated = 0;
			let urlsFixed = 0;

			for (let i = 0; i < urlsToProcess.length; i++) {
				const url = urlsToProcess[i];
				if (!url) continue;

				console.log(`[${i + 1}/${urlsToProcess.length}] ${url}`);

				try {
					// First try to extract from known sources (no fetch needed)
					let metadata = extractMetadataFromUrl(url);

					// If no known metadata, fetch header and try to extract
					if (!metadata.author && !metadata.title) {
						// Skip archive.org HTML pages - they don't have raw text headers
						if (url.includes("archive.org/stream")) {
							console.log("   ⚠️  Archive.org stream URL - using known metadata lookup");
							continue;
						}

						// Fetch only the header (first 5000 bytes)
						const response = await fetch(url, {
							headers: { Range: "bytes=0-5000" },
						});

						if (!response.ok) {
							console.log("   ⚠️  Could not fetch URL");
							continue;
						}

						const header = await response.text();
						metadata = extractMetadataFromUrl(url, header);
					}

					const { author, title } = metadata;

					if (!author && !title) {
						console.log("   ⚠️  No metadata found");
						continue;
					}

					console.log(`   Author: ${author || "(not found)"}`);
					console.log(`   Title: ${title || "(not found)"}`);

					if (options.dryRun) {
						console.log("   (dry run - no changes made)");
					} else {
						const updated = updateQuoteMetadataBySource(url, { author, title });
						totalUpdated += updated;
						if (updated > 0) {
							urlsFixed++;
							console.log(`   ✅ Updated ${updated} quotes`);
						}
					}
				} catch (error) {
					console.log(`   ❌ Error: ${error instanceof Error ? error.message : error}`);
				}
			}

			closeDatabase();

			console.log(`\n${"─".repeat(60)}`);
			if (options.dryRun) {
				console.log("Dry run complete. No changes made.");
			} else {
				console.log(`✅ Fixed ${urlsFixed} URLs, updated ${totalUpdated} quotes`);
			}
		} catch (error) {
			console.error("Error:", error instanceof Error ? error.message : error);
			process.exit(1);
		}
	});

program.parse();
