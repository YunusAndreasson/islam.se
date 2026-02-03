import { closeBookDatabase, getBookStats, initBookDatabase } from "@islam-se/quotes";
import type { Command } from "commander";

export function registerBookStatsCommand(program: Command): void {
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
}
