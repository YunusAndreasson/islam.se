import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ContentOrchestrator, type EnrichedIdeationOutput } from "@islam-se/orchestrator";
import type { ArticleStatus, TopicSummary } from "../types/index.js";
import { findOutputDir } from "../utils/paths.js";

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

			// Count ideas with done status
			const doneCount = ideation.ideas.filter(
				(idea) => idea.productionStatus?.status === "done",
			).length;

			topics.push({
				slug: dir.name,
				name: ideation.topic,
				ideaCount: ideation.ideas.length,
				doneCount,
				batchVersion: ideation.batchVersion ?? 1,
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
