import {
	closeDatabase,
	extractMetadataFromUrl,
	getUnknownAuthorSourceUrls,
	initDatabase,
	updateQuoteMetadataBySource,
} from "@islam-se/quotes";
import type { Command } from "commander";

interface ProcessResult {
	urlsFixed: number;
	totalUpdated: number;
}

async function fetchMetadataForUrl(
	url: string,
): Promise<{ author?: string; title?: string } | null> {
	// First try known sources
	let metadata = extractMetadataFromUrl(url);
	if (metadata.author || metadata.title) {
		return metadata;
	}

	// Skip archive.org HTML pages
	if (url.includes("archive.org/stream")) {
		console.log("   ⚠️  Archive.org stream URL - using known metadata lookup");
		return null;
	}

	// Fetch header and parse
	const response = await fetch(url, { headers: { Range: "bytes=0-5000" } });
	if (!response.ok) {
		console.log("   ⚠️  Could not fetch URL");
		return null;
	}

	const header = await response.text();
	metadata = extractMetadataFromUrl(url, header);
	return metadata.author || metadata.title ? metadata : null;
}

function applyMetadataUpdate(
	url: string,
	metadata: { author?: string; title?: string },
	dryRun: boolean,
): number {
	console.log(`   Author: ${metadata.author || "(not found)"}`);
	console.log(`   Title: ${metadata.title || "(not found)"}`);

	if (dryRun) {
		console.log("   (dry run - no changes made)");
		return 0;
	}

	const updated = updateQuoteMetadataBySource(url, metadata);
	if (updated > 0) {
		console.log(`   ✅ Updated ${updated} quotes`);
	}
	return updated;
}

async function processUrls(urls: string[], dryRun: boolean): Promise<ProcessResult> {
	let totalUpdated = 0;
	let urlsFixed = 0;

	for (let i = 0; i < urls.length; i++) {
		const url = urls[i];
		if (!url) continue;

		console.log(`[${i + 1}/${urls.length}] ${url}`);

		try {
			const metadata = await fetchMetadataForUrl(url);
			if (!metadata) continue;

			const updated = applyMetadataUpdate(url, metadata, dryRun);
			totalUpdated += updated;
			if (updated > 0) urlsFixed++;
		} catch (error) {
			console.log(`   ❌ Error: ${error instanceof Error ? error.message : error}`);
		}
	}

	return { urlsFixed, totalUpdated };
}

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

				const { urlsFixed, totalUpdated } = await processUrls(urlsToProcess, !!options.dryRun);

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
