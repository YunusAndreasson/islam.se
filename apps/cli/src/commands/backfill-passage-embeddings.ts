import { backfillPassageEmbeddings, closeBookDatabase } from "@islam-se/quotes";
import type { Command } from "commander";

export function registerBackfillPassageEmbeddingsCommand(program: Command): void {
	program
		.command("backfill-passage-embeddings")
		.description("Embed any book passages missing an embedding (local model, no API cost)")
		.action(async () => {
			try {
				const result = await backfillPassageEmbeddings({
					onProgress: (msg) => console.log(`   ${msg}`),
				});

				console.log(`\n✅ Embedded ${result.embedded} passages\n`);
				closeBookDatabase();
			} catch (error) {
				console.error("Error:", error instanceof Error ? error.message : error);
				process.exit(1);
			}
		});
}
