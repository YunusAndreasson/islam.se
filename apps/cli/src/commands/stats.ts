import { closeDatabase, getStats, initDatabase } from "@islam-se/quotes";
import type { Command } from "commander";

export function registerStatsCommand(program: Command): void {
	program
		.command("stats")
		.description("Show database statistics")
		.action(() => {
			try {
				initDatabase();
				const stats = getStats();

				console.log("\n📊 Database Statistics\n");
				console.log(`   Total quotes: ${stats.totalQuotes}`);
				console.log(`   Authors: ${stats.authors}`);
				console.log(`   Works: ${stats.works}`);

				console.log("\n📚 By Language:");
				console.log(`   Swedish (sv):  ${stats.byLanguage.swedish}`);
				console.log(`   Arabic (ar):   ${stats.byLanguage.arabic}`);
				console.log(`   Norse (en):    ${stats.byLanguage.norse}`);

				console.log("\n📁 By Source:");
				console.log(`   Gutenberg:     ${stats.bySourceType.gutenberg}`);
				console.log(`   OpenITI:       ${stats.bySourceType.openiti}`);
				if (stats.bySourceType.other > 0) {
					console.log(`   Other:         ${stats.bySourceType.other}`);
				}

				console.log();
				closeDatabase();
			} catch (error) {
				console.error("Error:", error instanceof Error ? error.message : error);
				process.exit(1);
			}
		});
}
