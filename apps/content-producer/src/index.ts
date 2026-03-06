#!/usr/bin/env node

import { execSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
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

// ─── Article loop utilities ──────────────────────────────────────────────────

/** Count words in a markdown body (strips code blocks, links, markup) */
function countWords(body: string): number {
	return body
		.replace(/```[\s\S]*?```/g, "")
		.replace(/`[^`]+`/g, "")
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.replace(/[#*_~>\-|]/g, " ")
		.split(/\s+/)
		.filter((w) => w.length > 0).length;
}

/** Resolve a slug argument to an array of article slugs. Exits on error. */
function resolveArticleSlugs(slug: string, publisher: ArticlePublisher, verb: string): string[] {
	if (slug === "all") {
		const articles = publisher.listPublished();
		const slugs = articles.map((a) => a.slug);
		console.log(`\nFound ${slugs.length} articles to ${verb}.\n`);
		return slugs;
	}
	if (!publisher.exists(slug)) {
		console.error(`Article not found: ${slug}`);
		process.exit(1);
	}
	return [slug];
}

/** Read an article and split frontmatter from body. Returns null (and logs) on failure. */
function readArticle(
	publisher: ArticlePublisher,
	articleSlug: string,
): { content: string; originalFrontmatter: string; originalBody: string } | null {
	const content = publisher.getArticle(articleSlug);
	if (!content) {
		console.log("  Could not read article, skipping.");
		return null;
	}
	const m = content.match(/^(---\n[\s\S]*?\n---\n?)([\s\S]*)$/);
	if (!m) {
		console.log("  No frontmatter found, skipping.");
		return null;
	}
	return { content, originalFrontmatter: m[1] as string, originalBody: m[2] as string };
}

/** Print a colored unified diff to stdout. */
function printDiff(slug: string, original: string, updated: string, label: string): void {
	const patch = createPatch(`${slug}.md`, original, updated, "original", label);
	console.log("");
	for (const line of patch.split("\n")) {
		if (line.startsWith("+") && !line.startsWith("+++")) console.log(`\x1b[32m${line}\x1b[0m`);
		else if (line.startsWith("-") && !line.startsWith("---")) console.log(`\x1b[31m${line}\x1b[0m`);
		else if (line.startsWith("@@")) console.log(`\x1b[36m${line}\x1b[0m`);
		else console.log(line);
	}
}

/** Warn if blockquote or footnote counts changed between original and updated body. */
function checkIntegrity(original: string, updated: string): void {
	const origBq = (original.match(/^>/gm) || []).length;
	const updBq = (updated.match(/^>/gm) || []).length;
	const origFn = (original.match(/\[\^\d+\]/g) || []).length;
	const updFn = (updated.match(/\[\^\d+\]/g) || []).length;
	if (origBq === updBq && origFn === updFn) return;
	console.log("");
	console.log("  INTEGRITY WARNING:");
	if (origBq !== updBq) console.log(`     Blockquotes: ${origBq} → ${updBq}`);
	if (origFn !== updFn) console.log(`     Footnote refs: ${origFn} → ${updFn}`);
	console.log("");
}

/**
 * Handle dry-run / confirm / write for a polish-style command.
 * Writes newBody with updated wordCount frontmatter on accept.
 * Returns "written", "dry-run", or "skipped". Calls process.exit(0) on abort.
 */
async function confirmAndWrite(
	publisher: ArticlePublisher,
	articleSlug: string,
	fullContent: string,
	originalFrontmatter: string,
	newBody: string,
	options: { dryRun?: boolean; confirm: boolean },
	extraFrontmatterUpdate?: (fm: string) => string,
): Promise<"written" | "dry-run" | "skipped"> {
	if (options.dryRun) {
		console.log("\n  [dry-run] Would write changes.");
		return "dry-run";
	}

	let accept = !options.confirm;
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

	if (!accept) {
		console.log("  Skipped.");
		return "skipped";
	}

	const { data: fmData } = parseFrontmatter(fullContent);
	const oldWordCount = fmData.wordCount as number | undefined;
	const newWordCount = countWords(newBody);

	let updatedFrontmatter = originalFrontmatter;
	if (oldWordCount && oldWordCount !== newWordCount) {
		updatedFrontmatter = updatedFrontmatter.replace(
			/^wordCount: \d+$/m,
			`wordCount: ${newWordCount}`,
		);
	}
	if (extraFrontmatterUpdate) {
		updatedFrontmatter = extraFrontmatterUpdate(updatedFrontmatter);
	}

	publisher.writeArticle(articleSlug, updatedFrontmatter + newBody);
	console.log(`  Written. (${oldWordCount} → ${newWordCount} words)`);
	return "written";
}

// ─── Spellcheck helpers ──────────────────────────────────────────────────────

interface SpellIssue {
	word: string;
	line: number;
	context: string;
	suggestions: string[];
}

/** Returns true if a word looks like an Arabic/Islamic transliteration. */
function isTransliteration(word: string): boolean {
	// Has diacritical marks common in Arabic transliteration
	if (/[āīūṣḍṭẓḥʿʾṃṅšğçñżőŻŠĆŃŁ]/.test(word)) return true;
	// Contains Arabic Unicode characters (including ﷻ ﷺ)
	if (/[\u0600-\u06FF\uFE70-\uFEFF\uFD3E-\uFDFF]/.test(word)) return true;
	// Common Arabic/Islamic terms without diacritics
	if (
		/^(al-|ibn-?|abu-?)/i.test(word) ||
		/^(tawakkul|dhikr|qiblah?|qadr|qadar|sunnah?|tawbah?|waswas|nafs|fitrah|fitra|qalb|quwwah|hasad|ghibtah|hisab|muhasaba|sharia|shari|hadith|iman|ihsan|salah|salat|zakat|sawm|hajj|umrah|halal|haram|fiqh|fatwa|ijtihad|ijma|qiyas|maqasid|khalifah?|ummah?|akhirah?|jannah|jahannam|barzakh|isnad|matn|sahih|hasan|daif|mawdu|tafsir|tajwid|tilawah|khutbah?|nikah|talaq|waqf|zuhd|taqwa|sabr|shukr|rida|tawba|istighfar|muezzin|minbar|mihrab|qibla|adhan|iqamah|wudu|ghusl|tayammum|janazah|fidyah|kaffarah|sadaqah?|khums|barakah?|niyyah?|ikhlas|riya|ujb|kibr|hasad|hirs|bukhl|israf|ghafla|ghaflah)s?$/i.test(
			word.replace(/\.$/, ""),
		)
	)
		return true;
	return false;
}

/** Returns true if a word is likely a proper name (capitalized, not sentence-start). */
function isLikelyProperName(word: string): boolean {
	return /^[A-ZÄÖÅÉÈ][a-zäöåéèü]/.test(word) && word.length > 1;
}

/** Load custom wordlist from file (one word per line, # comments, blank lines skipped). */
function loadWordlist(path: string): Set<string> {
	if (!existsSync(path)) return new Set();
	const lines = readFileSync(path, "utf-8").split("\n");
	const words = new Set<string>();
	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed && !trimmed.startsWith("#")) words.add(trimmed);
	}
	return words;
}

/** Append words to the custom wordlist file. */
function appendToWordlist(path: string, words: string[]): void {
	const content = `\n${words.join("\n")}\n`;
	appendFileSync(path, content, "utf-8");
}

/** Strip markdown formatting to extract checkable text, preserving line numbers. */
function stripMarkdown(body: string): string {
	const lines = body.split("\n");
	return lines
		.map((line) => {
			// Keep line structure for line-number tracking
			// Remove footnote definitions entirely
			if (/^\[\^\d+\]:/.test(line)) return "";
			let l = line;
			// Remove footnote references
			l = l.replace(/\[\^\d+\]/g, "");
			// Remove blockquote markers
			l = l.replace(/^>\s*/, "");
			// Remove heading markers
			l = l.replace(/^#{1,6}\s+/, "");
			// Remove bold/italic markers (keep text)
			l = l.replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1");
			// Remove links [text](url) -> text
			l = l.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
			// Remove URLs
			l = l.replace(/https?:\/\/\S+/g, "");
			return l;
		})
		.join("\n");
}

/** Run hunspell on article body and return filtered misspellings with context. */
function spellcheckBody(
	body: string,
	dictPath: string,
	customWords: Set<string>,
): SpellIssue[] {
	const stripped = stripMarkdown(body);
	const bodyLines = body.split("\n");

	// Run hunspell in pipe mode (-a) for per-word results with suggestions
	let hunspellOutput: string;
	try {
		hunspellOutput = execSync(`hunspell -d ${dictPath} -a`, {
			input: stripped,
			encoding: "utf-8",
			maxBuffer: 10 * 1024 * 1024,
		});
	} catch {
		return [];
	}

	const issues: SpellIssue[] = [];
	const seen = new Set<string>();
	const outputLines = hunspellOutput.split("\n");

	// hunspell -a output: first line is version, then for each input line:
	// * = correct, & word count offset: suggestions, # word offset (no suggestions), empty line = next input line
	let currentLine = 0; // 0-indexed into bodyLines (offset by frontmatter lines already stripped)

	for (const ol of outputLines) {
		if (ol === "") {
			currentLine++;
			continue;
		}
		if (ol.startsWith("@") || ol.startsWith("*") || ol.startsWith("+") || ol.startsWith("-")) {
			continue;
		}

		let word = "";
		let suggestions: string[] = [];

		if (ol.startsWith("& ")) {
			// & word count offset: suggestion1, suggestion2, ...
			const parts = ol.match(/^& (\S+) \d+ \d+: (.*)$/);
			if (parts?.[1] && parts[2]) {
				word = parts[1];
				suggestions = parts[2].split(", ").map((s) => s.trim());
			}
		} else if (ol.startsWith("# ")) {
			// # word offset (no suggestions)
			const parts = ol.match(/^# (\S+)/);
			if (parts?.[1]) word = parts[1];
		}

		if (!word) continue;

		// Strip trailing punctuation for matching purposes
		const cleanWord = word.replace(/[.,;:!?)]+$/, "");
		if (!cleanWord) continue;

		// Filter: skip if in custom wordlist (try with and without punctuation)
		if (
			customWords.has(word) ||
			customWords.has(word.toLowerCase()) ||
			customWords.has(cleanWord) ||
			customWords.has(cleanWord.toLowerCase())
		)
			continue;
		// Filter: skip Arabic/Islamic transliterations
		if (isTransliteration(word) || isTransliteration(cleanWord)) continue;
		// Filter: skip likely proper names (capitalized)
		if (isLikelyProperName(word)) continue;
		// Filter: skip words inside blockquotes (archaic Swedish in historical quotes)
		const contextLineIdx0 = Math.max(0, Math.min(currentLine, bodyLines.length - 1));
		if (bodyLines[contextLineIdx0]?.startsWith(">")) continue;
		// Filter: skip short English/Latin common words
		if (/^[a-z]+$/.test(cleanWord) && cleanWord.length <= 3) continue;
		// Filter: skip if already reported this word on this line
		const key = `${cleanWord}:${currentLine}`;
		if (seen.has(key)) continue;
		seen.add(key);

		// Get context line from original body
		const contextRaw = bodyLines[contextLineIdx0] ?? "";
		const context =
			contextRaw.length > 100
				? `${contextRaw.slice(0, 100)}…`
				: contextRaw;

		issues.push({
			word: cleanWord,
			line: contextLineIdx0 + 1,
			context,
			suggestions,
		});
	}

	return issues;
}

// ─── Polish commands ──────────────────────────────────────────────────────────

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

		const slugs = resolveArticleSlugs(slug, publisher, "re-polish");
		let processed = 0;
		let changed = 0;
		let skipped = 0;

		for (const articleSlug of slugs) {
			processed++;
			if (slugs.length > 1) {
				console.log(`\n[${processed}/${slugs.length}] ${articleSlug}`);
				console.log("─".repeat(60));
			}

			const article = readArticle(publisher, articleSlug);
			if (!article) {
				skipped++;
				continue;
			}
			const { content, originalFrontmatter, originalBody } = article;

			console.log("  Running polish stage...");
			const polishResult = await orchestrator.runPolish(originalBody);

			if (!(polishResult.success && polishResult.data)) {
				console.log(`  Polish failed: ${polishResult.error ?? "unknown error"}`);
				skipped++;
				continue;
			}

			const polishedBody = polishResult.data.body;
			if (polishedBody.trim() === originalBody.trim()) {
				console.log("  No changes — article already clean.");
				skipped++;
				continue;
			}

			checkIntegrity(originalBody, polishedBody);
			printDiff(articleSlug, originalBody, polishedBody, "polished");

			if (polishResult.data.edits) {
				console.log("\n  Editor notes:");
				console.log(`  ${polishResult.data.edits.split("\n").join("\n  ")}`);
			}

			const outcome = await confirmAndWrite(
				publisher,
				articleSlug,
				content,
				originalFrontmatter,
				polishedBody,
				options,
			);
			if (outcome === "skipped") skipped++;
			else changed++;
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

		const slugs = resolveArticleSlugs(slug, publisher, "review");
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

			const article = readArticle(publisher, articleSlug);
			if (!article) {
				skipped++;
				continue;
			}
			const { content, originalFrontmatter, originalBody } = article;

			console.log("  Running aqeedah review...");
			const reviewResult = await orchestrator.runAqeedahReview(originalBody);

			if (!(reviewResult.success && reviewResult.data)) {
				console.log(`  Review failed: ${reviewResult.error ?? "unknown error"}`);
				skipped++;
				continue;
			}

			const { verdict, issuesFound, summary, body: reviewedBody } = reviewResult.data;

			console.log(`  Verdict: ${verdict}`);
			console.log(`  Summary: ${summary}`);

			if (verdict === "clean") {
				console.log("  No theological issues found.");
				clean++;
				continue;
			}

			console.log(`\n  Issues found (${issuesFound.length}):`);
			for (const issue of issuesFound) {
				console.log(`\n  [\x1b[33m${issue.type}\x1b[0m] ${issue.location}`);
				console.log(`    Original: ${issue.original}`);
				console.log(`    Issue: ${issue.issue}`);
				console.log(`    Fix: ${issue.fix}`);
			}

			printDiff(articleSlug, originalBody, reviewedBody, "reviewed");
			checkIntegrity(originalBody, reviewedBody);

			const outcome = await confirmAndWrite(
				publisher,
				articleSlug,
				content,
				originalFrontmatter,
				reviewedBody,
				options,
			);
			if (outcome === "skipped") skipped++;
			else rewritten++;
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

		const slugs = resolveArticleSlugs(slug, publisher, "proofread");
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

			const article = readArticle(publisher, articleSlug);
			if (!article) {
				skipped++;
				continue;
			}
			const { content, originalFrontmatter, originalBody } = article;

			console.log("  Running proofread...");
			const proofreadResult = await orchestrator.runProofread(originalBody);

			if (!(proofreadResult.success && proofreadResult.data)) {
				console.log(`  Proofread failed: ${proofreadResult.error ?? "unknown error"}`);
				skipped++;
				continue;
			}

			const { verdict, issuesFound, summary, body: proofreadBody } = proofreadResult.data;

			console.log(`  Verdict: ${verdict}`);
			console.log(`  Summary: ${summary}`);

			if (verdict === "clean") {
				console.log("  No issues found.");
				clean++;
				continue;
			}

			console.log(`\n  Issues found (${issuesFound.length}):`);
			for (const issue of issuesFound) {
				const color = typeColors[issue.type] || "";
				console.log(`\n  [${color}${issue.type}\x1b[0m] ${issue.location}`);
				console.log(`    Original:   ${issue.original}`);
				console.log(`    Correction: ${issue.correction}`);
				console.log(`    Reason:     ${issue.reason}`);
			}

			printDiff(articleSlug, originalBody, proofreadBody, "proofread");
			checkIntegrity(originalBody, proofreadBody);

			const outcome = await confirmAndWrite(
				publisher,
				articleSlug,
				content,
				originalFrontmatter,
				proofreadBody,
				options,
			);
			if (outcome === "skipped") skipped++;
			else corrected++;
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

			const article = readArticle(publisher, articleSlug);
			if (!article) {
				skipped++;
				continue;
			}
			const { content, originalFrontmatter, originalBody } = article;

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
		const modeLabel = mode === "enrich" ? "Swedish enrichment" : "Swedish voice review";

		let slugs: string[];
		if (slug === "all") {
			const articles = publisher.listPublished();
			slugs = articles.map((a) => a.slug);
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

			const article = readArticle(publisher, articleSlug);
			if (!article) {
				skipped++;
				continue;
			}
			const { content, originalFrontmatter, originalBody } = article;

			const { data: fmMeta } = parseFrontmatter(content);
			const articleTitle = fmMeta.title as string | undefined;
			const articleDescription = fmMeta.description as string | undefined;

			console.log(`  Running ${modeLabel}...`);
			let voiceResult: Awaited<ReturnType<typeof orchestrator.runSwedishVoice>>;
			try {
				voiceResult = await orchestrator.runSwedishVoice(
					originalBody,
					{ title: articleTitle, description: articleDescription },
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

			console.log(`  Verdict: ${verdict}`);
			if (correctedTitle) console.log(`  Title: "${articleTitle}" → "${correctedTitle}"`);
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

			console.log(`\n  Issues found (${issuesFound.length}):`);
			for (const issue of issuesFound) {
				const color = typeColors[issue.type] || "";
				console.log(`\n  [${color}${issue.type}\x1b[0m] ${issue.location}`);
				console.log(`    Original:   ${issue.original}`);
				console.log(`    Correction: ${issue.correction}`);
				console.log(`    Reason:     ${issue.reason}`);
			}

			printDiff(articleSlug, originalBody, voiceBody, "swedish-voice");
			checkIntegrity(originalBody, voiceBody);

			const outcome = await confirmAndWrite(
				publisher,
				articleSlug,
				content,
				originalFrontmatter,
				voiceBody,
				options,
				(fm) => {
					let updated = fm;
					if (correctedTitle && articleTitle) {
						updated = updated.replace(`title: "${articleTitle}"`, `title: "${correctedTitle}"`);
					}
					if (correctedDescription && articleDescription) {
						updated = updated.replace(
							`description: "${articleDescription}"`,
							`description: "${correctedDescription}"`,
						);
					}
					return updated;
				},
			);
			if (outcome === "skipped") skipped++;
			else corrected++;
		}

		console.log("\n══════════════════════════════════════════════════════════");
		console.log(
			`  Done. ${corrected} corrected, ${clean} clean, ${skipped} skipped out of ${processed} articles.`,
		);
		console.log("══════════════════════════════════════════════════════════\n");
		process.exit(0);
	});

program
	.command("elevate")
	.description(
		"Elevate prose intelligence — smarter word choices, conceptual sentence links, compression, resonance",
	)
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

		const slugs = resolveArticleSlugs(slug, publisher, "elevate");
		let processed = 0;
		let elevated = 0;
		let clean = 0;
		let skipped = 0;

		for (const articleSlug of slugs) {
			processed++;
			if (slugs.length > 1) {
				console.log(`\n[${processed}/${slugs.length}] ${articleSlug}`);
				console.log("─".repeat(60));
			}

			const article = readArticle(publisher, articleSlug);
			if (!article) {
				skipped++;
				continue;
			}
			const { content, originalFrontmatter, originalBody } = article;

			console.log("  Running elevate...");
			let elevateResult: Awaited<ReturnType<typeof orchestrator.runElevate>>;
			try {
				elevateResult = await orchestrator.runElevate(originalBody);
			} catch (err) {
				console.log(`  Elevate crashed: ${err}`);
				skipped++;
				continue;
			}

			if (!(elevateResult.success && elevateResult.data)) {
				console.log(`  Elevate failed: ${elevateResult.error ?? "unknown error"}`);
				skipped++;
				continue;
			}

			const { verdict, changesCount, changes, summary, body: elevatedBody } = elevateResult.data;

			console.log(`  Verdict: ${verdict} (${changesCount} changes)`);
			console.log(`  Summary: ${summary}`);

			if (verdict === "clean") {
				console.log("  No improvements found — text already intellectually dense.");
				clean++;
				continue;
			}

			console.log(`\n  Changes (${changes.length}):`);
			for (const change of changes) {
				console.log(`\n  [\x1b[36m${change.location}\x1b[0m]`);
				console.log(`    \x1b[31m- ${change.original}\x1b[0m`);
				console.log(`    \x1b[32m+ ${change.replacement}\x1b[0m`);
				console.log(`    \x1b[33m  ${change.why}\x1b[0m`);
			}

			printDiff(articleSlug, originalBody, elevatedBody, "elevated");
			checkIntegrity(originalBody, elevatedBody);

			const outcome = await confirmAndWrite(
				publisher,
				articleSlug,
				content,
				originalFrontmatter,
				elevatedBody,
				options,
			);
			if (outcome === "skipped") skipped++;
			else elevated++;
		}

		console.log("\n══════════════════════════════════════════════════════════");
		console.log(
			`  Done. ${elevated} elevated, ${clean} clean, ${skipped} skipped out of ${processed} articles.`,
		);
		console.log("══════════════════════════════════════════════════════════\n");
		process.exit(0);
	});

program
	.command("flow")
	.description(
		"Perfect sentence architecture — split overloaded sentences, merge choppy ones, fix transitions between every sentence pair",
	)
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

		const slugs = resolveArticleSlugs(slug, publisher, "check flow");
		let processed = 0;
		let restructured = 0;
		let clean = 0;
		let skipped = 0;

		for (const articleSlug of slugs) {
			processed++;
			if (slugs.length > 1) {
				console.log(`\n[${processed}/${slugs.length}] ${articleSlug}`);
				console.log("─".repeat(60));
			}

			const article = readArticle(publisher, articleSlug);
			if (!article) {
				skipped++;
				continue;
			}
			const { content, originalFrontmatter, originalBody } = article;

			console.log("  Running flow...");
			let flowResult: Awaited<ReturnType<typeof orchestrator.runFlow>>;
			try {
				flowResult = await orchestrator.runFlow(originalBody);
			} catch (err) {
				console.log(`  Flow crashed: ${err}`);
				skipped++;
				continue;
			}

			if (!(flowResult.success && flowResult.data)) {
				console.log(`  Flow failed: ${flowResult.error ?? "unknown error"}`);
				skipped++;
				continue;
			}

			const { verdict, changesCount, changes, summary, body: flowBody } = flowResult.data;

			console.log(`  Verdict: ${verdict} (${changesCount} changes)`);
			console.log(`  Summary: ${summary}`);

			if (verdict === "clean") {
				console.log("  Sentence structure already flawless.");
				clean++;
				continue;
			}

			console.log(`\n  Changes (${changes.length}):`);
			for (const change of changes) {
				console.log(`\n  [\x1b[36m${change.type}\x1b[0m] ${change.location}`);
				console.log(`    \x1b[31m- ${change.original}\x1b[0m`);
				console.log(`    \x1b[32m+ ${change.replacement}\x1b[0m`);
				console.log(`    \x1b[33m  ${change.why}\x1b[0m`);
			}

			printDiff(articleSlug, originalBody, flowBody, "flow");
			checkIntegrity(originalBody, flowBody);

			const outcome = await confirmAndWrite(
				publisher,
				articleSlug,
				content,
				originalFrontmatter,
				flowBody,
				options,
			);
			if (outcome === "skipped") skipped++;
			else restructured++;
		}

		console.log("\n══════════════════════════════════════════════════════════");
		console.log(
			`  Done. ${restructured} restructured, ${clean} clean, ${skipped} skipped out of ${processed} articles.`,
		);
		console.log("══════════════════════════════════════════════════════════\n");
		process.exit(0);
	});

program
	.command("language")
	.description(
		"Check word/phrase level Swedish naturalness — non-existent words, anglicisms, AI filler phrases, gender errors, preposition calques",
	)
	.argument("<slug>", 'Article slug or "all" for all articles')
	.option("--dry-run", "Preview diffs without writing changes")
	.option("--no-confirm", "Auto-accept changes (skip interactive prompt)")
	.option("-m, --model <model>", "Model to use (opus|sonnet)", "sonnet")
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: sequential CLI pipeline handler
	.action(async (slug: string, options) => {
		const publisher = new ArticlePublisher();
		const orchestrator = new ContentOrchestrator({
			outputDir: "./output",
			model: options.model as "opus" | "sonnet",
		});

		const slugs = resolveArticleSlugs(slug, publisher, "check language");
		let processed = 0;
		let corrected = 0;
		let clean = 0;
		let skipped = 0;

		for (const articleSlug of slugs) {
			processed++;
			if (slugs.length > 1) {
				console.log(`\n[${processed}/${slugs.length}] ${articleSlug}`);
				console.log("─".repeat(60));
			}

			const article = readArticle(publisher, articleSlug);
			if (!article) {
				skipped++;
				continue;
			}
			const { content, originalFrontmatter, originalBody } = article;

			console.log("  Running language check...");
			let languageResult: Awaited<ReturnType<typeof orchestrator.runLanguage>>;
			try {
				languageResult = await orchestrator.runLanguage(originalBody);
			} catch (err) {
				console.log(`  Language check crashed: ${err}`);
				skipped++;
				continue;
			}

			if (!(languageResult.success && languageResult.data)) {
				console.log(`  Language check failed: ${languageResult.error ?? "unknown error"}`);
				skipped++;
				continue;
			}

			const { verdict, issuesFound, summary, body: languageBody } = languageResult.data;

			console.log(`  Verdict: ${verdict} (${issuesFound.length} issues)`);
			console.log(`  Summary: ${summary}`);

			if (verdict === "clean") {
				console.log("  Language already natural — no issues found.");
				clean++;
				continue;
			}

			console.log(`\n  Issues (${issuesFound.length}):`);
			for (const issue of issuesFound) {
				console.log(`\n  [\x1b[36m${issue.type}\x1b[0m] ${issue.location}`);
				console.log(`    \x1b[31m- ${issue.original}\x1b[0m`);
				console.log(`    \x1b[32m+ ${issue.correction}\x1b[0m`);
				console.log(`    \x1b[33m  ${issue.reason}\x1b[0m`);
			}

			printDiff(articleSlug, originalBody, languageBody, "language");
			checkIntegrity(originalBody, languageBody);

			const outcome = await confirmAndWrite(
				publisher,
				articleSlug,
				content,
				originalFrontmatter,
				languageBody,
				options,
			);
			if (outcome === "skipped") skipped++;
			else corrected++;
		}

		console.log("\n══════════════════════════════════════════════════════════");
		console.log(
			`  Done. ${corrected} corrected, ${clean} clean, ${skipped} skipped out of ${processed} articles.`,
		);
		console.log("══════════════════════════════════════════════════════════\n");
		process.exit(0);
	});

program
	.command("compress")
	.description(
		"Compress verbose phrases into precise single words — particle-verbs, weak verb+noun, adverbial phrases",
	)
	.argument("<slug>", 'Article slug or "all" for all articles')
	.option("--dry-run", "Preview diffs without writing changes")
	.option("--no-confirm", "Auto-accept changes (skip interactive prompt)")
	.option("-m, --model <model>", "Model to use (opus|sonnet)", "opus")
	.action(async (slug: string, options) => {
		const publisher = new ArticlePublisher();
		const orchestrator = new ContentOrchestrator({
			outputDir: "./output",
			model: options.model as "opus" | "sonnet",
		});

		const slugs = resolveArticleSlugs(slug, publisher, "compress");
		let processed = 0;
		let compressed = 0;
		let clean = 0;
		let skipped = 0;

		for (const articleSlug of slugs) {
			processed++;
			if (slugs.length > 1) {
				console.log(`\n[${processed}/${slugs.length}] ${articleSlug}`);
				console.log("─".repeat(60));
			}

			const article = readArticle(publisher, articleSlug);
			if (!article) {
				skipped++;
				continue;
			}
			const { content, originalFrontmatter, originalBody } = article;

			console.log("  Running compress...");
			let compressResult: Awaited<ReturnType<typeof orchestrator.runCompress>>;
			try {
				compressResult = await orchestrator.runCompress(originalBody);
			} catch (err) {
				console.log(`  Compress crashed: ${err}`);
				skipped++;
				continue;
			}

			if (!(compressResult.success && compressResult.data)) {
				console.log(`  Compress failed: ${compressResult.error ?? "unknown error"}`);
				skipped++;
				continue;
			}

			const { verdict, changesCount, changes, summary, body: compressedBody } = compressResult.data;

			console.log(`  Verdict: ${verdict} (${changesCount} changes)`);
			console.log(`  Summary: ${summary}`);

			if (verdict === "clean") {
				console.log("  No compressions found — text already lexically precise.");
				clean++;
				continue;
			}

			console.log(`\n  Changes (${changes.length}):`);
			for (const change of changes) {
				console.log(`\n  [\x1b[36m${change.location}\x1b[0m]`);
				console.log(`    \x1b[31m- ${change.original}\x1b[0m`);
				console.log(`    \x1b[32m+ ${change.replacement}\x1b[0m`);
				console.log(`    \x1b[33m  ${change.why}\x1b[0m`);
			}

			printDiff(articleSlug, originalBody, compressedBody, "compressed");
			checkIntegrity(originalBody, compressedBody);

			const outcome = await confirmAndWrite(
				publisher,
				articleSlug,
				content,
				originalFrontmatter,
				compressedBody,
				options,
			);
			if (outcome === "skipped") skipped++;
			else compressed++;
		}

		console.log("\n══════════════════════════════════════════════════════════");
		console.log(
			`  Done. ${compressed} compressed, ${clean} clean, ${skipped} skipped out of ${processed} articles.`,
		);
		console.log("══════════════════════════════════════════════════════════\n");
		process.exit(0);
	});

program
	.command("cohesion")
	.description(
		"Check narrative coherence — orphan quotes, abrupt topic jumps, loose endings, unprepared introductions",
	)
	.argument("<slug>", 'Article slug or "all" for all articles')
	.option("--dry-run", "Preview diffs without writing changes")
	.option("--no-confirm", "Auto-accept changes (skip interactive prompt)")
	.option("-m, --model <model>", "Model to use (opus|sonnet)", "opus")
	.action(async (slug: string, options) => {
		const publisher = new ArticlePublisher();
		const orchestrator = new ContentOrchestrator({
			outputDir: "./output",
			model: options.model as "opus" | "sonnet",
		});

		const slugs = resolveArticleSlugs(slug, publisher, "check cohesion");
		let processed = 0;
		let revised = 0;
		let clean = 0;
		let skipped = 0;

		for (const articleSlug of slugs) {
			processed++;
			if (slugs.length > 1) {
				console.log(`\n[${processed}/${slugs.length}] ${articleSlug}`);
				console.log("─".repeat(60));
			}

			const article = readArticle(publisher, articleSlug);
			if (!article) {
				skipped++;
				continue;
			}
			const { content, originalFrontmatter, originalBody } = article;

			console.log("  Running cohesion check...");
			let cohesionResult: Awaited<ReturnType<typeof orchestrator.runCohesion>>;
			try {
				cohesionResult = await orchestrator.runCohesion(originalBody);
			} catch (err) {
				console.log(`  Cohesion crashed: ${err}`);
				skipped++;
				continue;
			}

			if (!(cohesionResult.success && cohesionResult.data)) {
				console.log(`  Cohesion failed: ${cohesionResult.error ?? "unknown error"}`);
				skipped++;
				continue;
			}

			const { verdict, changesCount, changes, summary, body: revisedBody } = cohesionResult.data;

			console.log(`  Verdict: ${verdict} (${changesCount} changes)`);
			console.log(`  Summary: ${summary}`);

			if (verdict === "cohesive") {
				console.log("  Essay already reads coherently.");
				clean++;
				continue;
			}

			console.log(`\n  Issues fixed (${changes.length}):`);
			for (const change of changes) {
				console.log(`\n  [\x1b[33m${change.type}\x1b[0m] ${change.location}`);
				console.log(`    \x1b[31mProblem:\x1b[0m ${change.problem}`);
				console.log(`    \x1b[32mFix:\x1b[0m    ${change.fix}`);
			}

			printDiff(articleSlug, originalBody, revisedBody, "cohesion");
			checkIntegrity(originalBody, revisedBody);

			const outcome = await confirmAndWrite(
				publisher,
				articleSlug,
				content,
				originalFrontmatter,
				revisedBody,
				options,
			);
			if (outcome === "skipped") skipped++;
			else revised++;
		}

		console.log("\n══════════════════════════════════════════════════════════");
		console.log(
			`  Done. ${revised} revised, ${clean} clean, ${skipped} skipped out of ${processed} articles.`,
		);
		console.log("══════════════════════════════════════════════════════════\n");
		process.exit(0);
	});

program
	.command("ground")
	.description(
		"Anchor abstract concepts in concrete human moments — Islamic terms, psychological states, historical observations",
	)
	.argument("<slug>", 'Article slug or "all" for all articles')
	.option("--dry-run", "Preview diffs without writing changes")
	.option("--no-confirm", "Auto-accept changes (skip interactive prompt)")
	.option("-m, --model <model>", "Model to use (opus|sonnet)", "sonnet")
	.action(async (slug: string, options) => {
		const publisher = new ArticlePublisher();
		const orchestrator = new ContentOrchestrator({
			outputDir: "./output",
			model: options.model as "opus" | "sonnet",
		});

		const slugs = resolveArticleSlugs(slug, publisher, "ground");
		let processed = 0;
		let grounded = 0;
		let clean = 0;
		let skipped = 0;

		for (const articleSlug of slugs) {
			processed++;
			if (slugs.length > 1) {
				console.log(`\n[${processed}/${slugs.length}] ${articleSlug}`);
				console.log("─".repeat(60));
			}

			const article = readArticle(publisher, articleSlug);
			if (!article) {
				skipped++;
				continue;
			}
			const { content, originalFrontmatter, originalBody } = article;

			console.log("  Running ground...");
			let groundResult: Awaited<ReturnType<typeof orchestrator.runGround>>;
			try {
				groundResult = await orchestrator.runGround(originalBody);
			} catch (err) {
				console.log(`  Ground crashed: ${err}`);
				skipped++;
				continue;
			}

			if (!(groundResult.success && groundResult.data)) {
				console.log(`  Ground failed: ${groundResult.error ?? "unknown error"}`);
				skipped++;
				continue;
			}

			const { verdict, changesCount, changes, summary, body: groundedBody } = groundResult.data;

			console.log(`  Verdict: ${verdict} (${changesCount} additions)`);
			console.log(`  Summary: ${summary}`);

			if (verdict === "clean") {
				console.log("  No floating abstractions found — text already well grounded.");
				clean++;
				continue;
			}

			console.log(`\n  Additions (${changes.length}):`);
			for (const change of changes) {
				console.log(`\n  [\x1b[36m${change.location}\x1b[0m]`);
				console.log(`    \x1b[33m  Anchor: ${change.original}\x1b[0m`);
				console.log(`    \x1b[32m+ ${change.addition}\x1b[0m`);
				console.log(`    \x1b[33m  ${change.why}\x1b[0m`);
			}

			printDiff(articleSlug, originalBody, groundedBody, "grounded");
			checkIntegrity(originalBody, groundedBody);

			const outcome = await confirmAndWrite(
				publisher,
				articleSlug,
				content,
				originalFrontmatter,
				groundedBody,
				options,
			);
			if (outcome === "skipped") skipped++;
			else grounded++;
		}

		console.log("\n══════════════════════════════════════════════════════════");
		console.log(
			`  Done. ${grounded} grounded, ${clean} clean, ${skipped} skipped out of ${processed} articles.`,
		);
		console.log("══════════════════════════════════════════════════════════\n");
		process.exit(0);
	});

program
	.command("scaffold")
	.description(
		'Trim decorative "Det är den som..." and ". Som [scenario]." closers that have become formulaic through overuse',
	)
	.argument("<slug>", 'Article slug or "all" for all articles')
	.option("--dry-run", "Preview diffs without writing changes")
	.option("--no-confirm", "Auto-accept changes (skip interactive prompt)")
	.option("-m, --model <model>", "Model to use (opus|sonnet)", "sonnet")
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: sequential CLI pipeline handler
	.action(async (slug: string, options) => {
		const publisher = new ArticlePublisher();
		const orchestrator = new ContentOrchestrator({
			outputDir: "./output",
			model: options.model as "opus" | "sonnet",
		});

		const slugs = resolveArticleSlugs(slug, publisher, "scaffold");
		let processed = 0;
		let trimmed = 0;
		let clean = 0;
		let skipped = 0;

		for (const articleSlug of slugs) {
			processed++;
			if (slugs.length > 1) {
				console.log(`\n[${processed}/${slugs.length}] ${articleSlug}`);
				console.log("─".repeat(60));
			}

			const article = readArticle(publisher, articleSlug);
			if (!article) {
				skipped++;
				continue;
			}
			const { content, originalFrontmatter, originalBody } = article;

			console.log("  Running scaffold...");
			let scaffoldResult: Awaited<ReturnType<typeof orchestrator.runScaffold>>;
			try {
				scaffoldResult = await orchestrator.runScaffold(originalBody);
			} catch (err) {
				console.log(`  Scaffold crashed: ${err}`);
				skipped++;
				continue;
			}

			if (!(scaffoldResult.success && scaffoldResult.data)) {
				console.log(`  Scaffold failed: ${scaffoldResult.error ?? "unknown error"}`);
				skipped++;
				continue;
			}

			const { verdict, changesCount, changes, summary, body: trimmedBody } = scaffoldResult.data;

			console.log(`  Verdict: ${verdict} (${changesCount} removals)`);
			console.log(`  Summary: ${summary}`);

			if (verdict === "clean") {
				console.log("  No decorative scaffolding found — text already lean.");
				clean++;
				continue;
			}

			console.log(`\n  Changes (${changes.length}):`);
			for (const change of changes) {
				const actionColor = change.action === "remove" ? "\x1b[31m" : "\x1b[33m";
				const actionLabel = change.action === "remove" ? "REMOVE" : "ABSORB";
				console.log(`\n  [${actionColor}${actionLabel}\x1b[0m] \x1b[36m${change.location}\x1b[0m`);
				console.log(`    \x1b[31m- ${change.original}\x1b[0m`);
				if (change.action === "absorb") {
					console.log(`    \x1b[32m+ ${change.result}\x1b[0m`);
				}
				console.log(`    \x1b[33m  ${change.why}\x1b[0m`);
			}

			printDiff(articleSlug, originalBody, trimmedBody, "trimmed");
			checkIntegrity(originalBody, trimmedBody);

			const outcome = await confirmAndWrite(
				publisher,
				articleSlug,
				content,
				originalFrontmatter,
				trimmedBody,
				options,
			);
			if (outcome === "skipped") skipped++;
			else trimmed++;
		}

		console.log("\n══════════════════════════════════════════════════════════");
		console.log(
			`  Done. ${trimmed} trimmed, ${clean} clean, ${skipped} skipped out of ${processed} articles.`,
		);
		console.log("══════════════════════════════════════════════════════════\n");
		process.exit(0);
	});

program
	.command("transliterate")
	.description(
		"Verify and correct academic Arabic transliteration with full diacritical marks (ā, ī, ū, ḥ, ṣ, ḍ, ṭ, ẓ, ʿ, ʾ)",
	)
	.argument("<slug>", 'Article slug or "all" for all articles')
	.option("--dry-run", "Preview diffs without writing changes")
	.option("--no-confirm", "Auto-accept changes (skip interactive prompt)")
	.option("-m, --model <model>", "Model to use (opus|sonnet)", "sonnet")
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: sequential CLI pipeline handler
	.action(async (slug: string, options) => {
		const publisher = new ArticlePublisher();
		const orchestrator = new ContentOrchestrator({
			outputDir: "./output",
			model: options.model as "opus" | "sonnet",
		});

		const slugs = resolveArticleSlugs(slug, publisher, "transliterate");
		let processed = 0;
		let corrected = 0;
		let clean = 0;
		let skipped = 0;

		for (const articleSlug of slugs) {
			processed++;
			if (slugs.length > 1) {
				console.log(`\n[${processed}/${slugs.length}] ${articleSlug}`);
				console.log("─".repeat(60));
			}

			const article = readArticle(publisher, articleSlug);
			if (!article) {
				skipped++;
				continue;
			}
			const { content, originalFrontmatter, originalBody } = article;

			console.log("  Running transliterate...");
			let result: Awaited<ReturnType<typeof orchestrator.runTransliterate>>;
			try {
				result = await orchestrator.runTransliterate(originalBody);
			} catch (err) {
				console.log(`  Transliterate crashed: ${err}`);
				skipped++;
				continue;
			}

			if (!(result.success && result.data)) {
				console.log(`  Transliterate failed: ${result.error ?? "unknown error"}`);
				skipped++;
				continue;
			}

			const { verdict, changesCount, changes, summary, body: correctedBody } = result.data;

			console.log(`  Verdict: ${verdict} (${changesCount} corrections)`);
			console.log(`  Summary: ${summary}`);

			if (verdict === "clean") {
				console.log("  All transliteration already correct.");
				clean++;
				continue;
			}

			console.log(`\n  Corrections (${changes.length} unique terms):`);
			for (const change of changes) {
				console.log(
					`    \x1b[31m${change.original}\x1b[0m → \x1b[32m${change.corrected}\x1b[0m  (${change.occurrences}x in ${change.locations.join(", ")})`,
				);
			}

			printDiff(articleSlug, originalBody, correctedBody, "transliterated");
			checkIntegrity(originalBody, correctedBody);

			const outcome = await confirmAndWrite(
				publisher,
				articleSlug,
				content,
				originalFrontmatter,
				correctedBody,
				options,
			);
			if (outcome === "skipped") skipped++;
			else corrected++;
		}

		console.log("\n══════════════════════════════════════════════════════════");
		console.log(
			`  Done. ${corrected} corrected, ${clean} clean, ${skipped} skipped out of ${processed} articles.`,
		);
		console.log("══════════════════════════════════════════════════════════\n");
		process.exit(0);
	});

program
	.command("deepen")
	.description(
		"Find where the essay illustrates rather than argues, and add the missing reasoning steps",
	)
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

		const slugs = resolveArticleSlugs(slug, publisher, "deepen");
		let processed = 0;
		let deepened = 0;
		let clean = 0;
		let skipped = 0;

		for (const articleSlug of slugs) {
			processed++;
			if (slugs.length > 1) {
				console.log(`\n[${processed}/${slugs.length}] ${articleSlug}`);
				console.log("─".repeat(60));
			}

			const article = readArticle(publisher, articleSlug);
			if (!article) {
				skipped++;
				continue;
			}
			const { content, originalFrontmatter, originalBody } = article;

			console.log("  Running deepen...");
			let deepenResult: Awaited<ReturnType<typeof orchestrator.runDeepen>>;
			try {
				deepenResult = await orchestrator.runDeepen(originalBody);
			} catch (err) {
				console.log(`  Deepen crashed: ${err}`);
				skipped++;
				continue;
			}

			if (!(deepenResult.success && deepenResult.data)) {
				console.log(`  Deepen failed: ${deepenResult.error ?? "unknown error"}`);
				skipped++;
				continue;
			}

			const { verdict, thesis, gaps, changes, changesCount, summary, body: deepenedBody } =
				deepenResult.data;

			console.log(`  Thesis: ${thesis}`);
			console.log(`  Verdict: ${verdict} (${changesCount} changes)`);
			console.log(`  Summary: ${summary}`);

			if (verdict === "clean") {
				console.log("  No argumentation gaps found — essay already argues well.");
				clean++;
				continue;
			}

			console.log(`\n  Gaps (${gaps.length}):`);
			for (const gap of gaps) {
				console.log(`    [\x1b[36m${gap.type}\x1b[0m] ${gap.location}`);
				console.log(`      ${gap.description.slice(0, 120)}${gap.description.length > 120 ? "..." : ""}`);
			}

			console.log(`\n  Changes (${changes.length}):`);
			for (const change of changes) {
				console.log(`\n  [\x1b[36m${change.type}\x1b[0m] ${change.location}`);
				console.log(`    \x1b[31m- ${change.before.slice(0, 120)}${change.before.length > 120 ? "..." : ""}\x1b[0m`);
				console.log(`    \x1b[32m+ ${change.after.slice(0, 120)}${change.after.length > 120 ? "..." : ""}\x1b[0m`);
				console.log(`    \x1b[33m  ${change.reasoning}\x1b[0m`);
			}

			printDiff(articleSlug, originalBody, deepenedBody, "deepened");
			checkIntegrity(originalBody, deepenedBody);

			const outcome = await confirmAndWrite(
				publisher,
				articleSlug,
				content,
				originalFrontmatter,
				deepenedBody,
				options,
			);
			if (outcome === "skipped") skipped++;
			else deepened++;
		}

		console.log("\n══════════════════════════════════════════════════════════");
		console.log(
			`  Done. ${deepened} deepened, ${clean} clean, ${skipped} skipped out of ${processed} articles.`,
		);
		console.log("══════════════════════════════════════════════════════════\n");
		process.exit(0);
	});

program
	.command("brilliance")
	.description(
		"Search for exceptional additions (quotes, references, arguments) that would make articles significantly stronger for a secular Swedish reader",
	)
	.argument("<slug>", 'Article slug or "all" for all articles')
	.option("--dry-run", "Preview additions without writing changes")
	.option("--no-confirm", "Auto-accept changes (skip interactive prompt)")
	.option("-m, --model <model>", "Model to use (opus|sonnet)", "opus")
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: sequential CLI pipeline handler
	.action(async (slug: string, options) => {
		const publisher = new ArticlePublisher();
		const orchestrator = new ContentOrchestrator({
			outputDir: "./output",
			model: options.model as "opus" | "sonnet",
		});

		const slugs = resolveArticleSlugs(slug, publisher, "search for brilliance");
		let processed = 0;
		let enriched = 0;
		let clean = 0;
		let skipped = 0;

		for (const articleSlug of slugs) {
			processed++;
			if (slugs.length > 1) {
				console.log(`\n[${processed}/${slugs.length}] ${articleSlug}`);
				console.log("─".repeat(60));
			}

			const article = readArticle(publisher, articleSlug);
			if (!article) {
				skipped++;
				continue;
			}
			const { content, originalFrontmatter, originalBody } = article;

			console.log("  Running brilliance search...");
			let brillianceResult: Awaited<ReturnType<typeof orchestrator.runBrilliance>>;
			try {
				brillianceResult = await orchestrator.runBrilliance(originalBody);
			} catch (err) {
				console.log(`  Brilliance crashed: ${err}`);
				skipped++;
				continue;
			}

			if (!(brillianceResult.success && brillianceResult.data)) {
				console.log(`  Brilliance failed: ${brillianceResult.error ?? "unknown error"}`);
				skipped++;
				continue;
			}

			const {
				verdict,
				additionsCount,
				additions,
				searchesPerformed,
				summary,
				body: enrichedBody,
			} = brillianceResult.data;

			console.log(`\n  Searches (${searchesPerformed.length}):`);
			for (const search of searchesPerformed) {
				console.log(`    [${search.tool}] ${search.query}`);
				console.log(`      → ${search.result}`);
			}

			console.log(`\n  Verdict: ${verdict} (${additionsCount} additions)`);
			console.log(`  Summary: ${summary}`);

			if (verdict === "clean") {
				console.log("  No exceptional additions found.");
				clean++;
				continue;
			}

			console.log(`\n  Additions (${additions.length}):`);
			for (const addition of additions) {
				console.log(`\n  [\x1b[36m${addition.type}\x1b[0m] ${addition.location}`);
				console.log(
					`    \x1b[32m+ ${addition.content.slice(0, 200)}${addition.content.length > 200 ? "..." : ""}\x1b[0m`,
				);
				console.log(`    \x1b[34m  Source: ${addition.source}\x1b[0m`);
				console.log(`    \x1b[33m  ${addition.why}\x1b[0m`);
			}

			printDiff(articleSlug, originalBody, enrichedBody, "enriched");

			const outcome = await confirmAndWrite(
				publisher,
				articleSlug,
				content,
				originalFrontmatter,
				enrichedBody,
				options,
			);
			if (outcome === "skipped") skipped++;
			else enriched++;
		}

		console.log("\n══════════════════════════════════════════════════════════");
		console.log(
			`  Done. ${enriched} enriched, ${clean} clean, ${skipped} skipped out of ${processed} articles.`,
		);
		console.log("══════════════════════════════════════════════════════════\n");
		process.exit(0);
	});

program
	.command("spellcheck")
	.description(
		"Run Swedish spell-check on articles using hunspell — catches misspellings, skips Arabic transliterations and English references",
	)
	.argument("<slug>", 'Article slug or "all" for all articles')
	.option(
		"--wordlist <path>",
		"Path to custom wordlist file (one word per line)",
		"data/hunspell/wordlist.txt",
	)
	.option("--add", "Interactively add unknown words to the custom wordlist")
	.action(async (slug: string, options) => {
		const publisher = new ArticlePublisher();
		const slugs = resolveArticleSlugs(slug, publisher, "spellcheck");

		// Find project root by walking up to find data/hunspell/sv.aff
		let projectRoot = process.cwd();
		for (let i = 0; i < 10; i++) {
			if (existsSync(resolve(projectRoot, "data/hunspell/sv.aff"))) break;
			const parent = resolve(projectRoot, "..");
			if (parent === projectRoot) break;
			projectRoot = parent;
		}
		const dictPath = resolve(projectRoot, "data/hunspell/sv");
		// Verify hunspell + dictionary exist
		try {
			execSync(`hunspell -d ${dictPath} -l <<< "test"`, {
				encoding: "utf-8",
			});
		} catch {
			console.error(
				"hunspell not found or Swedish dictionary missing at data/hunspell/sv.{aff,dic}",
			);
			console.error("Install hunspell: pacman -S hunspell (Arch) / apt install hunspell (Debian)");
			process.exit(1);
		}

		// Load custom wordlist
		const wordlistPath = resolve(projectRoot, options.wordlist as string);
		const customWords = loadWordlist(wordlistPath);
		console.log(`Custom wordlist: ${customWords.size} words from ${wordlistPath}\n`);

		let totalIssues = 0;
		let cleanCount = 0;
		const allNewWords: Set<string> = new Set();

		for (const articleSlug of slugs) {
			const article = readArticle(publisher, articleSlug);
			if (!article) continue;
			const { originalBody } = article;

			const misspelled = spellcheckBody(originalBody, dictPath, customWords);

			if (misspelled.length === 0) {
				cleanCount++;
				continue;
			}

			console.log(`\x1b[1m${articleSlug}\x1b[0m (${misspelled.length} issues):`);
			for (const { word, line, context, suggestions } of misspelled) {
				const suggStr =
					suggestions.length > 0 ? ` → ${suggestions.slice(0, 3).join(", ")}` : "";
				console.log(`  L${line}: \x1b[31m${word}\x1b[0m${suggStr}`);
				console.log(`         \x1b[90m${context}\x1b[0m`);
			}
			console.log("");
			totalIssues += misspelled.length;

			if (options.add) {
				for (const { word } of misspelled) {
					allNewWords.add(word);
				}
			}
		}

		console.log("══════════════════════════════════════════════════════════");
		console.log(
			`  ${slugs.length} articles checked. ${cleanCount} clean, ${totalIssues} issues found.`,
		);
		console.log("══════════════════════════════════════════════════════════\n");

		if (options.add && allNewWords.size > 0) {
			const result = await p.multiselect({
				message: "Select words to add to custom wordlist:",
				options: [...allNewWords].sort().map((w) => ({ value: w, label: w })),
			});
			if (!p.isCancel(result)) {
				const toAdd = result as string[];
				if (toAdd.length > 0) {
					appendToWordlist(wordlistPath, toAdd);
					console.log(`Added ${toAdd.length} words to ${wordlistPath}`);
				}
			}
		}

		process.exit(0);
	});

program.parse();
