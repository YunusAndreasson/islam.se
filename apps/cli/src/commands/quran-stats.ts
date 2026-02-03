import { closeQuranDatabase, getQuranStats, initQuranDatabase } from "@islam-se/quotes";
import type { Command } from "commander";

export function registerQuranStatsCommand(program: Command): void {
	program
		.command("quran-stats")
		.description("Show Quran database statistics")
		.action(() => {
			try {
				initQuranDatabase();
				const stats = getQuranStats();

				console.log("\n📖 Quran Database Statistics\n");
				console.log(`   Total verses:          ${stats.totalVerses}`);
				console.log(`   Surahs:                ${stats.surahs}`);
				console.log(`   With commentary:       ${stats.versesWithCommentary}`);
				console.log(`   With Arabic text:      ${stats.versesWithArabic}`);
				console.log(`   Translators:           ${stats.translators.join(", ") || "none"}`);
				console.log();

				closeQuranDatabase();
			} catch (error) {
				console.error("Error:", error instanceof Error ? error.message : error);
				process.exit(1);
			}
		});
}
