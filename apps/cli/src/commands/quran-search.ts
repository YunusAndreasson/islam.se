import {
	closeQuranDatabase,
	generateLocalEmbedding,
	initQuranDatabase,
	searchVerses,
	searchVersesSemantic,
	type VerseWithScore,
} from "@islam-se/quotes";
import type { Command } from "commander";

export function registerQuranSearchCommand(program: Command): void {
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

				let results: VerseWithScore[];
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
								? `${verse.commentary.slice(0, 150)}...`
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
}
