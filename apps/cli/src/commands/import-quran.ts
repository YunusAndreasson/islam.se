import {
	closeQuranDatabase,
	generateLocalEmbeddings,
	getParseStats,
	initQuranDatabase,
	insertVerse,
	insertVerseEmbedding,
	parseQuranText,
} from "@islam-se/quotes";
import type { Command } from "commander";
import { resolvePath } from "../utils/index.js";

export function registerImportQuranCommand(program: Command): void {
	program
		.command("import-quran")
		.description("Import Quran verses from extracted text file")
		.argument("[file]", "Path to extracted Quran text file", "./data/extracted/sv/koranen-sv.txt")
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
}
