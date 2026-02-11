import {
	cleanVerseText,
	closeQuranDatabase,
	deleteAllVerseEmbeddings,
	generateLocalEmbeddings,
	getAllVerses,
	initQuranDatabase,
	insertVerseEmbedding,
	type StoredVerse,
} from "@islam-se/quotes";
import type { Command } from "commander";

const BIDI_PATTERN = /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;

function countInvisibleChars(verses: StoredVerse[]): {
	totalChars: number;
	affectedVerses: number;
} {
	let totalChars = 0;
	let affectedVerses = 0;
	for (const verse of verses) {
		const textMatches = verse.textSwedish.match(BIDI_PATTERN);
		const commentaryMatches = verse.commentary?.match(BIDI_PATTERN);
		const count = (textMatches?.length ?? 0) + (commentaryMatches?.length ?? 0);
		if (count > 0) {
			totalChars += count;
			affectedVerses++;
		}
	}
	return { totalChars, affectedVerses };
}

async function regenerateEmbeddings(): Promise<void> {
	const deleted = deleteAllVerseEmbeddings();
	console.log(`\n   Deleted ${deleted} old embeddings`);

	const verses = getAllVerses();
	console.log(`   Re-generating embeddings for ${verses.length} verses...`);

	const batchSize = 100;
	for (let i = 0; i < verses.length; i += batchSize) {
		const batch = verses.slice(i, i + batchSize);
		const texts = batch.map((v) => v.textSwedish);
		const embeddings = await generateLocalEmbeddings(texts);

		for (let j = 0; j < batch.length; j++) {
			const verse = batch[j];
			const embedding = embeddings[j];
			if (verse && embedding) {
				insertVerseEmbedding(verse.id, embedding);
			}
		}

		const progress = Math.min(i + batchSize, verses.length);
		console.log(`   Progress: ${progress}/${verses.length}`);
	}
}

export function registerCleanQuranCommand(program: Command): void {
	program
		.command("clean-quran")
		.description("Strip invisible Unicode chars from Quran verses and re-generate embeddings")
		.option("--skip-embeddings", "Only clean text, skip re-embedding")
		.action(async (options: { skipEmbeddings?: boolean }) => {
			try {
				console.log("\n🧹 Cleaning Quran verse text...\n");
				initQuranDatabase();

				const versesBefore = getAllVerses();
				const before = countInvisibleChars(versesBefore);

				console.log(`   Total verses: ${versesBefore.length}`);
				console.log(`   Verses with invisible chars: ${before.affectedVerses}`);
				console.log(`   Total invisible chars: ${before.totalChars}`);

				const modified = cleanVerseText(BIDI_PATTERN);
				console.log(`   Verses modified: ${modified}`);

				if (!options.skipEmbeddings) {
					await regenerateEmbeddings();
				}

				const after = countInvisibleChars(getAllVerses());
				console.log(`\n   Remaining invisible chars: ${after.totalChars}`);

				closeQuranDatabase();
				console.log("\n✅ Quran clean complete!\n");
			} catch (error) {
				console.error("Error:", error instanceof Error ? error.message : error);
				process.exit(1);
			}
		});
}
