import {
	closeDatabase,
	extractMetadataFromUrl,
	getUnknownAuthorSourceUrls,
	initDatabase,
	updateQuoteMetadataBySource,
} from "@islam-se/quotes";
import type { Command } from "commander";

export function registerFixMetadataCommand(program: Command): void {
	program
		.command("fix-metadata")
		.description("Fix author/title for Unknown quotes by re-fetching Gutenberg headers (free)")
		.option("--dry-run", "Show what would be updated without making changes")
		.option("--limit <n>", "Process only first N URLs (for testing)")
		.action(async (options: { dryRun?: boolean; limit?: string }) => {
			try {
				initDatabase();

				console.log("🔍 Finding quotes with Unknown author...\n");
				const sourceUrls = getUnknownAuthorSourceUrls();
				console.log(`Found ${sourceUrls.length} unique source URLs with Unknown author\n`);

				if (sourceUrls.length === 0) {
					console.log("No quotes need fixing!");
					closeDatabase();
					return;
				}

				const limit = options.limit ? Number.parseInt(options.limit, 10) : sourceUrls.length;
				const urlsToProcess = sourceUrls.slice(0, limit);

				let totalUpdated = 0;
				let urlsFixed = 0;

				for (let i = 0; i < urlsToProcess.length; i++) {
					const url = urlsToProcess[i];
					if (!url) continue;

					console.log(`[${i + 1}/${urlsToProcess.length}] ${url}`);

					try {
						// First try to extract from known sources (no fetch needed)
						let metadata = extractMetadataFromUrl(url);

						// If no known metadata, fetch header and try to extract
						if (!metadata.author && !metadata.title) {
							// Skip archive.org HTML pages - they don't have raw text headers
							if (url.includes("archive.org/stream")) {
								console.log("   ⚠️  Archive.org stream URL - using known metadata lookup");
								continue;
							}

							// Fetch only the header (first 5000 bytes)
							const response = await fetch(url, {
								headers: { Range: "bytes=0-5000" },
							});

							if (!response.ok) {
								console.log("   ⚠️  Could not fetch URL");
								continue;
							}

							const header = await response.text();
							metadata = extractMetadataFromUrl(url, header);
						}

						const { author, title } = metadata;

						if (!author && !title) {
							console.log("   ⚠️  No metadata found");
							continue;
						}

						console.log(`   Author: ${author || "(not found)"}`);
						console.log(`   Title: ${title || "(not found)"}`);

						if (options.dryRun) {
							console.log("   (dry run - no changes made)");
						} else {
							const updated = updateQuoteMetadataBySource(url, { author, title });
							totalUpdated += updated;
							if (updated > 0) {
								urlsFixed++;
								console.log(`   ✅ Updated ${updated} quotes`);
							}
						}
					} catch (error) {
						console.log(`   ❌ Error: ${error instanceof Error ? error.message : error}`);
					}
				}

				closeDatabase();

				console.log(`\n${"─".repeat(60)}`);
				if (options.dryRun) {
					console.log("Dry run complete. No changes made.");
				} else {
					console.log(`✅ Fixed ${urlsFixed} URLs, updated ${totalUpdated} quotes`);
				}
			} catch (error) {
				console.error("Error:", error instanceof Error ? error.message : error);
				process.exit(1);
			}
		});
}
