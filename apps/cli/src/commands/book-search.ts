import { closeBookDatabase, initBookDatabase, searchBooks } from "@islam-se/quotes";
import type { Command } from "commander";

export function registerBookSearchCommand(program: Command): void {
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
							const preview = p.text.length > 200 ? `${p.text.slice(0, 200)}...` : p.text;
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
}
