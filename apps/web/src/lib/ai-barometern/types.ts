// Shapes shared by the AI-barometern runner (scripts/ai-barometern.ts), the committed data
// under src/data/ai-barometern/ and the pages. Hand-written policy (questions, families)
// is TypeScript; everything the runner writes is JSON matching these interfaces.

export type FamilyKey = "chatgpt" | "claude" | "deepseek" | "gemini" | "grok";

export type Theme =
	| "klimat"
	| "teknik"
	| "kontroll-sakerhet"
	| "kontroll-vinkling"
	| "folkmord"
	| "gaza"
	| "sjalvforsvar"
	| "ockupation"
	| "omvarlden"
	| "varlden"
	| "politik"
	| "ekonomi"
	| "migration"
	| "brott"
	| "religionsfrihet"
	| "yttrandefrihet"
	| "tro"
	| "moral";

/** A run of themes the pages show under one heading. `key` is the heading's anchor. */
export interface Area {
	readonly key: string;
	readonly label: string;
	readonly themes: readonly Theme[];
}

export type QuestionKind = "scale" | "party";

/** A: forced choice with »Avstår«. B: forced, no way out. C: free answer, coded afterwards. */
export type Variant = "A" | "B" | "C";

/** What became of one request. `abstained` is a chosen »Avstår«; `refused` is a model or
 *  provider declining outright; `invalid` is an answer outside the options; `error` is a
 *  transport or empty-response failure that survived every retry. */
export type Outcome = "answered" | "abstained" | "refused" | "invalid" | "error";

export interface Question {
	/** URL segment and series name, stable across wording versions. */
	readonly id: string;
	/** Bumped whenever `text` changes: a new wording is a new series. */
	readonly version: number;
	readonly theme: Theme;
	readonly kind: QuestionKind;
	/** Exactly what the models are asked: a statement (scale) or a question (party). */
	readonly text: string;
	/** Row label in the overview matrix. */
	readonly short: string;
	/** True when the question touches a religious ruling and so must carry a classical note. */
	readonly religious: boolean;
	readonly classicalNote?: string;
	/** Where the classical position falls on the statement's own scale, drawn as a marker beside
	 *  the models' answers. Only on a statement of faith or ethics with no »bör«: a »bör« statement
	 *  asks what Swedish policy should be, and placing the site on that scale is a political
	 *  position (questions.test.ts holds this). */
	readonly classicalPosition?: -2 | -1 | 0 | 1 | 2;
	/** ISO date the question entered the bank. */
	readonly introduced: string;
	readonly retired?: string;
	/** For a statement about one family's maker (»OpenAI sätter vinst före säkerhet …«): the
	 *  family whose own company it concerns, so the pages can mark that model's answer as a
	 *  judgement of its own maker. */
	readonly aboutFamily?: FamilyKey;
}

export interface Family {
	readonly key: FamilyKey;
	readonly label: string;
	readonly maker: string;
	/** Catalogue id prefix, e.g. "openai/". Alias ids ("~openai/…") never match. */
	readonly namespace: string;
	/** Ids in the namespace that are not chat models (image, audio, embeddings …). */
	readonly exclude: readonly RegExp[];
}

/** The subset of an OpenRouter /api/v1/models entry the barometer reads. */
export interface CatalogueModel {
	id: string;
	canonical_slug: string;
	name: string;
	/** Unix seconds. */
	created: number;
	knowledge_cutoff?: string | null;
	expiration_date?: string | null;
	pricing: { prompt: string; completion: string };
	supported_parameters?: string[] | null;
}

export interface AdoptedModel {
	id: string;
	canonicalSlug: string;
	name: string;
	/** ISO date the vendor published the model on OpenRouter. */
	created: string;
	knowledgeCutoff: string | null;
	adoptedAt: string;
	retiredAt?: string;
	reason: string;
}

type SeenDecision = "pending" | "adopted" | "ignored";

export interface SeenModel {
	family: FamilyKey;
	id: string;
	canonicalSlug: string;
	name: string;
	created: string;
	firstSeen: string;
	decision: SeenDecision;
	decidedAt?: string;
	note?: string;
	/** Set when the id disappears from the catalogue. */
	removedAt?: string;
}

/** src/data/ai-barometern/models.json — the pinned model per family and the release log. */
export interface ModelsFile {
	schemaVersion: 1;
	lastChecked: string | null;
	families: Record<FamilyKey, { current: string | null; history: AdoptedModel[] }>;
	seen: SeenModel[];
}

export interface Usage {
	promptTokens: number;
	completionTokens: number;
	reasoningTokens: number;
	costUsd: number;
}

export interface Answer {
	/** Question key, `${id}@${version}`. */
	q: string;
	family: FamilyKey;
	/** 1-based sample number within the cell. */
	sample: number;
	outcome: Outcome;
	/** The option label the model chose, verbatim; null unless answered or abstained. */
	option: string | null;
	/** Party questions: the shuffled option order the model saw. */
	optionOrder?: string[];
	finishReason: string | null;
	responseModel: string | null;
	provider: string | null;
	generationId: string | null;
	usage: Usage;
	latencyMs: number;
	attempts: number;
	error?: string;
}

export interface RunModel {
	id: string;
	canonicalSlug: string;
	name: string;
	created: string;
	knowledgeCutoff: string | null;
	pricing: { prompt: string; completion: string };
}

export interface RequestSettings {
	variant: Variant;
	promptVersion: string;
	samples: number;
	reasoningEffort: "low";
	maxTokens: number;
	responseFormat: "json_schema";
	requireParameters: true;
	temperature: null;
	systemPrompt: null;
	webSearch: false;
	/** Family → the OpenRouter provider its answers were pinned to. Absent in the first two runs,
	 *  where every family took whichever host OpenRouter chose. */
	ownProvider?: Partial<Record<FamilyKey, string>>;
}

/** src/data/ai-barometern/runs/<id>/run.json — one measurement, everything but the prose. */
export interface RunFile {
	schemaVersion: 1;
	/** "2026-09-14", or "2026-09-14-2" for a second run the same day. Equals the directory. */
	id: string;
	date: string;
	startedAt: string;
	finishedAt: string | null;
	settings: RequestSettings;
	models: Record<FamilyKey, RunModel>;
	/** Every question asked, with a hash of its wording so a silent rewording fails a test. */
	questions: { q: string; textSha256: string }[];
	answers: Answer[];
	totals: { answers: number; costUsd: number; byOutcome: Record<Outcome, number> };
	stoppedByBudget: boolean;
}

export interface AnswerText {
	motivation: string | null;
	raw: string | null;
	/** Set by `review --approve`: a flagged motivation a human has read and cleared. */
	reviewed?: true;
	/** Set by `review --hide`: never quoted, whatever the gate says. */
	hidden?: true;
}

/** src/data/ai-barometern/runs/<id>/texts.json — the prose, keyed by answerKey(). */
export interface TextsFile {
	runId: string;
	texts: Record<string, AnswerText>;
}

/** A compact per-sample code, as stored in series.json: scale "2" "1" "0" "-1" "-2"; party
 *  "S" … "MP" or "annat"; and for every kind "avstar", "vagrar" (refused) or "fel". */
export type AnswerCode = string;

export interface SeriesRun {
	id: string;
	date: string;
	variant: Variant;
	samples: number;
	answers: number;
	costUsd: number;
	models: Record<FamilyKey, { id: string; name: string; knowledgeCutoff: string | null }>;
}

/** src/data/ai-barometern/series.json — derived by `rebuild` from every finished run, so the
 *  site never imports the full run files (a year of them would weigh down the build). */
export interface SeriesFile {
	schemaVersion: 1;
	runs: SeriesRun[];
	/** question key → family → one entry per run, index-aligned with `runs`: the codes of that
	 *  run's samples in sample order, or null when the question was not asked in that run. */
	cells: Record<string, Partial<Record<FamilyKey, (AnswerCode[] | null)[]>>>;
}

export interface Excerpt {
	sample: number;
	code: AnswerCode;
	text: string;
}

/** src/data/ai-barometern/latest.json — for every question, the quotable motivations of the
 *  latest run that asked it: gate passed (or reviewed), not hidden, short enough to quote
 *  whole. Per question rather than per run, because a run may ask only the questions added
 *  since the last full one, and it must not erase the other questions' quotes. */
export interface LatestFile {
	/** question key → id of the run its excerpts come from. */
	runs: Record<string, string>;
	excerpts: Record<string, Partial<Record<FamilyKey, Excerpt[]>>>;
}

export function questionKey(q: Pick<Question, "id" | "version">): string {
	return `${q.id}@${q.version}`;
}

export function answerKey(a: Pick<Answer, "q" | "family" | "sample">): string {
	return `${a.q}|${a.family}|${a.sample}`;
}
