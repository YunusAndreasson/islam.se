#!/usr/bin/env node

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { ContentOrchestrator } from "@islam-se/orchestrator";
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
				console.log(`  Perspectives: ${result.data.perspectives.length}`);
				console.log(`  Facts: ${result.data.facts.length}`);
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
