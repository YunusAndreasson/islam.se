#!/usr/bin/env node

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import * as p from "@clack/prompts";
import {
	ArticlePublisher,
	ContentOrchestrator,
	type EnrichedIdea,
	type EnrichedIdeationOutput,
	type IdeaBrief,
	IdeationService,
	parseFrontmatter,
} from "@islam-se/orchestrator";
import { Command } from "commander";
import { createPatch } from "diff";

const program = new Command();

program
	.name("produce")
	.description("Content production orchestration for Islam.se")
	.version("0.1.0");

program
	.command("article")
	.description("Produce a complete article on a topic")
	.argument("<topic>", "The topic to write about")
	.option("-q, --quality <score>", "Minimum quality score (1-10)", "7.5")
	.option("-m, --model <model>", "Model to use (opus|sonnet)", "opus")
	.option("-o, --output <dir>", "Output directory", "./output")
	.option("-r, --revisions <count>", "Max revision attempts", "2")
	.action(async (topic: string, options) => {
		const outputDir = resolve(options.output);

		console.log("");
		console.log("╔══════════════════════════════════════════════════════════╗");
		console.log("║           Islam.se Content Production Pipeline           ║");
		console.log("╚══════════════════════════════════════════════════════════╝");
		console.log("");
		console.log(`Topic: ${topic}`);
		console.log(`Model: ${options.model}`);
		console.log(`Quality threshold: ${options.quality}/10`);
		console.log("");

		const orchestrator = new ContentOrchestrator({
			outputDir,
			model: options.model as "opus" | "sonnet",
			qualityThreshold: Number.parseFloat(options.quality),
			maxRevisions: Number.parseInt(options.revisions, 10),
		});

		try {
			const result = await orchestrator.produce(topic);

			console.log("");
			console.log("══════════════════════════════════════════════════════════");
			console.log("                       PRODUCTION SUMMARY");
			console.log("══════════════════════════════════════════════════════════");
			console.log("");

			if (result.success) {
				console.log("Status: ✅ SUCCESS");
				console.log(`Output: ${result.outputDir}`);
				console.log("");
				console.log("Files created:");
				console.log("  - final.md (article)");
				console.log("  - references.md (bibliography)");
				console.log("  - research.json");
				console.log("  - fact-check.json");
				console.log("  - review.json");
				console.log("  - metadata.json");
			} else {
				console.log("Status: ❌ FAILED");
				console.log("");
				if (result.stages.research && !result.stages.research.success) {
					console.log(`Research failed: ${result.stages.research.error}`);
				}
				if (result.stages.factCheck && !result.stages.factCheck.success) {
					console.log(`Fact-check failed: ${result.stages.factCheck.error}`);
				}
				if (result.stages.authoring && !result.stages.authoring.success) {
					console.log(`Authoring failed: ${result.stages.authoring.error}`);
				}
				if (result.stages.review && !result.stages.review.success) {
					console.log(`Review failed: ${result.stages.review.error}`);
				}
			}

			if (result.totalDuration) {
				const minutes = Math.floor(result.totalDuration / 60000);
				const seconds = Math.floor((result.totalDuration % 60000) / 1000);
				console.log("");
				console.log(`Total time: ${minutes}m ${seconds}s`);
			}

			process.exit(result.success ? 0 : 1);
		} catch (error) {
			console.error("Fatal error:", error);
			process.exit(1);
		}
	});

program
	.command("research-only")
	.description("Run research stage only (no writing)")
	.argument("<topic>", "The topic to research")
	.option("-m, --model <model>", "Model to use (opus|sonnet)", "opus")
	.option("-o, --output <dir>", "Output directory", "./output")
	.action(async (topic: string, options) => {
		const outputDir = resolve(options.output);

		console.log("");
		console.log("📚 Research Only Mode");
		console.log(`Topic: ${topic}`);
		console.log("");

		const orchestrator = new ContentOrchestrator({
			outputDir,
			model: options.model as "opus" | "sonnet",
		});

		try {
			const result = await orchestrator.researchOnly(topic);

			if (result.success && result.data) {
				console.log("");
				console.log("Research complete!");
				console.log(`  Sources: ${result.data.sources.length}`);
				console.log(`  Quotes: ${result.data.quotes.length}`);
				console.log(`  Book passages: ${result.data.bookPassages.length}`);
				console.log(`  Quran references: ${result.data.quranReferences.length}`);
				console.log("");
				console.log("Summary:");
				console.log(result.data.summary);
			} else {
				console.log("Research failed:", result.error);
			}

			process.exit(result.success ? 0 : 1);
		} catch (error) {
			console.error("Fatal error:", error);
			process.exit(1);
		}
	});

program
	.command("ideate")
	.description("Generate sophisticated article ideas with quote enrichment")
	.argument("<topic>", "Broad topic to ideate on")
	.option("-m, --model <model>", "Model to use (opus|sonnet)", "opus")
	.option("-o, --output <dir>", "Output directory", "./output")
	.option("--no-quotes", "Skip quote enrichment")
	.action(async (topic: string, options) => {
		const outputDir = resolve(options.output);

		console.log("");
		console.log("╔══════════════════════════════════════════════════════════╗");
		console.log("║           Islam.se Creative Ideation                     ║");
		console.log("╚══════════════════════════════════════════════════════════╝");
		console.log("");
		console.log(`Topic: ${topic}`);
		console.log(`Model: ${options.model}`);
		console.log("");

		const ideationService = new IdeationService({
			outputDir,
			model: options.model as "opus" | "sonnet",
		});

		try {
			// Generate and enrich ideas
			p.intro("Generating sophisticated ideas...");

			const spinner = p.spinner();
			spinner.start("Calling Claude for ideation...");

			const result = await ideationService.ideate(topic, {
				skipQuotes: options.quotes === false,
			});

			if (!(result.success && result.data)) {
				spinner.stop("Ideation failed");
				console.error("Error:", result.error);
				process.exit(1);
			}

			spinner.stop(`Generated ${result.data.ideas.length} ideas`);

			if (result.data.batchVersion > 1) {
				console.log(
					`Batch version: ${result.data.batchVersion} (${result.data.previousVersions.length} previous versions archived)`,
				);
			}

			// Display ideas summary
			displayIdeasSummary(result.data);

			// Interactive selection
			const selection = await promptIdeaSelection(result.data.ideas);

			if (selection === "save_exit") {
				console.log("");
				console.log(`Ideas saved to: ${result.outputDir}/ideation.json`);
				p.outro("Done! Review your ideas and run ideate again to select one.");
				process.exit(0);
			}

			// User selected an idea
			const selectedIdea = result.data.ideas.find((i) => i.id === selection);
			if (!selectedIdea) {
				console.error("Invalid selection");
				process.exit(1);
			}

			// Save selected idea
			const topicSlug = topic
				.toLowerCase()
				.replace(/[åä]/g, "a")
				.replace(/[ö]/g, "o")
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/^-|-$/g, "")
				.slice(0, 50);

			ideationService.saveSelectedIdea(topicSlug, selectedIdea);

			console.log("");
			console.log("╔══════════════════════════════════════════════════════════╗");
			console.log("║           Selected Idea                                  ║");
			console.log("╚══════════════════════════════════════════════════════════╝");
			console.log("");
			console.log(`Title: ${selectedIdea.title}`);
			console.log(`Thesis: ${selectedIdea.thesis}`);
			console.log("");

			// Ask if user wants to proceed to authoring
			const proceedChoice = await p.select({
				message: "What would you like to do next?",
				options: [
					{
						value: "full",
						label: "Full pipeline (Research → Fact-check → Author → Review)",
					},
					{ value: "exit", label: "Exit (save selection for later)" },
				],
			});

			if (p.isCancel(proceedChoice) || proceedChoice === "exit") {
				console.log("");
				console.log(`Selection saved to: ${result.outputDir}/selected-idea.json`);
				p.outro("Done! Run 'pnpm produce article' with your selected idea later.");
				process.exit(0);
			}

			// Proceed to authoring - full pipeline with idea context
			console.log("");
			console.log("Starting full pipeline with idea context...");
			console.log("");

			const orchestrator = new ContentOrchestrator({
				outputDir,
				model: options.model as "opus" | "sonnet",
				qualityThreshold: 7.5,
				maxRevisions: 2,
			});

			// Build IdeaBrief from the selected idea
			const ideaBrief: IdeaBrief = {
				title: selectedIdea.title,
				thesis: selectedIdea.thesis,
				angle: selectedIdea.angle,
				keywords: selectedIdea.keywords,
				difficulty: selectedIdea.difficulty,
				seedQuotes: selectedIdea.quotes
					?.filter((q) => q.relevanceScore >= 0.6)
					.map((q) => ({ text: q.text, author: q.author, source: q.source })),
			};

			const refinedTopic = `${selectedIdea.title}: ${selectedIdea.thesis}`;
			const pipelineResult = await orchestrator.produce(
				refinedTopic,
				{ topicSlug, ideaId: selectedIdea.id },
				ideaBrief,
			);

			console.log("");
			console.log("══════════════════════════════════════════════════════════");
			console.log("                       PRODUCTION SUMMARY");
			console.log("══════════════════════════════════════════════════════════");
			console.log("");

			if (pipelineResult.success) {
				console.log("Status: ✅ SUCCESS");
				console.log(`Output: ${pipelineResult.outputDir}`);
			} else {
				console.log("Status: ❌ FAILED");
				if (pipelineResult.stages.research && !pipelineResult.stages.research.success) {
					console.log(`Research failed: ${pipelineResult.stages.research.error}`);
				}
			}

			process.exit(pipelineResult.success ? 0 : 1);
		} catch (error) {
			console.error("Fatal error:", error);
			process.exit(1);
		}
	});

/**
 * Display a summary of generated ideas
 */
function displayIdeasSummary(data: EnrichedIdeationOutput): void {
	console.log("");
	console.log("══════════════════════════════════════════════════════════");
	console.log("                    Generated Ideas");
	console.log("══════════════════════════════════════════════════════════");
	console.log("");

	for (const idea of data.ideas) {
		const quoteCount = idea.quotes?.length || 0;
		const quoteIndicator = quoteCount > 0 ? ` [${quoteCount} quotes]` : "";

		console.log("┌─────────────────────────────────────────────────────────┐");
		console.log(`│ ${idea.id}. ${truncate(idea.title, 50)}`);
		console.log(`│    ${truncate(idea.thesis, 55)}`);
		if (quoteIndicator) {
			console.log(`│    ${quoteIndicator}`);
		}
		console.log("└─────────────────────────────────────────────────────────┘");
	}

	console.log("");
	console.log("Guidance:", data.selectionGuidance);
	console.log("");
}

/**
 * Truncate text to max length with ellipsis
 */
function truncate(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text;
	return `${text.slice(0, maxLength - 3)}...`;
}

/**
 * Prompt user to select an idea
 */
async function promptIdeaSelection(ideas: EnrichedIdea[]): Promise<number | "save_exit"> {
	const ideaOptions: Array<{ value: number; label: string; hint?: string }> = ideas.map((idea) => ({
		value: idea.id,
		label: `${idea.id}. ${truncate(idea.title, 45)}`,
	}));

	// Add save and exit option
	const options = [
		...ideaOptions,
		{
			value: -1,
			label: "Save all and exit",
			hint: "Review ideas later",
		},
	];

	const selection = await p.select({
		message: "Select an idea to develop",
		options,
	});

	if (p.isCancel(selection)) {
		p.cancel("Operation cancelled");
		process.exit(0);
	}

	if (selection === -1) {
		return "save_exit";
	}

	return selection as number;
}

program
	.command("status")
	.description("Check production status for a topic")
	.argument("<path>", "Path to output directory or topic slug")
	.action((pathOrSlug: string) => {
		const orchestrator = new ContentOrchestrator({
			outputDir: "./output",
		});

		// Check if it's a path or slug
		let slug = pathOrSlug;
		if (existsSync(pathOrSlug)) {
			// It's a path, extract the last segment
			slug = pathOrSlug.split("/").pop() || pathOrSlug;
		}

		const status = orchestrator.getStatus(slug);

		console.log("");
		console.log(`Status for: ${slug}`);
		console.log("");

		if (!status.exists) {
			console.log("❌ No production found");
			process.exit(1);
		}

		console.log("Stages:");
		console.log(`  Research:   ${status.stages.research ? "✅" : "❌"}`);
		console.log(`  Fact-check: ${status.stages.factCheck ? "✅" : "❌"}`);
		console.log(`  Draft:      ${status.stages.draft ? "✅" : "❌"}`);
		console.log(`  Review:     ${status.stages.review ? "✅" : "❌"}`);
		console.log(`  Final:      ${status.stages.final ? "✅" : "❌"}`);

		if (status.metadata) {
			console.log("");
			console.log("Metadata:");
			console.log(`  Produced: ${status.metadata.producedAt}`);
			console.log(`  Quality:  ${status.metadata.qualityScore}/10`);
			console.log(`  Words:    ${status.metadata.wordCount}`);
		}

		process.exit(0);
	});

program
	.command("re-polish")
	.description("Re-run the polish stage on published articles to fix AI writing tics")
	.argument("<slug>", 'Article slug or "all" for all articles')
	.option("--dry-run", "Preview diffs without writing changes")
	.option("--no-confirm", "Auto-accept changes (skip interactive prompt)")
	.option("-m, --model <model>", "Model to use (opus|sonnet)", "opus")
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: sequential CLI pipeline handler
	.action(async (slug: string, options) => {
		const publisher = new ArticlePublisher();
		const orchestrator = new ContentOrchestrator({
			outputDir: "./output",
			model: options.model as "opus" | "sonnet",
		});

		// Determine which articles to process
		let slugs: string[];
		if (slug === "all") {
			const articles = publisher.listPublished();
			slugs = articles.map((a) => a.slug);
			console.log(`\nFound ${slugs.length} articles to re-polish.\n`);
		} else {
			if (!publisher.exists(slug)) {
				console.error(`Article not found: ${slug}`);
				process.exit(1);
			}
			slugs = [slug];
		}

		let processed = 0;
		let changed = 0;
		let skipped = 0;

		for (const articleSlug of slugs) {
			processed++;
			if (slugs.length > 1) {
				console.log(`\n[${processed}/${slugs.length}] ${articleSlug}`);
				console.log("─".repeat(60));
			}

			const content = publisher.getArticle(articleSlug);
			if (!content) {
				console.log("  Could not read article, skipping.");
				skipped++;
				continue;
			}

			// Split frontmatter from body
			const frontmatterMatch = content.match(/^(---\n[\s\S]*?\n---\n?)([\s\S]*)$/);
			if (!frontmatterMatch) {
				console.log("  No frontmatter found, skipping.");
				skipped++;
				continue;
			}
			const originalFrontmatter = frontmatterMatch[1] as string;
			const originalBody = frontmatterMatch[2] as string;

			// Run polish stage
			console.log("  Running polish stage...");
			const polishResult = await orchestrator.runPolish(originalBody);

			if (!(polishResult.success && polishResult.data)) {
				console.log(`  Polish failed: ${polishResult.error ?? "unknown error"}`);
				skipped++;
				continue;
			}

			const polishedBody = polishResult.data.body;

			// Check if anything changed
			if (polishedBody.trim() === originalBody.trim()) {
				console.log("  No changes — article already clean.");
				skipped++;
				continue;
			}

			// Integrity checks: blockquotes and footnotes
			const origBlockquotes = (originalBody.match(/^>/gm) || []).length;
			const polishedBlockquotes = (polishedBody.match(/^>/gm) || []).length;
			const origFootnotes = (originalBody.match(/\[\^\d+\]/g) || []).length;
			const polishedFootnotes = (polishedBody.match(/\[\^\d+\]/g) || []).length;

			if (origBlockquotes !== polishedBlockquotes || origFootnotes !== polishedFootnotes) {
				console.log("");
				console.log("  ⚠️  INTEGRITY WARNING:");
				if (origBlockquotes !== polishedBlockquotes) {
					console.log(`     Blockquotes: ${origBlockquotes} → ${polishedBlockquotes}`);
				}
				if (origFootnotes !== polishedFootnotes) {
					console.log(`     Footnote refs: ${origFootnotes} → ${polishedFootnotes}`);
				}
				console.log("");
			}

			// Show diff
			const patch = createPatch(
				`${articleSlug}.md`,
				originalBody,
				polishedBody,
				"original",
				"polished",
			);
			console.log("");
			for (const line of patch.split("\n")) {
				if (line.startsWith("+") && !line.startsWith("+++")) {
					console.log(`\x1b[32m${line}\x1b[0m`);
				} else if (line.startsWith("-") && !line.startsWith("---")) {
					console.log(`\x1b[31m${line}\x1b[0m`);
				} else if (line.startsWith("@@")) {
					console.log(`\x1b[36m${line}\x1b[0m`);
				} else {
					console.log(line);
				}
			}

			if (polishResult.data.edits) {
				console.log("\n  Editor notes:");
				console.log(`  ${polishResult.data.edits.split("\n").join("\n  ")}`);
			}

			if (options.dryRun) {
				console.log("\n  [dry-run] Would write changes.");
				changed++;
				continue;
			}

			// Prompt for confirmation unless --no-confirm
			let accept = !options.confirm; // --no-confirm sets options.confirm = false
			if (options.confirm !== false) {
				const choice = await p.select({
					message: "Accept changes?",
					options: [
						{ value: "accept", label: "Accept" },
						{ value: "skip", label: "Skip" },
						{ value: "abort", label: "Abort (stop processing)" },
					],
				});

				if (p.isCancel(choice) || choice === "abort") {
					console.log("\nAborted.");
					process.exit(0);
				}
				accept = choice === "accept";
			}

			if (accept) {
				// Update wordCount in frontmatter
				const { data: fmData } = parseFrontmatter(content);
				const oldWordCount = fmData.wordCount as number | undefined;
				const newWordCount = polishedBody
					.replace(/```[\s\S]*?```/g, "")
					.replace(/`[^`]+`/g, "")
					.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
					.replace(/[#*_~>\-|]/g, " ")
					.split(/\s+/)
					.filter((w) => w.length > 0).length;

				let updatedFrontmatter = originalFrontmatter;
				if (oldWordCount && oldWordCount !== newWordCount) {
					updatedFrontmatter = originalFrontmatter.replace(
						/^wordCount: \d+$/m,
						`wordCount: ${newWordCount}`,
					);
				}

				publisher.writeArticle(articleSlug, updatedFrontmatter + polishedBody);
				console.log(`  Written. (${oldWordCount} → ${newWordCount} words)`);
				changed++;
			} else {
				console.log("  Skipped.");
				skipped++;
			}
		}

		console.log("\n══════════════════════════════════════════════════════════");
		console.log(`  Done. ${changed} changed, ${skipped} skipped out of ${processed} articles.`);
		console.log("══════════════════════════════════════════════════════════\n");

		process.exit(0);
	});

program
	.command("review-aqeedah")
	.description(
		"Review published articles for theological compliance (Sufi, Ashari/Maturidi, non-mainstream ideas)",
	)
	.argument("<slug>", 'Article slug or "all" for all articles')
	.option("--dry-run", "Preview issues and diffs without writing changes")
	.option("--no-confirm", "Auto-accept changes (skip interactive prompt)")
	.option("-m, --model <model>", "Model to use (opus|sonnet)", "opus")
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: sequential CLI pipeline handler
	.action(async (slug: string, options) => {
		const publisher = new ArticlePublisher();
		const orchestrator = new ContentOrchestrator({
			outputDir: "./output",
			model: options.model as "opus" | "sonnet",
		});

		// Determine which articles to process
		let slugs: string[];
		if (slug === "all") {
			const articles = publisher.listPublished();
			slugs = articles.map((a) => a.slug);
			console.log(`\nFound ${slugs.length} articles to review.\n`);
		} else {
			if (!publisher.exists(slug)) {
				console.error(`Article not found: ${slug}`);
				process.exit(1);
			}
			slugs = [slug];
		}

		let processed = 0;
		let rewritten = 0;
		let clean = 0;
		let skipped = 0;

		for (const articleSlug of slugs) {
			processed++;
			if (slugs.length > 1) {
				console.log(`\n[${processed}/${slugs.length}] ${articleSlug}`);
				console.log("─".repeat(60));
			}

			const content = publisher.getArticle(articleSlug);
			if (!content) {
				console.log("  Could not read article, skipping.");
				skipped++;
				continue;
			}

			// Split frontmatter from body
			const frontmatterMatch = content.match(/^(---\n[\s\S]*?\n---\n?)([\s\S]*)$/);
			if (!frontmatterMatch) {
				console.log("  No frontmatter found, skipping.");
				skipped++;
				continue;
			}
			const originalFrontmatter = frontmatterMatch[1] as string;
			const originalBody = frontmatterMatch[2] as string;

			// Run aqeedah review stage
			console.log("  Running aqeedah review...");
			const reviewResult = await orchestrator.runAqeedahReview(originalBody);

			if (!(reviewResult.success && reviewResult.data)) {
				console.log(`  Review failed: ${reviewResult.error ?? "unknown error"}`);
				skipped++;
				continue;
			}

			const { verdict, issuesFound, summary, body: reviewedBody } = reviewResult.data;

			// Show summary
			console.log(`  Verdict: ${verdict}`);
			console.log(`  Summary: ${summary}`);

			if (verdict === "clean") {
				console.log("  No theological issues found.");
				clean++;
				continue;
			}

			// Show issues found
			console.log(`\n  Issues found (${issuesFound.length}):`);
			for (const issue of issuesFound) {
				console.log(`\n  [\x1b[33m${issue.type}\x1b[0m] ${issue.location}`);
				console.log(`    Original: ${issue.original}`);
				console.log(`    Issue: ${issue.issue}`);
				console.log(`    Fix: ${issue.fix}`);
			}

			// Show diff
			const patch = createPatch(
				`${articleSlug}.md`,
				originalBody,
				reviewedBody,
				"original",
				"reviewed",
			);
			console.log("");
			for (const line of patch.split("\n")) {
				if (line.startsWith("+") && !line.startsWith("+++")) {
					console.log(`\x1b[32m${line}\x1b[0m`);
				} else if (line.startsWith("-") && !line.startsWith("---")) {
					console.log(`\x1b[31m${line}\x1b[0m`);
				} else if (line.startsWith("@@")) {
					console.log(`\x1b[36m${line}\x1b[0m`);
				} else {
					console.log(line);
				}
			}

			// Integrity checks: blockquotes and footnotes
			const origBlockquotes = (originalBody.match(/^>/gm) || []).length;
			const reviewedBlockquotes = (reviewedBody.match(/^>/gm) || []).length;
			const origFootnotes = (originalBody.match(/\[\^\d+\]/g) || []).length;
			const reviewedFootnotes = (reviewedBody.match(/\[\^\d+\]/g) || []).length;

			if (origBlockquotes !== reviewedBlockquotes || origFootnotes !== reviewedFootnotes) {
				console.log("");
				console.log("  INTEGRITY WARNING:");
				if (origBlockquotes !== reviewedBlockquotes) {
					console.log(`     Blockquotes: ${origBlockquotes} → ${reviewedBlockquotes}`);
				}
				if (origFootnotes !== reviewedFootnotes) {
					console.log(`     Footnote refs: ${origFootnotes} → ${reviewedFootnotes}`);
				}
				console.log("");
			}

			if (options.dryRun) {
				console.log("\n  [dry-run] Would write changes.");
				rewritten++;
				continue;
			}

			// Prompt for confirmation unless --no-confirm
			let accept = !options.confirm; // --no-confirm sets options.confirm = false
			if (options.confirm !== false) {
				const choice = await p.select({
					message: "Accept changes?",
					options: [
						{ value: "accept", label: "Accept" },
						{ value: "skip", label: "Skip" },
						{ value: "abort", label: "Abort (stop processing)" },
					],
				});

				if (p.isCancel(choice) || choice === "abort") {
					console.log("\nAborted.");
					process.exit(0);
				}
				accept = choice === "accept";
			}

			if (accept) {
				// Update wordCount in frontmatter
				const { data: fmData } = parseFrontmatter(content);
				const oldWordCount = fmData.wordCount as number | undefined;
				const newWordCount = reviewedBody
					.replace(/```[\s\S]*?```/g, "")
					.replace(/`[^`]+`/g, "")
					.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
					.replace(/[#*_~>\-|]/g, " ")
					.split(/\s+/)
					.filter((w) => w.length > 0).length;

				let updatedFrontmatter = originalFrontmatter;
				if (oldWordCount && oldWordCount !== newWordCount) {
					updatedFrontmatter = originalFrontmatter.replace(
						/^wordCount: \d+$/m,
						`wordCount: ${newWordCount}`,
					);
				}

				publisher.writeArticle(articleSlug, updatedFrontmatter + reviewedBody);
				console.log(`  Written. (${oldWordCount} → ${newWordCount} words)`);
				rewritten++;
			} else {
				console.log("  Skipped.");
				skipped++;
			}
		}

		console.log("\n══════════════════════════════════════════════════════════");
		console.log(
			`  Done. ${rewritten} rewritten, ${clean} clean, ${skipped} skipped out of ${processed} articles.`,
		);
		console.log("══════════════════════════════════════════════════════════\n");

		process.exit(0);
	});

program
	.command("proofread")
	.description(
		"Proofread published articles for spelling, grammar, punctuation, and terminology consistency",
	)
	.argument("<slug>", 'Article slug or "all" for all articles')
	.option("--dry-run", "Preview issues and diffs without writing changes")
	.option("--no-confirm", "Auto-accept changes (skip interactive prompt)")
	.option("-m, --model <model>", "Model to use (opus|sonnet)", "opus")
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: sequential CLI pipeline handler
	.action(async (slug: string, options) => {
		const publisher = new ArticlePublisher();
		const orchestrator = new ContentOrchestrator({
			outputDir: "./output",
			model: options.model as "opus" | "sonnet",
		});

		// Determine which articles to process
		let slugs: string[];
		if (slug === "all") {
			const articles = publisher.listPublished();
			slugs = articles.map((a) => a.slug);
			console.log(`\nFound ${slugs.length} articles to proofread.\n`);
		} else {
			if (!publisher.exists(slug)) {
				console.error(`Article not found: ${slug}`);
				process.exit(1);
			}
			slugs = [slug];
		}

		let processed = 0;
		let corrected = 0;
		let clean = 0;
		let skipped = 0;

		const typeColors: Record<string, string> = {
			spelling: "\x1b[31m", // red
			grammar: "\x1b[33m", // yellow
			punctuation: "\x1b[36m", // cyan
			terminology: "\x1b[35m", // magenta
			clarity: "\x1b[34m", // blue
		};

		for (const articleSlug of slugs) {
			processed++;
			if (slugs.length > 1) {
				console.log(`\n[${processed}/${slugs.length}] ${articleSlug}`);
				console.log("─".repeat(60));
			}

			const content = publisher.getArticle(articleSlug);
			if (!content) {
				console.log("  Could not read article, skipping.");
				skipped++;
				continue;
			}

			// Split frontmatter from body
			const frontmatterMatch = content.match(/^(---\n[\s\S]*?\n---\n?)([\s\S]*)$/);
			if (!frontmatterMatch) {
				console.log("  No frontmatter found, skipping.");
				skipped++;
				continue;
			}
			const originalFrontmatter = frontmatterMatch[1] as string;
			const originalBody = frontmatterMatch[2] as string;

			// Run proofread stage
			console.log("  Running proofread...");
			const proofreadResult = await orchestrator.runProofread(originalBody);

			if (!(proofreadResult.success && proofreadResult.data)) {
				console.log(`  Proofread failed: ${proofreadResult.error ?? "unknown error"}`);
				skipped++;
				continue;
			}

			const { verdict, issuesFound, summary, body: proofreadBody } = proofreadResult.data;

			// Show summary
			console.log(`  Verdict: ${verdict}`);
			console.log(`  Summary: ${summary}`);

			if (verdict === "clean") {
				console.log("  No issues found.");
				clean++;
				continue;
			}

			// Show issues found with color-coded types
			console.log(`\n  Issues found (${issuesFound.length}):`);
			for (const issue of issuesFound) {
				const color = typeColors[issue.type] || "";
				console.log(`\n  [${color}${issue.type}\x1b[0m] ${issue.location}`);
				console.log(`    Original:   ${issue.original}`);
				console.log(`    Correction: ${issue.correction}`);
				console.log(`    Reason:     ${issue.reason}`);
			}

			// Show diff
			const patch = createPatch(
				`${articleSlug}.md`,
				originalBody,
				proofreadBody,
				"original",
				"proofread",
			);
			console.log("");
			for (const line of patch.split("\n")) {
				if (line.startsWith("+") && !line.startsWith("+++")) {
					console.log(`\x1b[32m${line}\x1b[0m`);
				} else if (line.startsWith("-") && !line.startsWith("---")) {
					console.log(`\x1b[31m${line}\x1b[0m`);
				} else if (line.startsWith("@@")) {
					console.log(`\x1b[36m${line}\x1b[0m`);
				} else {
					console.log(line);
				}
			}

			// Integrity checks: blockquotes and footnotes
			const origBlockquotes = (originalBody.match(/^>/gm) || []).length;
			const proofreadBlockquotes = (proofreadBody.match(/^>/gm) || []).length;
			const origFootnotes = (originalBody.match(/\[\^\d+\]/g) || []).length;
			const proofreadFootnotes = (proofreadBody.match(/\[\^\d+\]/g) || []).length;

			if (origBlockquotes !== proofreadBlockquotes || origFootnotes !== proofreadFootnotes) {
				console.log("");
				console.log("  INTEGRITY WARNING:");
				if (origBlockquotes !== proofreadBlockquotes) {
					console.log(`     Blockquotes: ${origBlockquotes} → ${proofreadBlockquotes}`);
				}
				if (origFootnotes !== proofreadFootnotes) {
					console.log(`     Footnote refs: ${origFootnotes} → ${proofreadFootnotes}`);
				}
				console.log("");
			}

			if (options.dryRun) {
				console.log("\n  [dry-run] Would write changes.");
				corrected++;
				continue;
			}

			// Prompt for confirmation unless --no-confirm
			let accept = !options.confirm; // --no-confirm sets options.confirm = false
			if (options.confirm !== false) {
				const choice = await p.select({
					message: "Accept changes?",
					options: [
						{ value: "accept", label: "Accept" },
						{ value: "skip", label: "Skip" },
						{ value: "abort", label: "Abort (stop processing)" },
					],
				});

				if (p.isCancel(choice) || choice === "abort") {
					console.log("\nAborted.");
					process.exit(0);
				}
				accept = choice === "accept";
			}

			if (accept) {
				// Update wordCount in frontmatter
				const { data: fmData } = parseFrontmatter(content);
				const oldWordCount = fmData.wordCount as number | undefined;
				const newWordCount = proofreadBody
					.replace(/```[\s\S]*?```/g, "")
					.replace(/`[^`]+`/g, "")
					.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
					.replace(/[#*_~>\-|]/g, " ")
					.split(/\s+/)
					.filter((w) => w.length > 0).length;

				let updatedFrontmatter = originalFrontmatter;
				if (oldWordCount && oldWordCount !== newWordCount) {
					updatedFrontmatter = originalFrontmatter.replace(
						/^wordCount: \d+$/m,
						`wordCount: ${newWordCount}`,
					);
				}

				publisher.writeArticle(articleSlug, updatedFrontmatter + proofreadBody);
				console.log(`  Written. (${oldWordCount} → ${newWordCount} words)`);
				corrected++;
			} else {
				console.log("  Skipped.");
				skipped++;
			}
		}

		console.log("\n══════════════════════════════════════════════════════════");
		console.log(
			`  Done. ${corrected} corrected, ${clean} clean, ${skipped} skipped out of ${processed} articles.`,
		);
		console.log("══════════════════════════════════════════════════════════\n");

		process.exit(0);
	});

program
	.command("title-ingress")
	.description("Generate improved title and ingress suggestions for published articles")
	.argument("<slug>", 'Article slug or "all" for all articles')
	.option("--no-confirm", "Auto-accept best suggestion (skip interactive prompt)")
	.option("-m, --model <model>", "Model to use (opus|sonnet)", "opus")
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: sequential CLI pipeline handler
	.action(async (slug: string, options) => {
		const publisher = new ArticlePublisher();
		const orchestrator = new ContentOrchestrator({
			outputDir: "./output",
			model: options.model as "opus" | "sonnet",
		});

		let slugs: string[];
		if (slug === "all") {
			const articles = publisher.listPublished();
			slugs = articles.map((a) => a.slug);
			console.log(`\nFound ${slugs.length} articles.\n`);
		} else {
			if (!publisher.exists(slug)) {
				console.error(`Article not found: ${slug}`);
				process.exit(1);
			}
			slugs = [slug];
		}

		let processed = 0;
		let updated = 0;
		let skipped = 0;

		for (const articleSlug of slugs) {
			processed++;
			if (slugs.length > 1) {
				console.log(`\n[${processed}/${slugs.length}] ${articleSlug}`);
				console.log("─".repeat(60));
			}

			const content = publisher.getArticle(articleSlug);
			if (!content) {
				console.log("  Could not read article, skipping.");
				skipped++;
				continue;
			}

			const frontmatterMatch = content.match(/^(---\n[\s\S]*?\n---\n?)([\s\S]*)$/);
			if (!frontmatterMatch) {
				console.log("  No frontmatter found, skipping.");
				skipped++;
				continue;
			}
			const originalFrontmatter = frontmatterMatch[1] as string;
			const originalBody = frontmatterMatch[2] as string;

			const { data: fmMeta } = parseFrontmatter(content);
			const currentTitle = (fmMeta.title as string) || "";
			const currentDescription = (fmMeta.description as string) || "";

			if (!currentTitle) {
				console.log("  No title in frontmatter, skipping.");
				skipped++;
				continue;
			}

			console.log(`  Current title:   ${currentTitle}`);
			console.log(`  Current ingress: ${currentDescription.slice(0, 80)}...`);
			console.log("  Generating suggestions...");

			const result = await orchestrator.runTitleIngress(originalBody, {
				title: currentTitle,
				description: currentDescription,
			});

			if (!(result.success && result.data)) {
				console.log(`  Failed: ${result.error ?? "unknown error"}`);
				skipped++;
				continue;
			}

			const data = result.data;

			// Show assessments
			console.log(`\n  \x1b[33mTitle assessment:\x1b[0m ${data.currentTitleAssessment}`);
			console.log(`  \x1b[33mIngress assessment:\x1b[0m ${data.currentDescriptionAssessment}`);

			// Show title suggestions
			console.log("\n  Title suggestions:");
			for (const [i, s] of data.titleSuggestions.entries()) {
				console.log(`    ${i + 1}. \x1b[32m${s.title}\x1b[0m`);
				console.log(`       ${s.reasoning}`);
			}

			// Show description suggestions
			console.log("\n  Ingress suggestions:");
			for (const [i, s] of data.descriptionSuggestions.entries()) {
				console.log(`    ${i + 1}. \x1b[32m${s.description}\x1b[0m`);
				console.log(`       ${s.reasoning}`);
			}

			console.log(`\n  \x1b[36mRecommendation:\x1b[0m ${data.recommendation}`);

			// Build selection options for title
			const titleOptions: Array<{ value: number; label: string }> = [
				{ value: -1, label: `Keep current: "${currentTitle}"` },
				...data.titleSuggestions.map((s, i) => ({
					value: i,
					label: `${i + 1}. ${s.title}`,
				})),
			];

			// Build selection options for description
			const descOptions: Array<{ value: number; label: string }> = [
				{ value: -1, label: "Keep current" },
				...data.descriptionSuggestions.map((s, i) => ({
					value: i,
					label: `${i + 1}. ${s.description.slice(0, 70)}...`,
				})),
			];

			let selectedTitle = currentTitle;
			let selectedDescription = currentDescription;

			if (options.confirm === false) {
				// --no-confirm: pick first suggestions
				if (data.titleSuggestions.length > 0) {
					// biome-ignore lint/style/noNonNullAssertion: length guard ensures element exists
					selectedTitle = data.titleSuggestions[0]!.title;
				}
				if (data.descriptionSuggestions.length > 0) {
					// biome-ignore lint/style/noNonNullAssertion: length guard ensures element exists
					selectedDescription = data.descriptionSuggestions[0]!.description;
				}
			} else {
				const titleChoice = await p.select({
					message: "Select title",
					options: titleOptions,
				});
				if (p.isCancel(titleChoice)) {
					console.log("\nAborted.");
					process.exit(0);
				}
				if ((titleChoice as number) >= 0) {
					// biome-ignore lint/style/noNonNullAssertion: index bounds checked above
					selectedTitle = data.titleSuggestions[titleChoice as number]!.title;
				}

				const descChoice = await p.select({
					message: "Select ingress",
					options: descOptions,
				});
				if (p.isCancel(descChoice)) {
					console.log("\nAborted.");
					process.exit(0);
				}
				if ((descChoice as number) >= 0) {
					// biome-ignore lint/style/noNonNullAssertion: index bounds checked above
					selectedDescription = data.descriptionSuggestions[descChoice as number]!.description;
				}
			}

			// Check if anything changed
			if (selectedTitle === currentTitle && selectedDescription === currentDescription) {
				console.log("  No changes selected.");
				skipped++;
				continue;
			}

			// Apply changes to frontmatter
			let updatedFrontmatter = originalFrontmatter;
			if (selectedTitle !== currentTitle) {
				updatedFrontmatter = updatedFrontmatter.replace(
					`title: "${currentTitle}"`,
					`title: "${selectedTitle}"`,
				);
			}
			if (selectedDescription !== currentDescription) {
				updatedFrontmatter = updatedFrontmatter.replace(
					`description: "${currentDescription}"`,
					`description: "${selectedDescription}"`,
				);
			}

			publisher.writeArticle(articleSlug, updatedFrontmatter + originalBody);
			const changes: string[] = [];
			if (selectedTitle !== currentTitle) changes.push(`title: "${selectedTitle}"`);
			if (selectedDescription !== currentDescription) changes.push("description updated");
			console.log(`  ✓ Written. (${changes.join(", ")})`);
			updated++;
		}

		console.log("\n══════════════════════════════════════════════════════════");
		console.log(`  Done. ${updated} updated, ${skipped} skipped out of ${processed} articles.`);
		console.log("══════════════════════════════════════════════════════════\n");

		process.exit(0);
	});

program
	.command("swedish-voice")
	.description(
		"Review published articles for Swedish naturalness — fix anglicisms, AI rhetoric, repetition loops, and English rhythm",
	)
	.argument("<slug>", 'Article slug or "all" for all articles')
	.option("--dry-run", "Preview issues and diffs without writing changes")
	.option("--no-confirm", "Auto-accept changes (skip interactive prompt)")
	.option(
		"--enrich",
		"Focus on enriching prose with Swedish language tools (inversion, compounds, connectors, rhythm) rather than fixing problems",
	)
	.option("-m, --model <model>", "Model to use (opus|sonnet)", "opus")
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: sequential CLI pipeline handler
	.action(async (slug: string, options) => {
		const publisher = new ArticlePublisher();
		const orchestrator = new ContentOrchestrator({
			outputDir: "./output",
			model: options.model as "opus" | "sonnet",
		});

		const mode: "fix" | "enrich" = options.enrich ? "enrich" : "fix";

		// Determine which articles to process
		let slugs: string[];
		if (slug === "all") {
			const articles = publisher.listPublished();
			slugs = articles.map((a) => a.slug);
			const modeLabel = mode === "enrich" ? "Swedish enrichment" : "Swedish voice review";
			console.log(`\nFound ${slugs.length} articles for ${modeLabel}.\n`);
		} else {
			if (!publisher.exists(slug)) {
				console.error(`Article not found: ${slug}`);
				process.exit(1);
			}
			slugs = [slug];
		}

		let processed = 0;
		let corrected = 0;
		let clean = 0;
		let skipped = 0;

		const typeColors: Record<string, string> = {
			anglicism: "\x1b[31m", // red
			rhetoric: "\x1b[33m", // yellow
			repetition: "\x1b[36m", // cyan
			overexplain: "\x1b[35m", // magenta
			rhythm: "\x1b[34m", // blue
			idiom: "\x1b[32m", // green
			hedging: "\x1b[33;1m", // bright yellow
			connector: "\x1b[34;1m", // bright blue
			abstraction: "\x1b[31;1m", // bright red
		};

		for (const articleSlug of slugs) {
			processed++;
			if (slugs.length > 1) {
				console.log(`\n[${processed}/${slugs.length}] ${articleSlug}`);
				console.log("─".repeat(60));
			}

			const content = publisher.getArticle(articleSlug);
			if (!content) {
				console.log("  Could not read article, skipping.");
				skipped++;
				continue;
			}

			// Split frontmatter from body
			const frontmatterMatch = content.match(/^(---\n[\s\S]*?\n---\n?)([\s\S]*)$/);
			if (!frontmatterMatch) {
				console.log("  No frontmatter found, skipping.");
				skipped++;
				continue;
			}
			const originalFrontmatter = frontmatterMatch[1] as string;
			const originalBody = frontmatterMatch[2] as string;

			// Extract title and description from frontmatter
			const { data: fmMeta } = parseFrontmatter(content);
			const articleTitle = fmMeta.title as string | undefined;
			const articleDescription = fmMeta.description as string | undefined;

			// Run swedish voice stage
			const modeLog = mode === "enrich" ? "Swedish enrichment" : "Swedish voice review";
			console.log(`  Running ${modeLog}...`);
			let voiceResult: Awaited<ReturnType<typeof orchestrator.runSwedishVoice>>;
			try {
				voiceResult = await orchestrator.runSwedishVoice(
					originalBody,
					{
						title: articleTitle,
						description: articleDescription,
					},
					mode,
				);
			} catch (err) {
				console.log(`  Swedish voice crashed: ${err}`);
				skipped++;
				continue;
			}

			if (!(voiceResult.success && voiceResult.data)) {
				console.log(`  Swedish voice failed: ${voiceResult.error ?? "unknown error"}`);
				skipped++;
				continue;
			}

			const {
				verdict,
				correctedTitle,
				correctedDescription,
				issuesFound,
				summary,
				body: voiceBody,
			} = voiceResult.data;

			// Show summary
			console.log(`  Verdict: ${verdict}`);
			if (correctedTitle) {
				console.log(`  Title: "${articleTitle}" → "${correctedTitle}"`);
			}
			if (correctedDescription) {
				console.log(
					`  Description: "${articleDescription?.slice(0, 60)}..." → "${correctedDescription.slice(0, 60)}..."`,
				);
			}
			console.log(`  Summary: ${summary}`);

			if (verdict === "clean") {
				console.log("  No issues found — article sounds naturally Swedish.");
				clean++;
				continue;
			}

			// Show issues found with color-coded types
			console.log(`\n  Issues found (${issuesFound.length}):`);
			for (const issue of issuesFound) {
				const color = typeColors[issue.type] || "";
				console.log(`\n  [${color}${issue.type}\x1b[0m] ${issue.location}`);
				console.log(`    Original:   ${issue.original}`);
				console.log(`    Correction: ${issue.correction}`);
				console.log(`    Reason:     ${issue.reason}`);
			}

			// Show diff
			const patch = createPatch(
				`${articleSlug}.md`,
				originalBody,
				voiceBody,
				"original",
				"swedish-voice",
			);
			console.log("");
			for (const line of patch.split("\n")) {
				if (line.startsWith("+") && !line.startsWith("+++")) {
					console.log(`\x1b[32m${line}\x1b[0m`);
				} else if (line.startsWith("-") && !line.startsWith("---")) {
					console.log(`\x1b[31m${line}\x1b[0m`);
				} else if (line.startsWith("@@")) {
					console.log(`\x1b[36m${line}\x1b[0m`);
				} else {
					console.log(line);
				}
			}

			// Integrity checks: blockquotes and footnotes
			const origBlockquotes = (originalBody.match(/^>/gm) || []).length;
			const voiceBlockquotes = (voiceBody.match(/^>/gm) || []).length;
			const origFootnotes = (originalBody.match(/\[\^\d+\]/g) || []).length;
			const voiceFootnotes = (voiceBody.match(/\[\^\d+\]/g) || []).length;

			if (origBlockquotes !== voiceBlockquotes || origFootnotes !== voiceFootnotes) {
				console.log("");
				console.log("  INTEGRITY WARNING:");
				if (origBlockquotes !== voiceBlockquotes) {
					console.log(`     Blockquotes: ${origBlockquotes} → ${voiceBlockquotes}`);
				}
				if (origFootnotes !== voiceFootnotes) {
					console.log(`     Footnote refs: ${origFootnotes} → ${voiceFootnotes}`);
				}
				console.log("");
			}

			if (options.dryRun) {
				console.log("\n  [dry-run] Would write changes.");
				corrected++;
				continue;
			}

			// Prompt for confirmation unless --no-confirm
			let accept = !options.confirm; // --no-confirm sets options.confirm = false
			if (options.confirm !== false) {
				const choice = await p.select({
					message: "Accept changes?",
					options: [
						{ value: "accept", label: "Accept" },
						{ value: "skip", label: "Skip" },
						{ value: "abort", label: "Abort (stop processing)" },
					],
				});

				if (p.isCancel(choice) || choice === "abort") {
					console.log("\nAborted.");
					process.exit(0);
				}
				accept = choice === "accept";
			}

			if (accept) {
				// Update frontmatter fields
				const oldWordCount = fmMeta.wordCount as number | undefined;
				const newWordCount = voiceBody
					.replace(/```[\s\S]*?```/g, "")
					.replace(/`[^`]+`/g, "")
					.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
					.replace(/[#*_~>\-|]/g, " ")
					.split(/\s+/)
					.filter((w) => w.length > 0).length;

				let updatedFrontmatter = originalFrontmatter;
				if (oldWordCount && oldWordCount !== newWordCount) {
					updatedFrontmatter = updatedFrontmatter.replace(
						/^wordCount: \d+$/m,
						`wordCount: ${newWordCount}`,
					);
				}
				if (correctedTitle && articleTitle) {
					updatedFrontmatter = updatedFrontmatter.replace(
						`title: "${articleTitle}"`,
						`title: "${correctedTitle}"`,
					);
				}
				if (correctedDescription && articleDescription) {
					updatedFrontmatter = updatedFrontmatter.replace(
						`description: "${articleDescription}"`,
						`description: "${correctedDescription}"`,
					);
				}

				publisher.writeArticle(articleSlug, updatedFrontmatter + voiceBody);
				const changes: string[] = [];
				if (oldWordCount !== newWordCount) changes.push(`words: ${oldWordCount} → ${newWordCount}`);
				if (correctedTitle) changes.push("title updated");
				if (correctedDescription) changes.push("description updated");
				console.log(`  Written. (${changes.join(", ")})`);
				corrected++;
			} else {
				console.log("  Skipped.");
				skipped++;
			}
		}

		console.log("\n══════════════════════════════════════════════════════════");
		console.log(
			`  Done. ${corrected} corrected, ${clean} clean, ${skipped} skipped out of ${processed} articles.`,
		);
		console.log("══════════════════════════════════════════════════════════\n");

		process.exit(0);
	});

program.parse();
