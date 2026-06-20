#!/usr/bin/env node

import { execSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
import { config } from "dotenv";

// Load environment variables from project root
const __prodDir = dirname(fileURLToPath(import.meta.url));
config({ path: join(__prodDir, "..", "..", "..", ".env") });

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
	.option(
		"-R, --resume",
		"Resume from saved checkpoints (research.json, fact-check.json, draft-meta.json)",
	)
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
		if (options.resume) {
			console.log("Resume: enabled (checkpoints will be reused)");
		}
		console.log("");

		const orchestrator = new ContentOrchestrator({
			outputDir,
			model: options.model as "opus" | "sonnet",
			qualityThreshold: Number.parseFloat(options.quality),
			maxRevisions: Number.parseInt(options.revisions, 10),
		});

		try {
			const result = await orchestrator.produce(topic, undefined, undefined, {
				resume: options.resume === true,
			});

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

/**
 * Parse one hunspell `-a` output line into a flagged word + suggestions, or null
 * if it is not a misspelling line. `& word n offset: s1, s2` carries suggestions;
 * `# word offset` is a miss with none.
 */
function parseHunspellLine(ol: string): { word: string; suggestions: string[] } | null {
	if (ol.startsWith("& ")) {
		const parts = ol.match(/^& (\S+) \d+ \d+: (.*)$/);
		if (parts?.[1] && parts[2]) {
			return { word: parts[1], suggestions: parts[2].split(", ").map((s) => s.trim()) };
		}
	} else if (ol.startsWith("# ")) {
		const parts = ol.match(/^# (\S+)/);
		if (parts?.[1]) return { word: parts[1], suggestions: [] };
	}
	return null;
}

/**
 * Whether a hunspell-flagged word should be ignored: present in the custom
 * wordlist (with or without trailing punctuation, case-folded), an Arabic/Islamic
 * transliteration, a likely proper name, inside a blockquote (archaic Swedish in
 * historical quotes), or a short English/Latin word.
 */
function shouldSkipMisspelling(
	word: string,
	cleanWord: string,
	customWords: Set<string>,
	contextLine: string,
): boolean {
	if (
		customWords.has(word) ||
		customWords.has(word.toLowerCase()) ||
		customWords.has(cleanWord) ||
		customWords.has(cleanWord.toLowerCase())
	)
		return true;
	if (isTransliteration(word) || isTransliteration(cleanWord)) return true;
	if (isLikelyProperName(word)) return true;
	if (contextLine.startsWith(">")) return true;
	if (/^[a-z]+$/.test(cleanWord) && cleanWord.length <= 3) return true;
	return false;
}

/** Run hunspell on article body and return filtered misspellings with context. */
function spellcheckBody(body: string, dictPath: string, customWords: Set<string>): SpellIssue[] {
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
		// @ version banner, * + - correct/affix/compound — never misspellings
		if (ol.startsWith("@") || ol.startsWith("*") || ol.startsWith("+") || ol.startsWith("-")) {
			continue;
		}

		const parsed = parseHunspellLine(ol);
		if (!parsed) continue;

		// Strip trailing punctuation for matching purposes
		const cleanWord = parsed.word.replace(/[.,;:!?)]+$/, "");
		if (!cleanWord) continue;

		const lineIdx = Math.max(0, Math.min(currentLine, bodyLines.length - 1));
		if (shouldSkipMisspelling(parsed.word, cleanWord, customWords, bodyLines[lineIdx] ?? "")) {
			continue;
		}

		// Skip if already reported this word on this line
		const key = `${cleanWord}:${currentLine}`;
		if (seen.has(key)) continue;
		seen.add(key);

		// Get context line from original body
		const contextRaw = bodyLines[lineIdx] ?? "";
		const context = contextRaw.length > 100 ? `${contextRaw.slice(0, 100)}…` : contextRaw;

		issues.push({ word: cleanWord, line: lineIdx + 1, context, suggestions: parsed.suggestions });
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
				voiceResult = await orchestrator.runSwedishVoice(originalBody, {
					title: articleTitle,
					description: articleDescription,
				});
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

			const {
				verdict,
				thesis,
				gaps,
				changes,
				changesCount,
				summary,
				body: deepenedBody,
			} = deepenResult.data;

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
				console.log(
					`      ${gap.description.slice(0, 120)}${gap.description.length > 120 ? "..." : ""}`,
				);
			}

			console.log(`\n  Changes (${changes.length}):`);
			for (const change of changes) {
				console.log(`\n  [\x1b[36m${change.type}\x1b[0m] ${change.location}`);
				console.log(
					`    \x1b[31m- ${change.before.slice(0, 120)}${change.before.length > 120 ? "..." : ""}\x1b[0m`,
				);
				console.log(
					`    \x1b[32m+ ${change.after.slice(0, 120)}${change.after.length > 120 ? "..." : ""}\x1b[0m`,
				);
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

/** Walk up from cwd (max 10 levels) to the repo root that holds data/hunspell/sv.aff. */
function findHunspellProjectRoot(): string {
	let projectRoot = process.cwd();
	for (let i = 0; i < 10; i++) {
		if (existsSync(resolve(projectRoot, "data/hunspell/sv.aff"))) break;
		const parent = resolve(projectRoot, "..");
		if (parent === projectRoot) break;
		projectRoot = parent;
	}
	return projectRoot;
}

/** Verify hunspell + the Swedish dictionary are usable; exit with guidance if not. */
function ensureHunspellAvailable(dictPath: string): void {
	try {
		execSync(`hunspell -d ${dictPath} -l <<< "test"`, { encoding: "utf-8" });
	} catch {
		console.error("hunspell not found or Swedish dictionary missing at data/hunspell/sv.{aff,dic}");
		console.error("Install hunspell: pacman -S hunspell (Arch) / apt install hunspell (Debian)");
		process.exit(1);
	}
}

/** Print one article's misspellings (word, line, top suggestions, context). */
function printArticleIssues(articleSlug: string, misspelled: SpellIssue[]): void {
	console.log(`\x1b[1m${articleSlug}\x1b[0m (${misspelled.length} issues):`);
	for (const { word, line, context, suggestions } of misspelled) {
		const suggStr = suggestions.length > 0 ? ` → ${suggestions.slice(0, 3).join(", ")}` : "";
		console.log(`  L${line}: \x1b[31m${word}\x1b[0m${suggStr}`);
		console.log(`         \x1b[90m${context}\x1b[0m`);
	}
	console.log("");
}

/** Offer the accumulated unknown words for interactive addition to the wordlist. */
async function promptAddWords(wordlistPath: string, words: Set<string>): Promise<void> {
	const result = await p.multiselect({
		message: "Select words to add to custom wordlist:",
		options: [...words].sort().map((w) => ({ value: w, label: w })),
	});
	if (p.isCancel(result)) return;
	const toAdd = result as string[];
	if (toAdd.length > 0) {
		appendToWordlist(wordlistPath, toAdd);
		console.log(`Added ${toAdd.length} words to ${wordlistPath}`);
	}
}

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

		const projectRoot = findHunspellProjectRoot();
		const dictPath = resolve(projectRoot, "data/hunspell/sv");
		ensureHunspellAvailable(dictPath);

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

			const misspelled = spellcheckBody(article.originalBody, dictPath, customWords);
			if (misspelled.length === 0) {
				cleanCount++;
				continue;
			}

			printArticleIssues(articleSlug, misspelled);
			totalIssues += misspelled.length;

			if (options.add) {
				for (const { word } of misspelled) allNewWords.add(word);
			}
		}

		console.log("══════════════════════════════════════════════════════════");
		console.log(
			`  ${slugs.length} articles checked. ${cleanCount} clean, ${totalIssues} issues found.`,
		);
		console.log("══════════════════════════════════════════════════════════\n");

		if (options.add && allNewWords.size > 0) {
			await promptAddWords(wordlistPath, allNewWords);
		}

		process.exit(0);
	});

// ─── Podcast generation ──────────────────────────────────────────────────────

program
	.command("podcast")
	.description("Generate audio narration for a published article")
	.argument("<slug>", "Article slug (from data/articles/)")
	.action(async (slug: string) => {
		const { PodcastService } = await import("@islam-se/orchestrator");

		console.log("");
		console.log("╔══════════════════════════════════════════════════════════╗");
		console.log("║              Islam.se Podcast Generator                  ║");
		console.log("╚══════════════════════════════════════════════════════════╝");
		console.log("");
		console.log(`Article: ${slug}`);
		console.log("");

		const service = new PodcastService();
		const result = await service.produce(slug);

		console.log("");
		if (result.success) {
			console.log("✅ Podcast generated successfully");
			if (result.scriptPath) console.log(`   Script: ${result.scriptPath}`);
			if (result.audioPath) console.log(`   Audio:  ${result.audioPath}`);
			if (result.duration) {
				const secs = Math.round(result.duration / 1000);
				const mins = Math.floor(secs / 60);
				const rem = secs % 60;
				console.log(`   Time:   ${mins}m ${rem}s`);
			}
		} else {
			console.log(`❌ Failed: ${result.error}`);
			process.exit(1);
		}

		process.exit(0);
	});

// ─── Svar answer-page production ─────────────────────────────────────────────

program
	.command("svar")
	.description("Produce a single SEO Q&A answer page → data/svar/<slug>.md")
	.argument("<question>", 'The question/term to answer, e.g. "Vad är sunna?"')
	.option("-m, --model <model>", "Model to use (opus|sonnet)", "opus")
	.option("-e, --effort <level>", "Author-pass effort (low|medium|high|xhigh|max)", "xhigh")
	.option("--review-effort <level>", "Review-pass effort (default max)", "max")
	.option("--single-pass", "Skip the pass-2 review/revise pass", false)
	.option("--save-draft", "Also save the pre-review draft to a temp file", false)
	.option("-s, --slug <slug>", "Explicit slug (else derived from the title)")
	.option("-l, --legacy <path>", "Legacy URL this page replaces (proposes a 301)")
	.option("--overwrite", "Overwrite an existing data/svar/<slug>.md", false)
	.action(async (question: string, options) => {
		const { SvarProducer } = await import("./svar-producer.js");
		const repoRoot = join(__prodDir, "..", "..", "..");

		console.log("");
		console.log("╔══════════════════════════════════════════════════════════╗");
		console.log("║            Islam.se Answer-Page (svar) Producer          ║");
		console.log("╚══════════════════════════════════════════════════════════╝");
		console.log("");
		console.log(`Question: ${question}`);
		console.log(
			`Model: ${options.model}   Effort: ${options.effort} (author) / ${options.singlePass ? "—" : options.reviewEffort} (review)`,
		);
		console.log("");

		const producer = new SvarProducer({
			repoRoot,
			model: options.model as "opus" | "sonnet",
			effort: options.effort,
			reviewEffort: options.reviewEffort,
			singlePass: options.singlePass === true,
			saveDraft: options.saveDraft === true,
			promptFile: join(__prodDir, "..", "prompts", "svar-author.md"),
			reviewPromptFile: join(__prodDir, "..", "prompts", "svar-review.md"),
			mcpConfig: join(repoRoot, ".mcp.json"),
		});

		const res = await producer.produce({
			question,
			slug: options.slug,
			legacyPath: options.legacy,
			overwrite: options.overwrite === true,
		});

		console.log("");
		if (res.success) {
			console.log("✅ SUCCESS");
			console.log(`   File:  ${res.filePath}`);
			console.log(`   Title: ${res.frontmatter?.title}`);
			console.log(
				`   Words: ${res.wordCount}   FAQ: ${res.frontmatter?.faq?.length ?? 0}   Sources: ${res.frontmatter?.sources?.length ?? 0}`,
			);
			console.log(`   Pass 2 (review): ${res.reviewed ? "✓ applied" : "— skipped/failed"}`);
			if (res.draftPath) console.log(`   Draft saved: ${res.draftPath}`);
			if (res.redirect) {
				console.log("");
				console.log("   Add to customRedirects in apps/web/astro.config.ts:");
				console.log(`     ["${res.redirect[0]}", "${res.redirect[1]}"],`);
			}
			process.exit(0);
		} else {
			console.log(`❌ FAILED: ${res.error}`);
			process.exit(1);
		}
	});

program.parse();
