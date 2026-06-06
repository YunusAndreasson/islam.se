// One-off driver that mirrors the interactive ideate→produce selection flow
// (apps/content-producer/src/index.ts) for a non-interactive environment.
// Loads a chosen idea from ideation.json, builds the IdeaBrief, and runs the
// full pipeline so the selected idea keeps its enriched context (angle + seed
// quotes) instead of being flattened to a bare topic string.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { ContentOrchestrator } from "@islam-se/orchestrator";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env"), override: true });

const IDEAS_SLUG = "skapelsen-naturen-djuren-och-kosmos-som-y-t-tecken";
const IDEA_ID = Number(process.argv[2] ?? "9");

const outputDir = resolve(__dirname, "output");
const ideationPath = join(outputDir, "ideas", IDEAS_SLUG, "ideation.json");
const ideation = JSON.parse(readFileSync(ideationPath, "utf-8"));
const idea = ideation.ideas.find((i) => i.id === IDEA_ID);
if (!idea) {
	console.error(`Idea #${IDEA_ID} not found in ${ideationPath}`);
	process.exit(1);
}

// Mirror index.ts: filter seed quotes to relevance >= 0.6
const ideaBrief = {
	title: idea.title,
	thesis: idea.thesis,
	angle: idea.angle,
	keywords: idea.keywords,
	difficulty: idea.difficulty,
	seedQuotes: (idea.quotes ?? [])
		.filter((q) => q.relevanceScore >= 0.6)
		.map((q) => ({ text: q.text, author: q.author, source: q.source })),
};

const refinedTopic = `${idea.title}: ${idea.thesis}`;

console.log("Producing selected idea:");
console.log("  Title:", idea.title);
console.log("  Difficulty:", idea.difficulty, "| score:", idea.score);
console.log("  Seed quotes:", ideaBrief.seedQuotes.length);
console.log("");

const orchestrator = new ContentOrchestrator({
	outputDir,
	model: "opus",
	qualityThreshold: 7.5,
	maxRevisions: 2,
});

const result = await orchestrator.produce(
	refinedTopic,
	{ topicSlug: IDEAS_SLUG, ideaId: idea.id },
	ideaBrief,
	{ resume: true }, // reuse existing research.json + fact-check.json, re-run authoring onward
);

console.log("");
console.log("=== PRODUCTION RESULT ===");
console.log("success:", result.success);
console.log("outputDir:", result.outputDir);
if (result.reviewScore !== undefined) console.log("reviewScore:", result.reviewScore);
if (!result.success) {
	for (const [stage, st] of Object.entries(result.stages ?? {})) {
		if (st && st.success === false) console.log(`  ${stage} FAILED:`, st.error);
	}
}
process.exit(result.success ? 0 : 1);
