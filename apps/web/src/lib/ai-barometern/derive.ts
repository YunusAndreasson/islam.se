import { passesGate } from "./gate";
import { codeOfAnswer } from "./options";
import { QUESTIONS } from "./questions";
import {
	type Answer,
	type AnswerCode,
	answerKey,
	type Excerpt,
	type FamilyKey,
	type LatestFile,
	questionKey,
	type RunFile,
	type SeriesFile,
	type TextsFile,
} from "./types";

// The two files the site actually imports, derived from the committed runs by
// `pnpm ai-barometern rebuild` (and at the end of every run). Pure, so derived.test.ts can
// recompute both from the runs on disk and fail if a committed copy has drifted.

const KIND_BY_KEY = new Map(QUESTIONS.map((q) => [questionKey(q), q.kind]));

/** A motivation longer than this is not quoted: quotes are never trimmed. */
export const MAX_EXCERPT_CHARS = 600;

export function answerCode(a: Pick<Answer, "q" | "outcome" | "option">): AnswerCode {
	const kind = KIND_BY_KEY.get(a.q);
	if (!kind) throw new Error(`Mätningen innehåller en okänd fråga: ${a.q}`);
	return codeOfAnswer(kind, a.outcome, a.option);
}

const bySample = (a: Answer, b: Answer) => a.sample - b.sample;

export function sortRuns<T extends { id: string }>(runs: readonly T[]): T[] {
	return [...runs].sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
}

export function buildSeries(runs: readonly RunFile[]): SeriesFile {
	const sorted = sortRuns(runs);
	const cells: SeriesFile["cells"] = {};
	for (const [index, run] of sorted.entries()) {
		for (const a of [...run.answers].sort(bySample)) {
			cells[a.q] ??= {};
			const row = cells[a.q] as Partial<Record<FamilyKey, (AnswerCode[] | null)[]>>;
			row[a.family] ??= sorted.map(() => null);
			const series = row[a.family] as (AnswerCode[] | null)[];
			series[index] = [...(series[index] ?? []), answerCode(a)];
		}
	}
	return {
		schemaVersion: 1,
		runs: sorted.map((run) => ({
			id: run.id,
			date: run.date,
			variant: run.settings.variant,
			samples: run.settings.samples,
			answers: run.totals.answers,
			costUsd: Math.round(run.totals.costUsd * 10_000) / 10_000,
			models: Object.fromEntries(
				Object.entries(run.models).map(([family, m]) => [
					family,
					{ id: m.id, name: m.name, knowledgeCutoff: m.knowledgeCutoff },
				]),
			) as SeriesFile["runs"][number]["models"],
		})),
		cells,
	};
}

export interface RunWithTexts {
	run: RunFile;
	texts: TextsFile;
}

/** Quotable excerpts per question, each from the latest run that asked that question. A run
 *  of only the newly added questions leaves the older questions' quotes where they were. */
export function buildLatest(runs: readonly RunWithTexts[]): LatestFile {
	const textsById = new Map(runs.map((entry) => [entry.run.id, entry.texts]));
	const sourceOf = new Map<string, RunFile>();
	for (const run of sortRuns(runs.map((entry) => entry.run))) {
		for (const a of run.answers) sourceOf.set(a.q, run);
	}
	const excerpts: LatestFile["excerpts"] = {};
	for (const [q, run] of sourceOf) {
		const texts = textsById.get(run.id);
		for (const a of run.answers.filter((x) => x.q === q).sort(bySample)) {
			if (a.outcome !== "answered" && a.outcome !== "abstained") continue;
			const entry = texts?.texts[answerKey(a)];
			const text = entry?.motivation?.trim();
			if (!(entry && text) || entry.hidden) continue;
			if (text.length > MAX_EXCERPT_CHARS) continue;
			if (!(entry.reviewed || passesGate(text))) continue;
			excerpts[a.q] ??= {};
			const row = excerpts[a.q] as Partial<Record<FamilyKey, Excerpt[]>>;
			row[a.family] = [...(row[a.family] ?? []), { sample: a.sample, code: answerCode(a), text }];
		}
	}
	return { runs: Object.fromEntries([...sourceOf].map(([q, run]) => [q, run.id])), excerpts };
}
