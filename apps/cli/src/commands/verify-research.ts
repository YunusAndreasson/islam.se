import { readFileSync } from "node:fs";
import { SourceValidator } from "@islam-se/orchestrator";
import type { Command } from "commander";
import { resolvePath } from "../utils/index.js";

export function registerVerifyResearchCommand(program: Command): void {
	program
		.command("verify-research")
		.description("Verify that URLs in a research JSON file are valid (not hallucinated)")
		.argument("<file>", "Path to research JSON file")
		.action(async (fileArg: string) => {
			const file = resolvePath(fileArg);

			try {
				console.log(`\n🔍 Verifying URLs in: ${file}\n`);

				const content = readFileSync(file, "utf-8");
				const research = JSON.parse(content);

				if (!research.sources || !Array.isArray(research.sources)) {
					console.error("Error: No sources array found in research file");
					process.exit(1);
				}

				const urls = research.sources.map((s: { url: string }) => s.url);
				console.log(`   Found ${urls.length} URLs to verify\n`);

				const validator = new SourceValidator();
				const result = await validator.verifyUrls(urls);

				// Display results
				console.log("Results:");
				for (const r of result.results) {
					const status = r.exists ? "✅" : "❌";
					const info = r.error || `HTTP ${r.status}`;
					const urlDisplay = r.url.length > 70 ? `${r.url.substring(0, 67)}...` : r.url;
					console.log(`   ${status} ${urlDisplay}`);
					console.log(`      ${info}`);
				}

				console.log("\n📊 Summary:");
				console.log(`   Total:    ${result.stats.total}`);
				console.log(`   Valid:    ${result.stats.verified}`);
				console.log(`   Invalid:  ${result.stats.failed}`);

				if (result.stats.failedUrls.length > 0) {
					console.log("\n⚠️  Failed URLs (likely hallucinated):");
					for (const url of result.stats.failedUrls) {
						console.log(`   - ${url}`);
					}
					console.log("\nThese URLs should be removed or replaced with valid sources.");
					process.exit(1);
				} else {
					console.log("\n✅ All URLs verified successfully!\n");
				}
			} catch (error) {
				console.error("Error:", error instanceof Error ? error.message : error);
				process.exit(1);
			}
		});
}
