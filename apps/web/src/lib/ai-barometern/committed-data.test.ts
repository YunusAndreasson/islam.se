import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildLatest, buildSeries, sortRuns } from "./derive";
import { FAMILY_KEYS } from "./families";
import { textSha256 } from "./prompt";
import { QUESTIONS } from "./questions";
import {
	answerKey,
	type LatestFile,
	type ModelsFile,
	questionKey,
	type RunFile,
	type SeriesFile,
	type TextsFile,
} from "./types";

// The committed record of every AI-barometern run. These checks are what make "every run is
// logged in the repo" trustworthy: a run that was cut short, reworded, attributed to the
// wrong model, or not reflected in the files the site imports fails here.

const DATA = fileURLToPath(new URL("../../data/ai-barometern/", import.meta.url));
const read = <T>(path: string): T => JSON.parse(readFileSync(join(DATA, path), "utf8")) as T;

const RUN_DIRS = existsSync(join(DATA, "runs")) ? readdirSync(join(DATA, "runs")).sort() : [];
const RUNS = RUN_DIRS.map((dir) => read<RunFile>(`runs/${dir}/run.json`));
const textsOf = (id: string) => read<TextsFile>(`runs/${id}/texts.json`);
const QUESTION_BY_KEY = new Map(QUESTIONS.map((q) => [questionKey(q), q]));

describe("committed AI-barometern data", () => {
	it("holds only finished runs, each under its own id and listed in index.json", () => {
		const unfinished = RUNS.filter((r) => !r.finishedAt).map((r) => r.id);
		expect(unfinished, "finish with `pnpm ai-barometern run --resume <id>` first").toEqual([]);
		expect(RUNS.map((r) => r.id)).toEqual(RUN_DIRS);
		expect(read<{ runs: string[] }>("index.json").runs).toEqual(sortRuns(RUNS).map((r) => r.id));
	});

	it("asks every model every question the full number of times, with the wording on record", () => {
		const problems = RUNS.flatMap((run) => {
			const out: string[] = [];
			for (const { q, textSha256: sha } of run.questions) {
				const question = QUESTION_BY_KEY.get(q);
				if (!question) out.push(`${run.id}: unknown question ${q}`);
				else if (textSha256(question) !== sha) {
					out.push(`${run.id}: ${q} was reworded without bumping its version`);
				}
			}
			const expected = run.questions.length * run.settings.samples * FAMILY_KEYS.length;
			if (run.answers.length !== expected) {
				out.push(`${run.id}: ${run.answers.length} answers, expected ${expected}`);
			}
			const keys = run.answers.map(answerKey);
			if (new Set(keys).size !== keys.length) out.push(`${run.id}: duplicate answers`);
			const texts = textsOf(run.id);
			const untexted = keys.filter((k) => !(k in texts.texts));
			if (untexted.length > 0) out.push(`${run.id}: ${untexted.length} answers lack a text entry`);
			return out;
		});
		expect(problems).toEqual([]);
	});

	it("attributes every run to a model the release log had in force that day", () => {
		// Inclusive at both ends: on a switch day, a morning run on the old model and an evening
		// run on the new one are both legitimate.
		const models = read<ModelsFile>("models.json");
		const wrong = RUNS.flatMap((run) =>
			FAMILY_KEYS.filter((family) => {
				const id = run.models[family].id;
				return !models.families[family].history.some(
					(h) =>
						h.id === id && h.adoptedAt <= run.date && (!h.retiredAt || h.retiredAt >= run.date),
				);
			}).map((family) => `${run.id} ${family}: ${run.models[family].id}`),
		);
		expect(wrong).toEqual([]);
	});

	it("keeps series.json and latest.json in step with the runs", () => {
		// The site imports only these two derived files. If they drift, the charts show numbers
		// the committed runs do not contain. Fix with: pnpm ai-barometern rebuild
		const sorted = sortRuns(RUNS);
		expect(read<SeriesFile>("series.json")).toEqual(buildSeries(sorted));
		expect(read<LatestFile>("latest.json")).toEqual(
			buildLatest(sorted.map((run) => ({ run, texts: textsOf(run.id) }))),
		);
	});
});
