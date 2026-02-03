import type { Command } from "commander";
import { parseUrlFile, resolvePath } from "../utils/index.js";

export function registerImportStatusCommand(program: Command): void {
	program
		.command("import-status")
		.description("Show import progress for a URL file")
		.argument("<file>", "File containing URLs")
		.action((fileArg: string) => {
			const file = resolvePath(fileArg);
			try {
				const { pending, done, total } = parseUrlFile(file);

				console.log(`\n📚 Import Status for: ${fileArg}\n`);
				console.log(`   Total URLs:    ${total}`);
				console.log(`   ✅ Completed:  ${done.length}`);
				console.log(`   ⏳ Remaining:  ${pending.length}`);

				if (total > 0) {
					const percent = Math.round((done.length / total) * 100);
					const bar =
						"█".repeat(Math.floor(percent / 5)) + "░".repeat(20 - Math.floor(percent / 5));
					console.log(`\n   [${bar}] ${percent}%`);
				}

				if (pending.length > 0) {
					console.log("\n   Next up:");
					for (let i = 0; i < Math.min(3, pending.length); i++) {
						console.log(`   ${i + 1}. ${pending[i]}`);
					}
					if (pending.length > 3) {
						console.log(`   ... and ${pending.length - 3} more`);
					}
				}

				console.log();
			} catch (error) {
				console.error("Error:", error instanceof Error ? error.message : error);
				process.exit(1);
			}
		});
}
