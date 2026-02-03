import {
	beginTransaction,
	closeDatabase,
	commitTransaction,
	extractQuotes,
	fetchText,
	generateLocalEmbeddings,
	initDatabase,
	insertEmbedding,
	insertQuote,
	type Quote,
	rollbackTransaction,
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

async function storeQuotesWithEmbeddings(
	quotes: Quote[],
	url: string,
): Promise<{ stored: number; skipped: number }> {
	const quotesToEmbed: { id: number; text: string }[] = [];
	let skipped = 0;

	// Wrap quote inserts in a transaction for 10-50x speedup
	beginTransaction();
	try {
		for (const quote of quotes) {
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
		commitTransaction();
	} catch (error) {
		rollbackTransaction();
		throw error;
	}

	if (quotesToEmbed.length > 0) {
		console.log(`   🔢 Generating ${quotesToEmbed.length} embeddings in batch...`);
		const texts = quotesToEmbed.map((q) => q.text);
		const embeddings = await generateLocalEmbeddings(texts);

		// Wrap embedding inserts in a transaction
		beginTransaction();
		try {
			for (let j = 0; j < quotesToEmbed.length; j++) {
				const quote = quotesToEmbed[j];
				const embedding = embeddings[j];
				if (quote && embedding) {
					insertEmbedding(quote.id, embedding);
				}
			}
			commitTransaction();
		} catch (error) {
			rollbackTransaction();
			throw error;
		}
	}

	return { stored: quotesToEmbed.length, skipped };
}

async function processUrl(url: string): Promise<void> {
	const result = await fetchText(url);
	console.log(`   ${result.cached ? "📁 Cached" : "⬇️  Downloaded"}: ${result.filename}`);

	console.log("   🤖 Extracting quotes with Claude...");
	if (result.metadata?.author) console.log(`      Author: ${result.metadata.author}`);
	if (result.metadata?.title) console.log(`      Title: ${result.metadata.title}`);

	const extraction = await extractQuotes(result.text, url, result.metadata, (msg) =>
		console.log(`      ${msg}`),
	);
	console.log(`   📝 Found ${extraction.quotes.length} unique quotes`);

	saveExtractionResult(extraction, result.filename);
	initDatabase();

	console.log("   💾 Storing quotes...");
	const { stored, skipped } = await storeQuotesWithEmbeddings(extraction.quotes, url);
	console.log(`   ✅ Stored: ${stored}, Skipped (duplicates): ${skipped}`);
}

interface UrlProcessContext {
	file: string;
	url: string;
	index: number;
	doneCount: number;
	total: number;
	delaySeconds: number;
	isLast: boolean;
	interrupted: boolean;
}

async function processSingleUrl(ctx: UrlProcessContext): Promise<boolean> {
	console.log(`\n[${ctx.doneCount + ctx.index + 1}/${ctx.total}] 📖 ${ctx.url}`);

	try {
		await processUrl(ctx.url);
		markUrlAsDone(ctx.file, ctx.url);
		console.log("   ✓ Marked as done");

		if (!ctx.isLast && ctx.delaySeconds > 0 && !ctx.interrupted) {
			console.log(`   ⏳ Waiting ${ctx.delaySeconds}s before next URL (rate limit protection)...`);
			await new Promise((resolve) => setTimeout(resolve, ctx.delaySeconds * 1000));
		}
		return true;
	} catch (error) {
		console.error(`   ❌ Error: ${error instanceof Error ? error.message : error}`);
		console.log("   ⚠️  URL not marked as done - will retry on next run");
		return false;
	}
}

export function registerImportUrlsCommand(program: Command): void {
	program
		.command("import-urls")
		.description("Import quotes from a file containing URLs (resumable)")
		.argument("<file>", "File containing URLs (one per line)")
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

				console.log("\n📚 URL Import Status:");
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

				const delaySeconds = Number.parseInt(options.delay, 10);

				for (let i = 0; i < pending.length; i++) {
					if (interrupt.state.interrupted) {
						console.log(`\n⏸️  Stopped. ${pending.length - i} URLs remaining.`);
						console.log("   Run the command again to resume.\n");
						break;
					}

					const url = pending[i];
					if (!url) continue;

					await processSingleUrl({
						file,
						url,
						index: i,
						doneCount: done.length,
						total,
						delaySeconds,
						isLast: i === pending.length - 1,
						interrupted: interrupt.state.interrupted,
					});
				}

				if (!interrupt.state.interrupted) {
					console.log(`\n${"─".repeat(60)}`);
					console.log("🎉 All done!\n");
				}
			} catch (error) {
				console.error("Error:", error instanceof Error ? error.message : error);
				process.exit(1);
			} finally {
				closeDatabase();
				interrupt.detach();
			}
		});
}
