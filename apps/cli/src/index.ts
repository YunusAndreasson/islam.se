#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	closeDatabase,
	extractArabicQuotes,
	extractNorseQuotes,
	extractQuotes,
	fetchText,
	findQuotesLocal,
	generateLocalEmbeddings,
	getStats,
	initDatabase,
	insertEmbedding,
	insertQuote,
	parseOpenITIUri,
	saveArabicExtractionResult,
	saveExtractionResult,
	saveNorseExtractionResult,
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

					// Extract
					console.log("   🤖 Extracting quotes with Claude...");
					const extraction = await extractQuotes(result.text, url, undefined, (msg) =>
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
				console.log("\n" + "─".repeat(60));
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
				console.log("\n" + "─".repeat(60));
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
				console.log("\n" + "-".repeat(60));
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

program.parse();
