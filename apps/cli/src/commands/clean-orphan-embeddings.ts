import { cleanOrphanEmbeddings, closeBookDatabase } from "@islam-se/quotes";
import type { Command } from "commander";

export function registerCleanOrphanEmbeddingsCommand(program: Command): void {
	program
		.command("clean-orphan-embeddings")
		.description("Remove book embeddings left behind by past deletions (vec0 can't FK-cascade)")
		.action(() => {
			try {
				const result = cleanOrphanEmbeddings();

				console.log("\n🧹 Orphaned embeddings removed\n");
				console.log(`   Passage embeddings:  ${result.passageEmbeddings}`);
				console.log(`   Summary embeddings:  ${result.summaryEmbeddings}`);
				if (result.passageEmbeddings === 0 && result.summaryEmbeddings === 0) {
					console.log("\n   Nothing to clean — embeddings are already consistent.");
				}

				console.log();
				closeBookDatabase();
			} catch (error) {
				console.error("Error:", error instanceof Error ? error.message : error);
				process.exit(1);
			}
		});
}
