/**
 * What publishing records about a run, and how to read it back from a finished run.
 *
 * A trial run (`--no-publish`) leaves `data/articles` alone. Publishing it afterwards used
 * to mean `--resume`, which repeats every stage after Swedish voice (the Codex audit, the
 * correction pass, the final read, the figures) and so publishes a text the editor has not
 * read. `publicationFromRun` reads the finished run instead, so `produce publish` ships
 * final.md exactly as it stands and writes the same records a publishing run writes.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { slugify } from "../utils.js";

export interface PublicationRecord {
	outputDir: string;
	topic: string;
	/** When the essay was produced, which for a run published later is not now. */
	producedAt: string;
	title: string;
	description?: string;
	qualityScore: number;
	wordCount: number;
	/** The research sources, for the domain tracker. */
	sourceUrls: string[];
	reviewRounds: number;
	revisionCount: number;
	evaluation: { before?: number; after?: number; houseBefore?: number; houseAfter?: number };
	models: string[];
	openIssues: number;
	reviewerIssues: string[];
	struggles: string | null;
	efficiencySuggestions: string | null;
}

function readJson<T>(dir: string, file: string): T | null {
	const path = join(dir, file);
	if (!existsSync(path)) return null;
	return JSON.parse(readFileSync(path, "utf-8")) as T;
}

/**
 * The publication record of a finished run.
 *
 * Throws when the run has no final.md or no metadata.json. Both are written only after the
 * final read has passed (a failed read leaves candidate.md), so this is what keeps a
 * later publish behind the same gate as a publishing run.
 */
export function publicationFromRun(outputDir: string): PublicationRecord {
	if (!existsSync(join(outputDir, "final.md"))) {
		throw new Error(
			`Ingen final.md i ${outputDir}: bara en körning som klarade sista läsningen kan publiceras.`,
		);
	}
	const meta = readJson<{
		topic?: string;
		producedAt?: string;
		title?: string;
		description?: string;
		qualityScore?: number;
		wordCount?: number;
		revisionCount?: number;
		reviewRounds?: number;
		evaluation?: {
			actionableBefore?: number;
			actionableAfter?: number;
			houseBefore?: number;
			houseAfter?: number;
		};
		openIssues?: number;
		models?: string[];
	}>(outputDir, "metadata.json");
	if (!meta?.title || typeof meta.qualityScore !== "number") {
		throw new Error(
			`Ingen fullständig metadata.json i ${outputDir}: körningen blev inte klar, och då finns ingen godkänd text att publicera.`,
		);
	}
	const research = readJson<{ sources?: Array<{ url?: string }> }>(outputDir, "research.json");
	const draft = readJson<{ struggles?: string; efficiencySuggestions?: string }>(
		outputDir,
		"draft-meta.json",
	);
	const review = readJson<{ issues?: string[] }>(outputDir, "review.json");

	return {
		outputDir,
		topic: meta.topic ?? meta.title,
		producedAt: meta.producedAt ?? new Date().toISOString(),
		title: meta.title,
		description: meta.description,
		qualityScore: meta.qualityScore,
		wordCount: meta.wordCount ?? 0,
		sourceUrls: (research?.sources ?? []).flatMap((source) => (source.url ? [source.url] : [])),
		reviewRounds: meta.reviewRounds ?? 0,
		revisionCount: meta.revisionCount ?? 0,
		evaluation: {
			before: meta.evaluation?.actionableBefore,
			after: meta.evaluation?.actionableAfter,
			houseBefore: meta.evaluation?.houseBefore,
			houseAfter: meta.evaluation?.houseAfter,
		},
		models: meta.models ?? [],
		openIssues: meta.openIssues ?? 0,
		reviewerIssues: review?.issues ?? [],
		struggles: draft?.struggles ?? null,
		efficiencySuggestions: draft?.efficiencySuggestions ?? null,
	};
}

/** Where the essay would be published, and whether an essay already stands there. */
export function publicationTarget(
	record: Pick<PublicationRecord, "title">,
	articlesDir: string,
): { slug: string; path: string; exists: boolean } {
	const slug = slugify(record.title);
	const path = join(articlesDir, `${slug}.md`);
	return { slug, path, exists: existsSync(path) };
}
