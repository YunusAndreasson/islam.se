#!/usr/bin/env node

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import * as p from "@clack/prompts";
import {
	ContentOrchestrator,
	type EnrichedIdea,
	type EnrichedIdeationOutput,
	IdeationService,
} from "@islam-se/orchestrator";
import { Command } from "commander";

const program = new Command();

program
	.name("produce")
	.description("Content production orchestration for Islam.se")
	.version("0.1.0");

program
	.command("article")
	.description("Produce a complete article on a topic")
	.argument("<topic>", "The topic to write about")
	.option("-l, --length <words>", "Target word count", "2500")
	.option("-q, --quality <score>", "Minimum quality score (1-10)", "7.5")
	.option("--no-arabic", "Exclude Arabic quotes")
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
		console.log(`Target: ${options.length} words`);
		console.log(`Quality threshold: ${options.quality}/10`);
		console.log(`Arabic quotes: ${options.arabic !== false ? "Yes" : "No"}`);
		console.log("");

		const orchestrator = new ContentOrchestrator({
			outputDir,
			model: options.model as "opus" | "sonnet",
			qualityThreshold: Number.parseFloat(options.quality),
			targetWordCount: Number.parseInt(options.length, 10),
			includeArabic: options.arabic !== false,
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
	.option("--no-arabic", "Exclude Arabic quotes")
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
			includeArabic: options.arabic !== false,
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
				targetWordCount: 2500,
				includeArabic: true,
				maxRevisions: 2,
			});

			// Use the selected idea's thesis as the refined topic
			const refinedTopic = `${selectedIdea.title}: ${selectedIdea.thesis}`;
			const pipelineResult = await orchestrator.produce(refinedTopic);

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

program.parse();
