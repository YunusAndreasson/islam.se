import {
	type ArabicQuote,
	beginTransaction,
	closeDatabase,
	commitTransaction,
	extractArabicQuotes,
	generateLocalEmbeddings,
	initDatabase,
	insertEmbedding,
	insertQuote,
	parseOpenITIUri,
	rollbackTransaction,
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

async function storeArabicQuotes(
	quotes: ArabicQuote[],
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
				language: "ar",
				sourceType: "openiti",
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

async function processArabicUrl(
	url: string,
	meta: { author: string; title: string },
): Promise<void> {
	console.log("   ⬇️  Fetching from OpenITI...");
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`HTTP ${response.status}: ${response.statusText}`);
	}
	const text = await response.text();
	console.log(`   📄 Downloaded ${text.length} characters`);

	console.log("   🤖 Extracting Arabic quotes with Claude...");
	const extraction = await extractArabicQuotes(text, url, meta, (msg) =>
		console.log(`      ${msg}`),
	);
	console.log(`   📝 Found ${extraction.quotes.length} unique quotes`);

	const filename = url.split("/").pop() || "arabic-quotes";
	saveArabicExtractionResult(extraction, filename);

	initDatabase();
	console.log("   💾 Storing quotes...");
	const { stored, skipped } = await storeArabicQuotes(extraction.quotes, url);
	console.log(`   ✅ Stored: ${stored}, Skipped: ${skipped}`);
	if (stored === 0 && skipped === 0) {
		throw new Error("No quotes extracted — API may have failed");
	}
}

interface ArabicUrlContext {
	file: string;
	url: string;
	meta: { author: string; title: string };
	index: number;
	doneCount: number;
	total: number;
	delaySeconds: number;
	isLast: boolean;
	interrupted: boolean;
}

async function processSingleArabicUrl(ctx: ArabicUrlContext): Promise<boolean> {
	console.log(
		`\n[${ctx.doneCount + ctx.index + 1}/${ctx.total}] 📖 ${ctx.meta.author} - ${ctx.meta.title}`,
	);
	console.log(`   ${ctx.url}`);

	try {
		await processArabicUrl(ctx.url, ctx.meta);
		markUrlAsDone(ctx.file, ctx.url);
		console.log("   ✓ Marked as done");

		if (!ctx.isLast && ctx.delaySeconds > 0 && !ctx.interrupted) {
			console.log(`   ⏳ Waiting ${ctx.delaySeconds}s...`);
			await new Promise((resolve) => setTimeout(resolve, ctx.delaySeconds * 1000));
		}
		return true;
	} catch (error) {
		console.error(`   ❌ Error: ${error instanceof Error ? error.message : error}`);
		console.log("   ⚠️  URL not marked as done - will retry on next run");
		return false;
	}
}

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

				console.log("\n📚 Arabic Import Status:");
				console.log(`   Total URLs: ${total}`);
				console.log(`   Already done: ${done.length}`);
				console.log(`   Remaining: ${pending.length}\n`);

				if (pending.length === 0) {
					console.log("✅ All URLs have been imported!\n");
					return;
				}

				console.log(`Starting import of ${pending.length} Arabic texts...\n`);
				console.log("─".repeat(60));

				const delaySeconds = Number.parseInt(options.delay, 10);

				for (let i = 0; i < pending.length; i++) {
					if (interrupt.state.interrupted) {
						console.log(`\n⏸️  Stopped. ${pending.length - i} URLs remaining.\n`);
						break;
					}

					const url = pending[i];
					if (!url) continue;

					await processSingleArabicUrl({
						file,
						url,
						meta: parseOpenITIUri(url),
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
