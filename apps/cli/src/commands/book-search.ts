import { closeBookDatabase, initBookDatabase, searchBooks } from "@islam-se/quotes";
import type { Command } from "commander";

interface SearchResults {
	combined: Array<{
		score: number;
		bookTitle: string;
		bookAuthor: string;
		chapterTitle?: string | null;
		text: string;
	}>;
	passages: Array<{
		score: number;
		bookTitle: string;
		bookAuthor: string;
		chapterTitle?: string | null;
		text: string;
	}>;
	concepts: Array<{
		type: string;
		bookTitle: string;
		chapterNumber?: number;
		score: number;
		summary: string;
		keyConcepts: string[];
	}>;
}

function displayConcepts(results: SearchResults): void {
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

function displayPassages(passages: SearchResults["passages"]): void {
	console.log("📖 Matching Passages:\n");
	for (let i = 0; i < passages.length; i++) {
		const p = passages[i];
		if (!p) continue;
		console.log(`${i + 1}. [${(p.score * 100).toFixed(0)}%] ${p.bookTitle} by ${p.bookAuthor}`);
		if (p.chapterTitle) {
			console.log(`   Chapter: ${p.chapterTitle}`);
		}
		const preview = p.text.length > 200 ? `${p.text.slice(0, 200)}...` : p.text;
		console.log(`   "${preview}"`);
		console.log();
	}
}

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
					const limit = Math.max(1, Number.parseInt(options.limit, 10));
					console.log(`\n🔍 Searching books for: "${query}" (mode: ${options.mode})\n`);

					initBookDatabase();
					const results = await searchBooks(query, {
						passageLimit: limit,
						conceptLimit: 5,
						minScore: 0.3,
						language: options.language,
					});

					const hasResults = results.combined.length > 0 || results.concepts.length > 0;
					if (!hasResults) {
						console.log("No results found.");
						return;
					}

					const showConcepts =
						(options.mode === "hybrid" || options.mode === "concepts") &&
						results.concepts.length > 0;
					if (showConcepts) {
						displayConcepts(results);
					}

					const showPassages =
						(options.mode === "hybrid" || options.mode === "passages") &&
						results.combined.length > 0;
					if (showPassages) {
						const passages = options.mode === "hybrid" ? results.combined : results.passages;
						displayPassages(passages);
					}
				} catch (error) {
					console.error("Error:", error instanceof Error ? error.message : error);
					process.exit(1);
				} finally {
					closeBookDatabase();
				}
			},
		);
}
