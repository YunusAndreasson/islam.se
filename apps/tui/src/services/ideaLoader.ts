import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentOrchestrator, type EnrichedIdeationOutput } from "@islam-se/orchestrator";
import type { ArticleStatus, TopicSummary } from "../types/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Find output directory by looking for the ideas folder
function findOutputDir(): string {
	// Allow override via environment variable
	if (process.env.ISLAM_OUTPUT_DIR && existsSync(join(process.env.ISLAM_OUTPUT_DIR, "ideas"))) {
		return process.env.ISLAM_OUTPUT_DIR;
	}

	// Try relative paths from different locations
	const candidates = [
		// From dist/services/ (built) - up to apps/, then sibling
		join(__dirname, "../../../content-producer/output"),
		// From src/services/ (tsx dev mode) - up to apps/, then sibling
		join(__dirname, "../../..", "content-producer/output"),
		// From monorepo root
		join(process.cwd(), "apps/content-producer/output"),
		// If run from content-producer
		join(process.cwd(), "output"),
	];

	for (const candidate of candidates) {
		const ideasPath = join(candidate, "ideas");
		if (existsSync(ideasPath)) {
			return candidate;
		}
	}

	// Traverse up from __dirname looking for apps/content-producer/output
	let dir = __dirname;
	for (let i = 0; i < 10; i++) {
		const ideasPath = join(dir, "apps/content-producer/output/ideas");
		if (existsSync(ideasPath)) {
			return join(dir, "apps/content-producer/output");
		}
		// Also check for sibling
		const siblingPath = join(dir, "content-producer/output/ideas");
		if (existsSync(siblingPath)) {
			return join(dir, "content-producer/output");
		}
		dir = dirname(dir);
	}

	// Last resort: use absolute path
	const absolutePath = "/home/yunus/Work/islam.se/apps/content-producer/output";
	if (existsSync(join(absolutePath, "ideas"))) {
		return absolutePath;
	}

	return join(process.cwd(), "apps/content-producer/output");
}

const OUTPUT_DIR = findOutputDir();
const IDEAS_DIR = join(OUTPUT_DIR, "ideas");
const ARTICLES_DIR = OUTPUT_DIR;

export function loadTopics(): TopicSummary[] {
	if (!existsSync(IDEAS_DIR)) {
		return [];
	}

	const topics: TopicSummary[] = [];
	const dirs = readdirSync(IDEAS_DIR, { withFileTypes: true });

	for (const dir of dirs) {
		if (!dir.isDirectory()) continue;

		const ideationPath = join(IDEAS_DIR, dir.name, "ideation.json");
		if (!existsSync(ideationPath)) continue;

		try {
			const content = readFileSync(ideationPath, "utf-8");
			const ideation = JSON.parse(content) as EnrichedIdeationOutput;

			const orchestrator = new ContentOrchestrator({
				outputDir: ARTICLES_DIR,
			});
			const articleStatus = orchestrator.getStatus(dir.name);

			topics.push({
				slug: dir.name,
				name: ideation.topic,
				ideaCount: ideation.ideas.length,
				articleStatus: articleStatus as ArticleStatus,
				generatedAt: ideation.generatedAt,
			});
		} catch {
			// Skip invalid files
		}
	}

	// Sort by generation date, newest first
	return topics.sort(
		(a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime(),
	);
}

export function loadIdeation(slug: string): EnrichedIdeationOutput | null {
	const ideationPath = join(IDEAS_DIR, slug, "ideation.json");
	if (!existsSync(ideationPath)) {
		return null;
	}

	try {
		const content = readFileSync(ideationPath, "utf-8");
		return JSON.parse(content) as EnrichedIdeationOutput;
	} catch {
		return null;
	}
}

export function getArticleStatus(slug: string): ArticleStatus {
	const orchestrator = new ContentOrchestrator({
		outputDir: ARTICLES_DIR,
	});
	return orchestrator.getStatus(slug) as ArticleStatus;
}

export function deleteIdea(slug: string, ideaId: number): EnrichedIdeationOutput | null {
	const ideationPath = join(IDEAS_DIR, slug, "ideation.json");
	if (!existsSync(ideationPath)) {
		return null;
	}

	try {
		const content = readFileSync(ideationPath, "utf-8");
		const ideation = JSON.parse(content) as EnrichedIdeationOutput;

		// Filter out the idea
		ideation.ideas = ideation.ideas.filter((idea) => idea.id !== ideaId);

		// Save back to file
		writeFileSync(ideationPath, JSON.stringify(ideation, null, "\t"));

		return ideation;
	} catch {
		return null;
	}
}
