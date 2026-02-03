import { closeDatabase, findQuotesLocal, initDatabase } from "@islam-se/quotes";
import type { Command } from "commander";

export function registerSearchCommand(program: Command): void {
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
}
