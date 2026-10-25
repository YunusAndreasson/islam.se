import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getBernstromRange, getQuote, resolveSurahNumber } from "@islam-se/quotes";
import { type ClaudeRunMeta, ClaudeRunner, type ClaudeRunOptions } from "./claude-runner.js";
import { applyCodexTicAudit, type CodexTicAudit, CodexTicAuditor } from "./codex-tic-audit.js";
import {
	formatBlockedDomainsPrompt,
	formatDomainReputation,
	getBlockedDomains,
	loadDomainTracker,
	recordPublishedArticle,
	saveDomainTracker,
	updateDomainTracker,
} from "./domain-tracker.js";
import { applyFigure, findFigureCandidates } from "./figure-guard.js";
import { checkHouseRules, formatHouseFindings, type HouseFinding } from "./house-checks.js";
import { ReferenceTracker } from "./reference-tracker.js";
import {
	DeepenFrontmatterSchema,
	DraftFrontmatterSchema,
	DraftOutputSchema,
	EvalCorrectionFrontmatterSchema,
	FactCheckOutputSchema,
	FiguresFrontmatterSchema,
	GroundFrontmatterSchema,
	getFactCheckJsonSchema,
	getRelatedEssaysJsonSchema,
	getResearchJsonSchema,
	getReviewPatchJsonSchema,
	getVerifyJsonSchema,
	PolishFrontmatterSchema,
	type RelatedEssaysFindings,
	RelatedEssaysOutputSchema,
	ResearchOutputSchema,
	ReviewFrontmatterSchema,
	type ReviewPatch,
	ReviewPatchSchema,
	SwedishVoiceFrontmatterSchema,
	type VerifyFindings,
	VerifyOutputSchema,
} from "./schemas.js";
import { ArticlePublisher, findDataDir } from "./services/article-publisher.js";
import { editorEditsBlock } from "./services/editor-edits.js";
import { IdeationService } from "./services/ideation-service.js";
import {
	publishedEssaysBlock,
	recentTitlesBlock,
	titleFrame,
} from "./services/published-essays.js";
import {
	closestEssays,
	deadEssayLinks,
	fullEssaysBlock,
	linkEssayReferences,
	type PublishedEssay,
	readPublishedEssays,
	relatedEssaysBlock,
	unlinkedEssayReferences,
	type VettedRelatedEssays,
	vetRelatedEssays,
} from "./services/related-essays.js";
import {
	type PublicationRecord,
	publicationFromRun,
	publicationTarget,
} from "./services/run-publication.js";
import { SourceValidator } from "./source-validator.js";
import { newMisspellings } from "./spellguard.js";
import {
	applyTextPatches,
	describePatch,
	isCosmeticRewrite,
	measureRewrite,
	type PatchRejection,
	renumberFootnotes,
	type TextPatch,
} from "./text-patches.js";
import {
	createLogger,
	formatDuration,
	formatSourceDocs,
	getModelId,
	loadOutput,
	pickSwedishAuthors,
	RESEARCH_ALLOWED_TOOLS,
	type SourceDoc,
	saveOutput,
	slugify,
} from "./utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Composite-issue count (from scripts/evaluate-article.py) above which the fördjupning
 * producer's eval-correction pass runs. The hand-edited gold standard averages ~10.4
 * issues/article (repetitions are inherent noise); 12 leaves headroom.
 *
 * ⚠️ The essay pipeline no longer gates on this total. On the runs of 2026-08/09 the
 * total was 13–31 and 93–100 % of it was the repetition count, which the second-model
 * audit rightly calls intentional motifs; anglicisms, latinisms and AI patterns were
 * already 0 by then. So every essay crossed the threshold and the number told nothing.
 * Essays gate on `actionableIssues` (the total without repetitions) plus the house
 * checks instead — see produce().
 */
const EVAL_CORRECTION_THRESHOLD = 12;

/** Locate scripts/evaluate-article.py (sibling of the data dir at the repo root). */
function findEvalScript(): string | null {
	const candidate = join(findDataDir(), "..", "scripts", "evaluate-article.py");
	return existsSync(candidate) ? candidate : null;
}

export interface ProseEvalResult {
	totalIssues: number;
	/** totalIssues without the repetition check, which is mostly intentional motif. */
	actionableIssues: number;
	/** Human-readable per-dimension report — fed verbatim to the corrective prompt. */
	report: string;
}

/**
 * Run the deterministic Swedish-prose evaluator on a markdown file and return
 * the composite issue count plus the human-readable report. Returns null if
 * Python or the script is unavailable, or the run fails — the caller treats a
 * null result as "skip correction" so the pipeline never breaks on it.
 *
 * NOTE: the evaluator only collects prose when the file has YAML frontmatter
 * (its parser drops everything before the closing `---`), so callers must wrap
 * the article body in a minimal frontmatter block before passing it here.
 */
function evaluateProse(filePath: string, scriptPath: string): ProseEvalResult | null {
	for (const python of ["python3", "python"]) {
		const opts = { encoding: "utf-8" as const, maxBuffer: 16 * 1024 * 1024 };
		const jsonRun = spawnSync(python, [scriptPath, "--json", filePath], opts);
		if (jsonRun.error) continue; // command not found — try the next
		if (jsonRun.status !== 0) return null;

		let totalIssues: number;
		let repetitions: number;
		try {
			const parsed = JSON.parse(jsonRun.stdout) as Array<{
				total_issues?: number;
				checks?: { repetitions?: { count?: number } };
			}>;
			totalIssues = parsed[0]?.total_issues ?? 0;
			repetitions = parsed[0]?.checks?.repetitions?.count ?? 0;
		} catch {
			return null;
		}

		const reportRun = spawnSync(python, [scriptPath, filePath], opts);
		const report = reportRun.status === 0 ? reportRun.stdout.trim() : "";
		return { totalIssues, actionableIssues: Math.max(0, totalIssues - repetitions), report };
	}
	return null;
}

/** The composite issue count above which a corrective prose pass is worth running. */
export const PROSE_EVAL_THRESHOLD = EVAL_CORRECTION_THRESHOLD;

/**
 * Measure the Swedish prose of an article body with scripts/evaluate-article.py, for
 * sibling producers that run the language passes without the essay `produce()` loop.
 *
 * ⚠️ Wraps the body in minimal frontmatter before measuring, because the evaluator's
 * parser drops everything before the closing `---` — an unwrapped body measures as
 * empty and looks flawless. That trap is the reason this is exported instead of the
 * raw two-argument helper.
 *
 * Returns null when Python or the script is unavailable; treat that as "skip", never
 * as "no issues".
 */
export function evaluateProseText(opts: {
	body: string;
	title: string;
	/** Where the wrapped temporary file is written. */
	scratchDir: string;
}): ProseEvalResult | null {
	const scriptPath = findEvalScript();
	if (!scriptPath) return null;
	mkdirSync(opts.scratchDir, { recursive: true });
	const filePath = join(opts.scratchDir, "eval-input.md");
	saveOutput(
		opts.scratchDir,
		"eval-input.md",
		`---\ntitle: ${JSON.stringify(opts.title)}\n---\n\n${opts.body}`,
	);
	return evaluateProse(filePath, scriptPath);
}

/** A quote id the database can answer for: "quote-123" or "123". Research also invents
 *  ids for web and primary-text quotes ("primary-ibn-taymiyya-35-39"); those are not. */
export function isDatabaseQuoteId(id: string): boolean {
	return /^(?:quote-)?\d+$/.test(String(id).trim());
}

/**
 * Format research output for fact-checking — structured sections instead of raw JSON.
 *
 * ⚠️ Database quotes get an excerpt (the checker looks them up by id); every other quote
 * gets its FULL text, because nothing else will ever show the checker the words past
 * character 120 — and about half the quotes on the 2026-09 runs were web or primary-text
 * quotes of 150–270 characters.
 *
 * ⚠️ Datasets are listed here or nowhere. The prompt asks for one `datasetChecks` verdict
 * per dataset, but this formatter used to omit them, so every run returned
 * `datasetChecks: []` and every dataset was dropped before the figures stage (»Sorgen vid
 * Nilen« lost four: SCB, Kvartal, SVT, Järva).
 */
export function formatResearchForFactCheck(research: ResearchOutput): string {
	const sections: string[] = [];

	sections.push(`## Developed Angle\n${research.summary}`);

	const dbQuotes = research.quotes.filter((q) => isDatabaseQuoteId(q.id));
	const otherQuotes = research.quotes.filter((q) => !isDatabaseQuoteId(q.id));
	if (dbQuotes.length > 0) {
		const formatted = dbQuotes
			.map((q) => {
				const excerpt = q.text.length > 120 ? `${q.text.slice(0, 120)}…` : q.text;
				return `- [${q.id}] ${q.author}${q.source ? `, *${q.source}*` : ""}: "${excerpt}"`;
			})
			.join("\n");
		sections.push(
			`## Database quotes (${dbQuotes.length}) — verify attributions with get_quote_by_id\n${formatted}`,
		);
	}
	if (otherQuotes.length > 0) {
		const formatted = otherQuotes
			.map((q) => {
				const sv = q.textSv && q.textSv !== q.text ? `\n  Swedish: "${q.textSv}"` : "";
				return `- [${q.id}] ${q.author}${q.source ? `, *${q.source}*` : ""}: "${q.text}"${sv}`;
			})
			.join("\n");
		sections.push(
			`## Quotes NOT in the database (${otherQuotes.length}) — their ids are labels, not lookups; check each against its source (WebFetch, search_books, the briefing)\n${formatted}`,
		);
	}

	if (research.quranReferences.length > 0) {
		const formatted = research.quranReferences
			.map((q) => `- ${q.surah} ${q.ayah}: "${q.text}"`)
			.join("\n");
		sections.push(`## Quran References (${research.quranReferences.length})\n${formatted}`);
	}

	if (research.bookPassages && research.bookPassages.length > 0) {
		const formatted = research.bookPassages
			.map((p) => {
				const excerpt = p.text.length > 200 ? `${p.text.slice(0, 200)}…` : p.text;
				return `- [${p.id}] ${p.bookTitle} — ${p.author}${passagePage(p)}: "${excerpt}"`;
			})
			.join("\n");
		sections.push(`## Book Passages (${research.bookPassages.length})\n${formatted}`);
	}

	if (research.sources.length > 0) {
		const formatted = research.sources
			.map((s) => {
				let line = `- ${s.title}: ${s.url}`;
				if (s.keyFindings && s.keyFindings.length > 0) {
					line += `\n  Key findings: ${s.keyFindings.join("; ")}`;
				}
				return line;
			})
			.join("\n");
		sections.push(
			`## Web Sources (${research.sources.length}) — verify with WebFetch\n${formatted}`,
		);
	}

	const datasets = research.datasets ?? [];
	if (datasets.length > 0) {
		const formatted = datasets
			.map((d) => {
				const header = d.columns.length > 0 ? `  columns: ${d.columns.join(" | ")}\n` : "";
				const rows = d.rows.map((r) => `  - ${r.label}: ${r.values.join(" | ")}`).join("\n");
				return `- [${d.id}] ${d.question} (${d.unit})\n  source: ${d.source}${d.sourceUrl ? ` — ${d.sourceUrl}` : " (no link)"}; retrieved ${d.retrieved}${d.note ? `\n  note: ${d.note}` : ""}\n${header}${rows}`;
			})
			.join("\n");
		sections.push(
			`## Datasets (${datasets.length}) — one datasetChecks verdict per id; an unlisted dataset is dropped\n${formatted}`,
		);
	}

	return sections.join("\n\n");
}

/**
 * Quran references for the author and the reviewer, Bernström first.
 *
 * ⚠️ research.quranReferences[].text comes from quran.db, a scan of another translation
 * with the translator's glosses glued on, and the author was told to translate every
 * non-Swedish quote itself. The essays then quoted three different texts (87 blockquotes
 * across 62 essays match no Bernström verse) while the svar and fördjupning pages quote
 * Bernström verbatim. On »Marknaden i raden« fact-check verified 4:85 against the
 * database text, and the verse that shipped was a new rendering tuned to the thesis. The
 * house text is now handed over as the text to quote.
 */
export function formatQuranReferences(
	refs: ResearchOutput["quranReferences"],
	audience: "author" | "reviewer" = "author",
): string {
	const lines = refs.map((q) => {
		const where = `${q.surah}${q.verseKey ? ` (${q.verseKey})` : ` ${q.ayah}`}`;
		const note = `\n  Research note (not a quotable translation): "${q.text}"`;
		if (q.bernstrom) return `- ${where} — Bernström, quote verbatim: "${q.bernstrom}"${note}`;
		return audience === "author"
			? `- ${where} — no Bernström text was found: do not set this verse as a blockquote; refer to it in prose.${note}`
			: `- ${where} — no Bernström text on file: check any blockquote of this verse against quran.com/<sura>/<vers>?translations=48.${note}`;
	});
	return `## QURAN REFERENCES\nA Quran blockquote is Bernström's wording, verbatim; shorten only at a sentence boundary with […].\n${lines.join("\n")}`;
}

export type StageName =
	| "research"
	| "factCheck"
	| "authoring"
	| "review"
	| "polish"
	| "deepen"
	| "ground"
	| "swedishVoice"
	| "figures";

export interface StageProgress {
	stage: StageName;
	status: "running" | "complete" | "failed";
	duration?: number;
	summary?: string;
	error?: string;
}

export interface PreviewChunk {
	stage: StageName;
	type: "text" | "tool_use" | "tool_result";
	content: string;
}

export interface OrchestratorOptions {
	/** Output directory for generated content */
	outputDir: string;
	/** Model to use (default: opus) */
	model?: "opus" | "sonnet";
	/** Minimum quality score to publish (default: 7.5) */
	qualityThreshold?: number;
	/** Maximum revision attempts (default: 2) */
	maxRevisions?: number;
	/**
	 * Publish the finished essay to data/articles and record the run in the feedback log
	 * and the domain tracker (default true). Off for a trial run: publishing derives the
	 * slug from the title, so re-running a published essay would overwrite the edited one.
	 */
	publish?: boolean;
	/** Suppress console output (for TUI mode) */
	quiet?: boolean;
	/** Callback for streaming preview snippets during execution */
	onPreview?: (chunk: PreviewChunk) => void;
	/** Callback for stage lifecycle events (starting, completed, failed) */
	onStageChange?: (progress: StageProgress) => void;
	/** Swap a stage's prompt file while keeping its schema, validation and gates.
	 *
	 *  Keyed by the DEFAULT prompt filename ("research.md", "author.md", "reviewer.md");
	 *  values are absolute paths, or bare names resolved against this package's own
	 *  prompts dir. Lets a sibling producer (the /fordjupning/ pipeline) reuse the essay
	 *  stages' machinery — the credibility gate, URL verification, the revision loop —
	 *  with prompts written for its own register, and keep those prompts next to the
	 *  producer that owns them instead of scattering them in here. */
	promptOverrides?: Record<string, string>;
	/** Pre-validated briefing documents (see `loadSourceDocs`), handed to research,
	 *  fact-check and authoring. Empty/absent is the normal case: most essays are built
	 *  from the corpus and the open web alone. */
	sourceDocs?: SourceDoc[];
}

export type StageResult<T = unknown> =
	| { success: true; data: T; error?: undefined; duration?: number; meta?: ClaudeRunMeta }
	// `output` is the model's raw text. It is already populated on a parse failure;
	// exposing it lets callers checkpoint a stage they cannot parse instead of losing it.
	| {
			success: false;
			error: string;
			data?: T;
			duration?: number;
			output?: string;
			meta?: ClaudeRunMeta;
	  };

export interface ResearchOutput {
	topic: string;
	summary: string;
	quranReferences: Array<{
		surah: string;
		ayah: string;
		/** "4:85" or "30:31-32". Resolved from the surah name when research omits it. */
		verseKey?: string;
		text: string;
		/** Knut Bernström's wording, filled in by the orchestrator — the text to quote. */
		bernstrom?: string;
	}>;
	quotes: Array<{
		id: string;
		text: string;
		textSv?: string;
		author: string;
		source?: string;
	}>;
	bookPassages: Array<{
		id: string;
		text: string;
		bookTitle: string;
		author: string;
		/** Printed page, "volume:page", as search_books returned it. */
		page?: string;
	}>;
	sources: Array<{
		id: string;
		url: string;
		title: string;
		keyFindings: string[];
	}>;
	/** Numeric series for the figures stage. Empty on most essays — see ResearchOutputSchema. */
	datasets?: Array<{
		id: string;
		question: string;
		unit: string;
		source: string;
		sourceUrl?: string;
		retrieved: string;
		note?: string;
		columns: string[];
		rows: Array<{ label: string; values: string[] }>;
	}>;
}

export interface FactCheckOutput {
	overallCredibility: number;
	verdict: "pass" | "revise" | "reject";
	summary: string;
	verifiedClaims: Array<{
		claim: string;
		status: "verified";
		method?: string;
		notes?: string;
	}>;
	unverifiedClaims?: Array<{
		claim: string;
		status: "unverified";
		reason: string;
	}>;
	missingPerspectives?: string[];
	sourceAssessment: {
		totalSources: number;
		highCredibility: number;
	};
	recommendations?: string[];
	/** One verdict per dataset. Only "verified" ones may become a figure. */
	datasetChecks?: Array<{
		id: string;
		status: "verified" | "unverified";
		notes?: string;
	}>;
}

export interface FiguresOutput {
	verdict: "none" | "figure";
	reasoning: string;
	figure: {
		kind: "chart" | "table";
		carriesArgument: string;
		anchorText: string;
		spec: string;
		provenance: "prose" | "dataset";
		footnoteId?: string;
		datasetId?: string;
	} | null;
	summary: string;
	/** Set by the orchestrator, not the model: why a returned figure was refused. */
	refusedFor?: string[];
}

export interface DraftOutput {
	title: string;
	/** The deck under the title. Written by the author, revisable by review and Swedish voice. */
	description?: string;
	body: string;
	wordCount?: number;
	reflection?: string;
	struggles?: string;
	efficiencySuggestions?: string;
}

export interface ReviewOutput {
	finalScore: number;
	verdict: "publish" | "revise" | "reject";
	summary: string;
	strengths?: string[];
	issues?: string[];
	revisedText?: string | null;
	/** Only when the reviewer rewrote the description. */
	description?: string;
	/** Patch mode (the essay pipeline): the edits the code applied, and the ones it refused. */
	patches?: TextPatch[];
	rejected?: PatchRejection[];
	/** Patch mode: claims the reviewer could not confirm. The verify stage settles them. */
	toVerify?: Array<{ claim: string; sentence: string; reason: string }>;
	/** Patch mode: what only a person can settle. */
	forEditor?: string[];
}

/** One fact handed to the verify stage, and which stage raised the doubt. */
export interface VerifyItem {
	origin: "review" | "deepen" | "ground";
	claim: string;
	/** The sentence or passage in the essay that carries it. */
	sentence: string;
	reason: string;
}

/** State of the stages after the draft, saved after each one so --resume can skip them. */
interface EditCheckpoint {
	/** Hash of the draft these edits were made to; a new draft invalidates the checkpoint. */
	draftKey: string;
	done: string[];
	text: string;
	title: string;
	description?: string;
	firstReview?: ReviewOutput;
	verifyItems: VerifyItem[];
	settled: string[];
	reviewRound: number;
	openIssues: Array<{ section: string; text: string }>;
}

/** What verify found, with the essay as its patches left it. */
export interface VerifyOutput extends VerifyFindings {
	body: string;
	rejected?: PatchRejection[];
}

/**
 * The four post-review stages return patches; the code applies them to the text it sent.
 * `body` is that result, so callers that only read `.body` work unchanged, and `rejected`
 * lists what the guards refused (see text-patches.ts).
 */
interface PatchedStage {
	body: string;
	rejected?: PatchRejection[];
}

export interface PolishOutput extends PatchedStage {
	sectionScores: string;
	strongestSentence: string;
	weakestSentence: string;
	patches: TextPatch[];
	/** One line per applied patch — what the old full-body format called `edits`. */
	edits: string;
}

export interface SwedishVoiceOutput {
	verdict: "clean" | "corrected";
	correctedTitle?: string;
	correctedDescription?: string;
	issuesFound: Array<{
		type: // Swedish-voice (English-thinking) patterns
			| "anglicism"
			| "rhetoric"
			| "repetition"
			| "overexplain"
			| "rhythm"
			| "idiom"
			| "hedging"
			| "connector"
			| "abstraction"
			// Word-level (former Language stage)
			| "nonexistent-word"
			| "gender"
			| "preposition"
			| "ai-phrase"
			// Measured AI-patterns (former Detox stage)
			| "inte-utan"
			| "vocabulary"
			| "attribution"
			| "convergence"
			| "em-dash"
			| "den-som"
			| "koranen-subject"
			| "modernity-strawman";
		location: string;
		original: string;
		correction: string;
		reason: string;
	}>;
	patternCounts?: Record<string, { before: number | string; after: number | string }>;
	summary: string;
	body: string;
	rejected?: PatchRejection[];
}

export interface GroundOutput {
	verdict: "clean" | "grounded";
	changesCount: number;
	changes: Array<{
		location: string;
		original: string;
		addition: string;
		why: string;
	}>;
	summary: string;
	body: string;
	rejected?: PatchRejection[];
}

export interface DeepenOutput {
	verdict: "clean" | "deepened";
	thesis: string;
	argumentChain: string[];
	gaps: Array<{
		location: string;
		type: string;
		description: string;
	}>;
	changes: Array<{
		location: string;
		type: string;
		before: string;
		after: string;
		reasoning: string;
	}>;
	changesCount: number;
	summary: string;
	body: string;
	rejected?: PatchRejection[];
}

export interface EvalCorrectionOutput {
	verdict: "clean" | "corrected";
	changesCount: number;
	changes: Array<{
		category: string;
		original: string;
		replacement: string;
	}>;
	summary: string;
	body: string;
}

export interface ProductionResult {
	success: boolean;
	topic: string;
	outputDir: string;
	stages: {
		research?: StageResult<ResearchOutput>;
		factCheck?: StageResult<FactCheckOutput>;
		authoring?: StageResult<DraftOutput>;
		review?: StageResult<ReviewOutput>;
		polish?: StageResult<PolishOutput>;
		deepen?: StageResult<DeepenOutput>;
		ground?: StageResult<GroundOutput>;
		swedishVoice?: StageResult<SwedishVoiceOutput>;
		figures?: StageResult<FiguresOutput>;
	};
	finalArticle?: string;
	bibliography?: string;
	totalDuration?: number;
	publishedSlug?: string;
	/** The editor's list of what no gate resolved (see writeOpenIssues). */
	openIssuesPath?: string;
}

export interface IdeaContext {
	topicSlug: string;
	ideaId: number;
}

export interface IdeaBrief {
	title: string;
	thesis: string;
	angle: string;
	keywords: string[];
	difficulty: "standard" | "challenging" | "expert";
	seedQuotes?: Array<{ text: string; author: string; source?: string }>;
	/**
	 * Hard editorial requirements: what the essay must not do. Unlike thesis and angle,
	 * which are direction the author may deviate from, these decide whether the essay can
	 * be published, and every stage that edits text sees them. See splitBriefRequirements.
	 */
	requirements?: string;
}

/**
 * Pull the hard requirements out of a brief's angle.
 *
 * The hand-written briefs carry them inside `angle`, after a marker line such as
 * »⚠️ KRAV SOM AVGÖR OM SIDAN DUGER.« Left there, they reached only research and the
 * author — and the author read the whole angle under the heading »creative compass, not
 * handcuffs — deviate where the material demands it«. An explicit `requirements` field
 * wins; otherwise the marker splits the angle.
 */
export function splitBriefRequirements(brief: Pick<IdeaBrief, "angle" | "requirements">): {
	angle: string;
	requirements?: string;
} {
	if (brief.requirements?.trim())
		return { angle: brief.angle, requirements: brief.requirements.trim() };
	const marker = brief.angle.search(/(?:⚠️\s*)?KRAV SOM AVGÖR/);
	if (marker === -1) return { angle: brief.angle };
	return {
		angle: brief.angle.slice(0, marker).trim(),
		requirements: brief.angle.slice(marker).trim(),
	};
}

/**
 * Poänggrind för essäer. Under detta tvingas ett revisionsvarv till även om granskaren
 * satt utfallet »publish«.
 *
 * ⚠️ Fördjupningsproducenten har haft samma grind i kod sedan början (MIN_FINAL_SCORE = 8)
 * medan essäpipelinen bara läste `verdict` — så en essä med finalScore 4 och utfall
 * »publish« gick rakt igenom. Poängen och utfallet sätts av samma modell i samma svar,
 * och de går isär: på abort-sidan gav varv 1 7,8/»revise« och varv 2 8,6/»publish«, men
 * inget hindrade den motsatta kombinationen.
 */
const MIN_ESSAY_FINAL_SCORE = 8;

/**
 * Ground may add at most two sentences, and none that opens with the formula its old
 * example taught: of 111 additions across the runs to 2026-09, 54 began »Det är«, 13
 * »Den som« and 6 »Det vet den som« — the very openers Swedish voice counts as an AI
 * pattern. Two essays in a row got someone standing »i hallen«.
 */
const GROUND_MAX_ADDITIONS = 2;
const GROUND_FORMULA = /^(det är|den som|det vet|som när|så ser det ut)\b/i;

/** Patch veto for the language stages: a correction may not make a known word unknown. */
function vetMisspelling(patch: TextPatch): string | undefined {
	const bad = newMisspellings(patch.original, patch.replacement);
	return bad && bad.length > 0 ? `introduces unknown word(s): ${bad.join(", ")}` : undefined;
}

/** A numeric score never overrides the fact-checker's explicit safety verdict. */
export function factCheckPassed(factCheck: FactCheckOutput, threshold: number): boolean {
	return factCheck.verdict === "pass" && factCheck.overallCredibility >= threshold;
}

/** Publishing requires both halves of the review contract to agree. */
export function reviewPassed(review: ReviewOutput): boolean {
	return review.verdict === "publish" && review.finalScore >= MIN_ESSAY_FINAL_SCORE;
}

/**
 * Accept a guarded correction when the measured result is no worse.
 *
 * ⚠️ This used to demand a strict improvement, and the evaluator cannot see word choice:
 * the Codex audit's correct fixes »ställer sina villkor till den som röstar« → »för«
 * (»Sorgen vid Nilen«) and »samstämmighet i hemort« → »gemensam hemort« (»Rösten är ingen
 * belöning«) left the count unchanged, were discarded, and shipped. The patches are
 * already filtered to high-confidence, meaning-safe, protected-content-safe edits, so
 * »not worse« is the right bar.
 */
export function proseCorrectionAcceptable(before: number, after: number | undefined): boolean {
	return after !== undefined && after <= before;
}

/** Populate the transient bibliography from persisted research checkpoints. */
export function trackResearchReferences(
	tracker: ReferenceTracker,
	research: Pick<ResearchOutput, "sources" | "quotes">,
	accessDate?: string,
): void {
	for (const source of research.sources) {
		tracker.addReference({
			type: "web",
			title: source.title,
			url: source.url,
			accessDate,
		});
	}
	for (const quote of research.quotes) {
		tracker.addReference({
			type: "quote",
			title: quote.source || "Unknown",
			author: quote.author,
		});
	}
}

/**
 * Sort what verify returned into what is settled and what the editor must still look at.
 *
 * ⚠️ Only two things count as settled: an item the stage confirmed, and one whose
 * correction actually landed in the text. An item the stage skipped, left open, or
 * corrected with a patch the code could not place stays open. Counting any of those as
 * settled would tell the final read not to look at a claim nobody checked.
 */
export function triageVerification(
	items: VerifyItem[],
	result: Pick<VerifyOutput, "items" | "rejected">,
): { settled: string[]; open: string[]; log: string[] } {
	const refused = new Set((result.rejected ?? []).map((r) => r.patch));
	const settled: string[] = [];
	const open: string[] = [];
	const log: string[] = [];
	const answered = new Set<number>();
	for (const found of result.items) {
		const item = items[found.id - 1];
		if (!item || answered.has(found.id)) continue;
		answered.add(found.id);
		const unplaced = found.patch !== undefined && refused.has(found.patch);
		const needsPatch = found.status === "corrected" || found.status === "struck";
		log.push(`[${found.status}] ${item.claim} — ${found.evidence}`);
		if (found.status === "open") {
			open.push(`${item.claim} — ${found.evidence}`);
		} else if (unplaced && found.patch) {
			open.push(
				`${item.claim} — rättelsen kunde inte föras in (${describePatch(found.patch, 120)}); ${found.evidence}`,
			);
		} else if (needsPatch && !found.patch) {
			open.push(`${item.claim} — angavs som ${found.status} utan ändring; ${found.evidence}`);
		} else {
			settled.push(`${item.claim} — ${found.status}: ${found.evidence}`);
		}
	}
	items.forEach((item, i) => {
		if (!answered.has(i + 1)) {
			open.push(`${item.claim} — verifieringen lämnade den obesvarad (${item.reason})`);
		}
	});
	return { settled, open, log };
}

/** ", 21:535" when research recorded the printed page of a book passage, else "". */
function passagePage(passage: { page?: string }): string {
	return passage.page ? `, ${passage.page}` : "";
}

/** The fact-check's open points, for the reviewer to check the author accounted for. */
function formatFactCheckFlags(factCheck: FactCheckOutput | undefined): string {
	if (!factCheck) return "";
	const sections: string[] = [];
	if (factCheck.unverifiedClaims && factCheck.unverifiedClaims.length > 0) {
		sections.push(
			"**Unverified claims** (verify the author avoided or reworded these):\n" +
				factCheck.unverifiedClaims.map((c) => `- ${c.claim}`).join("\n"),
		);
	}
	if (factCheck.recommendations && factCheck.recommendations.length > 0) {
		sections.push(
			"**Recommendations** (check whether the author addressed each — flag any that were silently ignored):\n" +
				factCheck.recommendations.map((r) => `- ${r}`).join("\n"),
		);
	}
	if (factCheck.missingPerspectives && factCheck.missingPerspectives.length > 0) {
		sections.push(
			"**Missing perspectives** (check whether the author engaged with these — flag significant omissions):\n" +
				factCheck.missingPerspectives.map((p) => `- ${p}`).join("\n"),
		);
	}
	return sections.length > 0 ? `\n\n## FACT-CHECK FLAGS\n${sections.join("\n\n")}` : "";
}

export class ContentOrchestrator {
	private runner: ClaudeRunner;
	private codexAuditor: CodexTicAuditor;
	private validator: SourceValidator;
	private references: ReferenceTracker;
	private logger: ReturnType<typeof createLogger>;
	/** Hard requirements of the brief being produced (see splitBriefRequirements). */
	private requirements?: string;
	/** The earlier essays the essay in production builds on (see services/related-essays.ts). */
	private earlier: { vetted: VettedRelatedEssays; essays: PublishedEssay[] } | null = null;
	/** Every Claude call of the current run: which model answered and what it cost. */
	private stageRuns: Array<
		{ stage: string; durationMs?: number; effort?: string } & ClaudeRunMeta
	> = [];
	/** Output directory of the production in progress; stage-runs.json is kept there. */
	private runDir?: string;
	/** Things no gate resolved, collected for open-issues.md. */
	private openIssues: Array<{ section: string; text: string }> = [];
	private houseRulesCache?: string;
	/** run.log of the production in progress; the logger appends every line to it. */
	private logFile?: string;
	private options: Required<
		Omit<OrchestratorOptions, "onPreview" | "onStageChange" | "promptOverrides">
	> &
		Pick<OrchestratorOptions, "onPreview" | "onStageChange" | "promptOverrides">;
	private promptsDir: string;

	constructor(options: OrchestratorOptions) {
		this.runner = new ClaudeRunner();
		this.codexAuditor = new CodexTicAuditor();
		this.validator = new SourceValidator();
		this.references = new ReferenceTracker();
		this.promptsDir = join(__dirname, "../prompts");

		this.options = {
			outputDir: options.outputDir,
			model: options.model ?? "opus",
			// 7.5, matching the documented default and what `produce article` passes. It
			// read 7 here, so a caller that omitted it silently got a lower bar than the CLI.
			qualityThreshold: options.qualityThreshold ?? 7.5,
			maxRevisions: options.maxRevisions ?? 2,
			publish: options.publish ?? true,
			quiet: options.quiet ?? false,
			onPreview: options.onPreview,
			onStageChange: options.onStageChange,
			promptOverrides: options.promptOverrides,
			sourceDocs: options.sourceDocs ?? [],
		};
		this.logger = createLogger(this.options.quiet, () => this.logFile);
	}

	/** The house rules (prompts/house-rules.md), appended to every stage that writes text. */
	private houseRules(): string {
		if (this.houseRulesCache === undefined) {
			const path = join(this.promptsDir, "house-rules.md");
			this.houseRulesCache = existsSync(path) ? `\n\n${readFileSync(path, "utf-8").trim()}` : "";
		}
		return this.houseRulesCache;
	}

	/**
	 * The brief's hard requirements, for every stage that edits text. They used to reach
	 * research and the author only, so the passes after review never saw »INGEN
	 * SEKULARISTISK GRUND« or »INGEN RÖSTREKOMMENDATION«.
	 */
	private requirementsBlock(): string {
		if (!this.requirements) return "";
		return `\n\n<hard_requirements source="brief">\nThese decide whether the essay can be published. They outrank style, rhythm and every other instruction; an edit that would break one is not made.\n\n${this.requirements}\n</hard_requirements>`;
	}

	/** The latest titles and the frames they have worn out, for every stage that writes a title. */
	private recentTitlesSection(): string {
		const block = recentTitlesBlock(join(findDataDir(), "articles"));
		return block ? `\n\n${block}` : "";
	}

	private noteOpenIssue(section: string, text: string): void {
		this.openIssues.push({ section, text });
	}

	/**
	 * Record which model answered a stage. `--fallback-model sonnet` swaps silently when
	 * Opus is overloaded, and nothing in a run said whether the essay's author was the
	 * model it was meant to be.
	 */
	private recordRun(
		stage: string,
		meta: ClaudeRunMeta | undefined,
		durationMs?: number,
		effort?: string,
	): void {
		if (!meta) return;
		this.stageRuns.push({ stage, durationMs, effort, ...meta });
		// Written after every call, not only at the end: a run that fails a gate has no
		// metadata.json, and its cost was then recorded nowhere (»Bokmässan«, 2026-09-27).
		if (this.runDir) saveOutput(this.runDir, "stage-runs.json", this.stageRuns);
		if (meta.stopReason === "max_tokens" || meta.stopReason === "refusal") {
			const note = `${stage}: svaret avbröts (${meta.stopReason})`;
			this.logger.warn(`   ⚠️  ${note}`);
			this.noteOpenIssue("Avbrutet svar", note);
		}
		const requested = getModelId(this.options.model);
		const fallback = getModelId("sonnet");
		const fellBack =
			!meta.models.includes(requested) ||
			(requested !== fallback && meta.models.includes(fallback));
		if (fellBack) {
			const note = `${stage}: besvarades av ${meta.models.join(", ")} (begärd ${requested})`;
			this.logger.warn(`   ⚠️  Reservmodell: ${note}`);
			this.noteOpenIssue("Reservmodell", note);
		}
	}

	/** The briefing block for a stage prompt, or "" when no documents were supplied.
	 *  Goes in `userContent`, never in the system prompt: at ~30k tokens it would blow
	 *  the cached prefix that every stage shares, and the runner already keeps bulk
	 *  material out of --append-system-prompt for exactly this reason. */
	private sourceDocsBlock(): string {
		return formatSourceDocs(this.options.sourceDocs ?? []);
	}

	/** The published essays, as the run already read them when it could. */
	private publishedEssays(): PublishedEssay[] {
		return this.earlier?.essays ?? readPublishedEssays(join(findDataDir(), "articles"));
	}

	/** Make each reference to an earlier essay a link (see linkEssayReferences). */
	private linkReferences(text: string): string {
		const { text: withLinks, linked } = linkEssayReferences(text, this.publishedEssays());
		if (linked.length > 0) {
			this.logger.log(`   🔗 Länkade hänvisningen till ${linked.map((t) => `»${t}«`).join(", ")}`);
		}
		return withLinks;
	}

	/** The `<earlier_essays>` block for a stage, or "" when the run has none. */
	private earlierBlock(reader: "research" | "author"): string {
		return this.earlier ? relatedEssaysBlock(this.earlier.vetted, this.earlier.essays, reader) : "";
	}

	/** What research reads besides its prompt: each published essay's sources, the earlier
	 *  essays this one builds on, then the briefing. */
	private researchContext(): string {
		return [
			publishedEssaysBlock(join(findDataDir(), "articles")),
			this.earlierBlock("research"),
			this.sourceDocsBlock(),
		]
			.filter(Boolean)
			.join("\n\n");
	}

	/** A pointer line for a stage's own guidance block. The briefing carries its rules
	 *  with it, but three prompts actively tell the model that PDFs are unreadable and
	 *  that unsourced figures are suspect — without a pointer here, those instructions
	 *  win and the briefing is read as one more untrusted web hit. */
	private briefingNote(): string {
		const docs = this.options.sourceDocs ?? [];
		if (docs.length === 0) return "";
		const names = docs.map((d) => d.name).join(", ");
		return `\n- A pre-validated briefing is attached below as <briefing_documents> (${names}). Its figures, dates and rulings are already source-checked — use them as given, attribute to the primary source the report names, and do NOT treat them as unsourced.`;
	}

	/**
	 * Execute a Claude stage with common timing, logging, and error handling.
	 * Optionally validates output against a Zod schema.
	 * Returns the raw result - stages handle their own post-processing.
	 * Includes retry logic for transient validation failures.
	 * When onPreview is configured, uses streaming to emit preview snippets.
	 */
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: multi-mode stage executor with retry logic
	private async executeClaudeStage<T>(options: {
		name: string;
		stage: PreviewChunk["stage"];
		emoji: string;
		promptFile: string;
		systemPrompt: string;
		allowedTools?: string[];
		/** Zod schema for full output validation (JSON mode) */
		schema?: import("zod").ZodSchema<T>;
		/** JSON Schema for Claude --json-schema flag (JSON mode only) */
		jsonSchema?: object;
		/** Markdown mode: frontmatter+body output instead of JSON.
		 * When set, jsonSchema is ignored. Output is parsed as frontmatter+markdown. */
		markdownMode?: {
			frontmatterSchema: import("zod").ZodSchema;
			combine: (meta: Record<string, unknown>, body: string) => T;
		};
		maxRetries?: number;
		skipPermissions?: boolean;
		mcpConfig?: string;
		effort?: ClaudeRunOptions["effort"];
		timeout?: number;
		/** Content appended to the user prompt (article body, pre-fetched material).
		 *  Keeps article text out of --append-system-prompt so Claude never echoes the prefix. */
		userContent?: string;
	}): Promise<StageResult<T>> {
		const startTime = Date.now();
		const maxRetries = options.maxRetries ?? 2;
		this.logger.log(`${options.emoji} ${options.name}...`);

		const promptFile = this.options.promptOverrides?.[options.promptFile] ?? options.promptFile;
		const promptPath = isAbsolute(promptFile) ? promptFile : join(this.promptsDir, promptFile);
		const useStreaming = !!this.options.onPreview;
		const { markdownMode } = options;
		const isMarkdown = !!markdownMode;

		// Derive built-in tool list from allowedTools — only load what's needed.
		// Stages with no tools get --tools "" (saves prompt tokens for editorial stages).
		const builtinTools = (options.allowedTools ?? []).filter((t) => !t.startsWith("mcp__"));

		const runOptions: ClaudeRunOptions = {
			prompt: promptPath,
			systemPrompt: options.systemPrompt,
			userContent: options.userContent,
			model: getModelId(this.options.model),
			allowedTools: options.allowedTools,
			builtinTools,
			mcpConfig: options.mcpConfig,
			// JSON mode: pass schema for server-side validation
			// Markdown mode: no schema, no json output format
			jsonSchema: isMarkdown ? undefined : options.jsonSchema,
			effort: options.effort,
			timeout: options.timeout,
			fallbackModel: getModelId("sonnet"),
			noSessionPersistence: true,
			skipPermissions: options.skipPermissions ?? true,
		};

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			let result: {
				success: boolean;
				output?: string;
				error?: string;
				data?: T;
				exitCode?: number;
				meta?: ClaudeRunMeta;
			};

			if (useStreaming) {
				const streamResult = await this.runner.runWithStreaming(runOptions, (chunk) => {
					this.options.onPreview?.({
						stage: options.stage,
						type: chunk.type,
						content: chunk.content,
					});
				});

				if (streamResult.success && streamResult.output) {
					result = {
						...(isMarkdown && markdownMode
							? this.parseMarkdownResult(streamResult, markdownMode)
							: this.parseJsonResult(streamResult, options.schema)),
						meta: streamResult.meta,
					};
				} else {
					result = streamResult;
				}
			} else if (isMarkdown && markdownMode) {
				// Markdown mode: a text run inside the CLI's JSON envelope (for the model
				// record), then parse frontmatter+body
				const rawResult = await this.runner.runText(runOptions);
				if (rawResult.success && rawResult.output) {
					result = { ...this.parseMarkdownResult(rawResult, markdownMode), meta: rawResult.meta };
				} else {
					result = rawResult;
				}
			} else {
				// JSON mode: runJSON with schema validation
				result = await this.runner.runJSON<T>(runOptions, options.schema);
			}

			this.recordRun(options.name, result.meta, Date.now() - startTime, options.effort);
			if (result.success && result.data) {
				return {
					success: true,
					data: result.data,
					duration: Date.now() - startTime,
					meta: result.meta,
				};
			}

			// Retry on validation failures and transient errors
			const isRetryable =
				result.error?.includes("Validation failed") ||
				result.error?.includes("rate limit") ||
				result.error?.includes("429") ||
				result.error?.includes("503") ||
				result.error?.includes("overloaded") ||
				result.error?.includes("timed out") ||
				result.error?.includes("ECONNRESET");
			if (isRetryable && attempt < maxRetries) {
				const delay = 2000 * attempt; // linear backoff: 2s, 4s, ...
				this.logger.log(
					`   ⚠️  ${result.error?.slice(0, 200) ?? "Validation failed"}, attempt ${attempt}/${maxRetries} failed, retry in ${delay / 1000}s...`,
				);
				await new Promise((resolve) => setTimeout(resolve, delay));
				continue;
			}

			return {
				success: false,
				error: result.error || `${options.name} failed`,
				output: result.output,
				duration: Date.now() - startTime,
			};
		}

		// Should never reach here, but satisfy TypeScript
		return {
			success: false,
			error: `${options.name} failed after ${maxRetries} attempts`,
			duration: Date.now() - startTime,
		};
	}

	/** Parse JSON mode result from streaming or runJSON output */
	private parseJsonResult<T>(
		rawResult: { success: boolean; output?: string; error?: string },
		schema?: import("zod").ZodSchema<T>,
	): { success: boolean; output?: string; error?: string; data?: T } {
		const output = rawResult.output ?? "";
		const parsed = this.runner.parseJSONOutput<T>(output);
		if (parsed && schema) {
			const validation = this.runner.validateOutput(parsed, schema);
			if (validation.success) {
				return { ...rawResult, data: validation.data };
			}
			return { success: false, error: validation.error, output };
		}
		if (parsed) {
			return { ...rawResult, data: parsed as T };
		}
		const snippet = output.slice(0, 300);
		return {
			success: false,
			error: `Output parse failed: no structured_output in stream result.${snippet ? ` Got: ${snippet}...` : " Output was empty."}`,
			output,
		};
	}

	/** Parse markdown frontmatter+body result */
	private parseMarkdownResult<T>(
		rawResult: { success: boolean; output?: string; error?: string },
		markdownMode: {
			frontmatterSchema: import("zod").ZodSchema;
			combine: (meta: Record<string, unknown>, body: string) => T;
		},
	): { success: boolean; output?: string; error?: string; data?: T } {
		const output = rawResult.output ?? "";
		const { parsed, reason } = this.runner.parseMarkdownWithMetaDetailed(output);
		if (!parsed) {
			const head = output.slice(0, 500);
			const tail = output.slice(-300);
			return {
				success: false,
				error: `Output parse failed: ${reason}. Length: ${output.length} chars.\nHEAD: ${head}\nTAIL: ${tail}`,
				output,
			};
		}

		const validation = this.runner.validateOutput(parsed.meta, markdownMode.frontmatterSchema);
		if (!validation.success) {
			return { success: false, error: validation.error, output };
		}

		const data = markdownMode.combine(validation.data as Record<string, unknown>, parsed.body);
		return { ...rawResult, data };
	}

	/**
	 * Ensure output directory exists
	 */
	private ensureOutputDir(topicSlug: string): string {
		const dir = join(this.options.outputDir, topicSlug);
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
		return dir;
	}

	/**
	 * Post-process research results: URL verification, source validation, reference tracking
	 * Strip a dataset's link when it does not resolve, but keep the dataset.
	 *
	 * ⚠️ »En källa utan länk är korrekt. En påhittad länk är en förfalskning« — the rule
	 * scripts/check-chart-sources.py states. So the URL goes and the named source stays, and
	 * the fact-check stage then decides whether the numbers themselves survive. Dropping the
	 * whole dataset here would hide a fabricated series behind a link error instead of
	 * putting it in front of the gate that exists to judge it.
	 */
	private validateDatasetLinks(
		rawDatasets: NonNullable<ResearchOutput["datasets"]>,
		verifiedUrls: Set<string>,
	): NonNullable<ResearchOutput["datasets"]> {
		const validated = rawDatasets.map((dataset) => {
			if (!dataset.sourceUrl || verifiedUrls.has(dataset.sourceUrl)) return dataset;
			this.logger.log(
				`   - ⚠️  Dataset »${dataset.id}« hade en länk som inte svarar (${dataset.sourceUrl}) — länken tas bort, källan behålls`,
			);
			const { sourceUrl: _dropped, ...rest } = dataset;
			return rest;
		});
		if (validated.length > 0) {
			this.logger.log(`   - ${validated.length} dataset för figursteget`);
		}
		return validated;
	}

	/**
	 * Returns both the stage result and a formatted summary with timing breakdown.
	 */
	private async processResearchResult(
		rawResult: StageResult<ResearchOutput>,
		startTime: number,
	): Promise<{ result: StageResult<ResearchOutput>; summary: string }> {
		if (!(rawResult.success && rawResult.data)) {
			return {
				result: {
					success: false,
					error: rawResult.error || "Research stage failed",
					duration: Date.now() - startTime,
				},
				summary: "",
			};
		}

		const claudeDuration = rawResult.duration ?? Date.now() - startTime;

		// URL verification
		this.options.onStageChange?.({
			stage: "research",
			status: "running",
			summary: "Verifying URLs...",
		});
		const rawSources = rawResult.data.sources || [];
		const rawDatasets = rawResult.data.datasets || [];
		this.logger.log("   - Verifying URLs...");
		const verifyStart = Date.now();
		const urlsToVerify = [
			...rawSources.map((s) => s.url),
			// A dataset's endpoint gets the same liveness check a source URL gets. It is the
			// cheapest test for the failure mode that matters here: a plausible-looking API
			// URL that was never actually called.
			...rawDatasets.flatMap((d) => (d.sourceUrl ? [d.sourceUrl] : [])),
		];
		const verification = await this.validator.verifyUrls(urlsToVerify);

		if (verification.stats.failed > 0) {
			this.logger.log(`   - ⚠️  ${verification.stats.failed} URL(s) failed verification`);
		}

		// Persist URL verification results for future blocklist
		try {
			const tracker = loadDomainTracker();
			updateDomainTracker(tracker, verification.results);
			saveDomainTracker(tracker);
		} catch (e) {
			this.logger.warn(`   - ⚠️  Failed to save domain tracker: ${e}`);
		}

		const verifiedUrls = new Set<string>();
		for (const r of verification.results) {
			if (r.exists) verifiedUrls.add(r.url);
		}

		const validatedSources = rawSources
			.filter((source) => verifiedUrls.has(source.url))
			.filter((source) => {
				const validation = this.validator.validateSource(source.url);
				return validation.credibility !== "rejected";
			});
		const validatedDatasets = this.validateDatasetLinks(rawDatasets, verifiedUrls);
		const urlVerifyDuration = Date.now() - verifyStart;

		// Quote verification
		this.options.onStageChange?.({
			stage: "research",
			status: "running",
			summary: "Checking quotes...",
		});
		const quoteVerifyStart = Date.now();
		const rawQuotes = rawResult.data.quotes || [];
		let verifiedCount = 0;
		// Web and primary-text quotes carry label ids ("primary-ibn-taymiyya-35-39"). They
		// are not errors — fact-check reads them in full against their source — so they are
		// counted on one line instead of a warning each.
		const outsideDb = rawQuotes.filter((q) => !isDatabaseQuoteId(q.id));
		for (const quote of rawQuotes.filter((q) => isDatabaseQuoteId(q.id))) {
			const numericId = Number.parseInt(String(quote.id).replace(/^quote-/, ""), 10);
			if (getQuote(numericId)) {
				verifiedCount++;
			} else {
				this.logger.log(`   - ⚠️  Quote ID ${quote.id} not found in database`);
			}
		}
		if (rawQuotes.length > 0) {
			this.logger.log(
				`   - Verified ${verifiedCount}/${rawQuotes.length - outsideDb.length} database quotes; ${outsideDb.length} from web or primary texts go to fact-check in full`,
			);
		}
		const quoteVerifyDuration = Date.now() - quoteVerifyStart;

		const data: ResearchOutput = {
			...rawResult.data,
			sources: validatedSources,
			quotes: rawQuotes,
			bookPassages: rawResult.data.bookPassages || [],
			datasets: validatedDatasets,
		};

		// ⚠️ The quotes MCP server is spawned by the CLI, and nothing reported whether it
		// started: with apps/mcp-quotes unbuilt, research carried on with web tools alone and
		// the essay lost its primary sources without a line in the log.
		const fromCorpus =
			data.bookPassages.length +
			data.quranReferences.length +
			data.quotes.filter((q) => isDatabaseQuoteId(q.id)).length;
		if (fromCorpus === 0) {
			return {
				result: {
					success: false,
					error:
						"Research returned nothing from the corpus: no database quote, no book passage, no Quran verse. The quotes MCP server probably did not start — check that apps/mcp-quotes/dist exists (pnpm build).",
					duration: Date.now() - startTime,
				},
				summary: "",
			};
		}
		if (data.bookPassages.length === 0) {
			this.logger.warn("   ⚠️  Research hämtade inga bokpassager");
			this.noteOpenIssue(
				"Research",
				"Inga bokpassager hämtades: essän vilar på citatdatabasen och webben. Kontrollera om bokkorpusen verkligen saknar ämnet.",
			);
		}

		trackResearchReferences(this.references, data, new Date().toISOString());

		this.logger.log(
			`   - Found ${data.quotes.length} quotes, ${data.bookPassages.length} book passages, ${data.sources.length} sources`,
		);

		// Build summary with timing breakdown
		const verifyTotal = urlVerifyDuration + quoteVerifyDuration;
		const counts = `${data.sources.length} sources, ${data.quotes.length} quotes`;
		const timing = `LLM ${formatDuration(claudeDuration)}, verify ${formatDuration(verifyTotal)}`;
		this.logger.log(`   - Timing: ${timing}`);

		return {
			result: {
				success: true,
				data,
				duration: Date.now() - startTime,
			},
			summary: `${counts} | ${timing}`,
		};
	}

	/**
	 * Read every published essay in full against an idea and report where the earlier
	 * essays have already been on its ground (see services/related-essays.ts). The model's
	 * quotes are searched for before anything is returned.
	 *
	 * Effort `high` is what the stage was measured at: about three minutes for 69 essays.
	 * The essays go in whole, some 400 000 tokens today, so the stage stops fitting when
	 * the corpus is roughly two and a half times its present size.
	 */
	async runRelatedEssays(
		idea: string,
	): Promise<StageResult<{ vetted: VettedRelatedEssays; essays: PublishedEssay[] }>> {
		const essays = readPublishedEssays(join(findDataDir(), "articles"));
		if (essays.length === 0) {
			return { success: false, error: "No published essays to read" };
		}
		const stage = await this.executeClaudeStage<RelatedEssaysFindings>({
			name: "Earlier essays",
			stage: "research",
			emoji: "🧭",
			promptFile: "related-essays.md",
			systemPrompt:
				"You find what islam.se has already published on the ground a new essay will cover, so that the new essay can build on it.",
			userContent: `${fullEssaysBlock(essays)}\n\n<idea>\n${idea.trim()}\n</idea>\n\nReport the earlier essays for this idea as the prompt above the essays describes.`,
			schema: RelatedEssaysOutputSchema,
			jsonSchema: getRelatedEssaysJsonSchema(),
			effort: "high",
			timeout: 1200000, // 20 min
		});
		if (!(stage.success && stage.data)) {
			return {
				success: false,
				error: stage.error ?? "Earlier-essays stage failed",
				duration: stage.duration,
			};
		}
		const vetted = vetRelatedEssays(stage.data, essays);
		const inEssays = new Set(vetted.related.map((relation) => relation.slug)).size;
		const closest = closestEssays(vetted, essays)
			.map((essay) => `»${essay.title}«`)
			.join(", ");
		this.logger.log(
			`   - ${vetted.related.length} beröringspunkter i ${inEssays} av ${essays.length} essäer${closest ? `; närmast ${closest}` : ""}`,
		);
		if (vetted.rejected.length > 0) {
			this.logger.log(
				`   - ⚠️  Sökningen strök ${vetted.rejected.length} citat som inte står i den essä modellen angav`,
			);
		}
		return {
			success: true,
			data: { vetted, essays },
			duration: stage.duration,
			meta: stage.meta,
		};
	}

	/**
	 * The earlier essays for a production run: loaded from the run directory on resume,
	 * otherwise found and saved. Never fatal: without it the essay is written as essays
	 * were before the stage existed, with only the list of each essay's sources.
	 */
	private async earlierEssaysForRun(
		idea: string,
		outputDir: string,
		resume: boolean,
	): Promise<{ vetted: VettedRelatedEssays; essays: PublishedEssay[] } | null> {
		const cached = resume
			? loadOutput<VettedRelatedEssays>(outputDir, "related-essays.json")
			: null;
		if (cached && Array.isArray(cached.related)) {
			this.logger.log("🧭 Earlier essays — loaded from checkpoint");
			return { vetted: cached, essays: readPublishedEssays(join(findDataDir(), "articles")) };
		}
		this.options.onStageChange?.({
			stage: "research",
			status: "running",
			summary: "Reading the published essays against the idea...",
		});
		const found = await this.runRelatedEssays(idea);
		if (!(found.success && found.data)) {
			this.logger.warn(`   ⚠️  Steget »Earlier essays« misslyckades: ${found.error}`);
			this.noteOpenIssue(
				"Tidigare essäer",
				`Steget kördes inte (${found.error}). Essän skrevs utan de tidigare essäerna framför sig: se efter om den borde bygga vidare på eller hänvisa till någon av dem.`,
			);
			return null;
		}
		saveOutput(outputDir, "related-essays.json", found.data.vetted);
		return found.data;
	}

	/** The idea as the earlier-essays stage reads it: the brief when there is one, else the topic. */
	private ideaText(topic: string, brief?: Pick<IdeaBrief, "title" | "thesis" | "angle">): string {
		if (!brief) return topic;
		return `Title: ${brief.title}\nThesis: ${brief.thesis}\nAngle: ${brief.angle}`;
	}

	/**
	 * Run the research stage from an EnrichedIdea
	 * Uses pre-found quotes and the idea's angle for targeted searching
	 */
	async runResearchFromIdea(idea: {
		thesis: string;
		angle: string;
		keywords: string[];
		seedQuotes?: Array<{ text: string; author: string; source?: string }>;
	}): Promise<{ result: StageResult<ResearchOutput>; summary: string }> {
		const startTime = Date.now();

		const blocklist = formatBlockedDomainsPrompt(getBlockedDomains(loadDomainTracker()));

		// ⚠️ No random Swedish authors here any more. pickSwedishAuthors() named four at
		// random regardless of the angle, and the author stage then either forced one in
		// (the reviewer cut Geijer from »Marknaden i raden«) or had to refuse (»Runeberg,
		// Bergman och Levertin fanns inte i forskningsmaterialet och jag vägrade uppfinna
		// citat«). An angle picks its own voices; runResearch() keeps the suggestion for a
		// bare topic, where there is no angle to follow.
		let systemPrompt = `Topic: ${idea.thesis}

<context>
This article has a specific angle already developed. Your research should find material that supports and enriches this perspective.

Angle: ${idea.angle}

Suggested keywords: ${idea.keywords.join(", ")}
</context>

<guidance>
Find the best material for this specific angle:
- Quotes from scholars/authors, including Swedish voices where the angle calls for them
- For a classical Arabic source, search_books can filter by book and search the exact Arabic phrase (mode "text"); give volume:page from its \`page\` field when it has one
- Quran verses relevant to the angle, with the numeric verseKey ("4:85")
- Book passages for extended context
- Web sources for contemporary perspectives

Run multiple MCP searches in parallel, but do NOT mix WebFetch/WebSearch with MCP calls in the same batch — a web timeout kills sibling calls.
IMPORTANT WebFetch limitations:
- Skip URLs ending in .pdf — returns binary garbage.
- Skip litteraturbanken.se — JavaScript SPA, returns empty shell HTML.
- Skip any URL that returned empty/useless content on the first try.${this.briefingNote()}
</guidance>${blocklist}`;

		if (idea.seedQuotes && idea.seedQuotes.length > 0) {
			const formatted = idea.seedQuotes
				.map((q) => `- "${q.text}" — ${q.author}${q.source ? ` (${q.source})` : ""}`)
				.join("\n");
			systemPrompt += `

<seed_material>
These quotes were pre-found during ideation as a starting point. Use them if relevant, but search for richer and more diverse material — they are not the complete set.

${formatted}
</seed_material>`;
		}
		systemPrompt += this.requirementsBlock();

		const mcpConfigPath = join(__dirname, "../../..", ".mcp.json");
		const result = await this.executeClaudeStage<ResearchOutput>({
			name: "Stage 1: Research (from idea)",
			stage: "research",
			emoji: "📚",
			promptFile: "research.md",
			systemPrompt,
			userContent: this.researchContext(),
			allowedTools: RESEARCH_ALLOWED_TOOLS,
			mcpConfig: mcpConfigPath,
			schema: ResearchOutputSchema,
			jsonSchema: getResearchJsonSchema(),
			effort: "high",
			timeout: 1800000, // 30 min — research is the most tool-intensive stage
		});

		return this.processResearchResult(result, startTime);
	}

	/**
	 * Run the research stage
	 * Uses MCP quote tools for intelligent, targeted searching
	 */
	async runResearch(
		topic: string,
	): Promise<{ result: StageResult<ResearchOutput>; summary: string }> {
		const startTime = Date.now();

		const blocklist = formatBlockedDomainsPrompt(getBlockedDomains(loadDomainTracker()));

		const suggestedAuthors = pickSwedishAuthors(4);
		const systemPrompt = `Topic: ${topic}

<context>
You have access to MCP tools for searching the quote database (Arabic Islamic scholars, Swedish literature, Norse texts).

Your task is to develop a distinctive angle on this topic and gather supporting material. The angle should be specific enough to make the article interesting ("X as Y" rather than just "about X").
</context>

<guidance>
Consider what would make this article compelling:
- What's a fresh or counter-intuitive take on this topic?
- Which classical Islamic scholars addressed this theme?
- For Swedish perspectives, consider searching for quotes by ${suggestedAuthors.join(", ")} — but follow the material wherever it leads.

Run multiple MCP searches in parallel, but do NOT mix WebFetch/WebSearch with MCP calls in the same batch — a web timeout kills sibling calls.
IMPORTANT WebFetch limitations:
- Skip URLs ending in .pdf — returns binary garbage.
- Skip litteraturbanken.se — JavaScript SPA, returns empty shell HTML.
- Skip any URL that returned empty/useless content on the first try.${this.briefingNote()}
</guidance>${blocklist}`;

		const mcpConfigPath = join(__dirname, "../../..", ".mcp.json");
		const result = await this.executeClaudeStage<ResearchOutput>({
			name: "Stage 1: Research",
			stage: "research",
			emoji: "📚",
			promptFile: "research.md",
			systemPrompt,
			userContent: this.researchContext(),
			allowedTools: RESEARCH_ALLOWED_TOOLS,
			mcpConfig: mcpConfigPath,
			schema: ResearchOutputSchema,
			jsonSchema: getResearchJsonSchema(),
			effort: "high",
			timeout: 1800000, // 30 min — research is the most tool-intensive stage
		});

		return this.processResearchResult(result, startTime);
	}

	/**
	 * Run the fact-checking stage
	 */
	async runFactCheck(research: ResearchOutput): Promise<StageResult<FactCheckOutput>> {
		// Build domain reputation context for source credibility assessment
		const sourceUrls = (research.sources || []).map((s) => s.url);
		const reputation = formatDomainReputation(loadDomainTracker(), sourceUrls);

		// Structured format: claims + IDs for verification, not raw JSON dump
		const systemPrompt = `Research data to review:\n${formatResearchForFactCheck(research)}

<review_guidance>
Score what you find, on the scoring guide — not toward the pass mark:
- Only quotes with numeric ids (quote-12345) come from the database, and get_quote_by_id settles those. Every other id is a label research invented for a web or primary-text quote; check its wording against its source, and never count it as pre-verified
- Claims from web sources you can fetch and confirm are verified
- Claims you cannot independently verify are NOT automatically unverified — they may simply be common scholarly knowledge
- Only mark claims "unverified" if you find contradicting evidence or the claim is extraordinary and unsourced
- In verifiedClaims, put in \`notes\` what the author will need to cite: the exact wording you confirmed, edition and number, volume:page, the URL you read. The author sees these notes; nobody else will find them again
- Recommendations and missing perspectives must respect the house rules and any hard requirements below: never recommend shia, sufi or modernist "balance", or material a requirement excludes. If a requirement leaves a factual risk, name the risk instead
- WebFetch cannot read PDFs (.pdf) or JS-rendered sites (litteraturbanken.se)${this.briefingNote()}
</review_guidance>${reputation}${this.houseRules()}${this.requirementsBlock()}`;

		const mcpConfigPath = join(__dirname, "../../..", ".mcp.json");
		const result = await this.executeClaudeStage<FactCheckOutput>({
			name: "Stage 2: Quality Review",
			stage: "factCheck",
			emoji: "🔍",
			promptFile: "fact-checker.md",
			systemPrompt,
			userContent: this.sourceDocsBlock(),
			allowedTools: [
				"WebFetch",
				"WebSearch",
				"mcp__quotes__fetch_wikipedia",
				"mcp__quotes__search_quotes",
				"mcp__quotes__search_by_filter",
				"mcp__quotes__search_text",
				"mcp__quotes__get_quote_by_id",
				// Utan search_books kan fördjupningarnas bookPassages inte kontrolleras alls.
				// Faktakollen rapporterade det som "MCP-verktygen saknades" — halva
				// påståendet var sant och gällde just det här verktyget.
				"mcp__quotes__search_books",
				"mcp__quotes__get_passage_context",
				// The prompt asks for verse numbers to be checked against the quoted text; without
				// this tool that check could only be done from memory.
				"mcp__quotes__search_quran",
			], // Content verification + independent search + quote attribution checks
			mcpConfig: mcpConfigPath,
			schema: FactCheckOutputSchema,
			jsonSchema: getFactCheckJsonSchema(),
			effort: "max",
			// Raised to max: fact-check is the only fatal, non-retryable gate (a low
			// score kills the run with no article), and it's pure verification with
			// no downstream grader — more reasoning depth can only catch more
			// fabrications, not introduce new ones. Timeout raised in step with the
			// effort bump, matching Review's max-effort budget, and again to 60 min when the
			// prompt stopped capping the check at two or three sources: on the trial of
			// 2026-10-04, verify corrected eight claims this stage had passed.
			timeout: 3600000, // 60 min — fact-check reads every source via web + MCP
		});

		if (!(result.success && result.data)) {
			return result;
		}

		const data = {
			...result.data,
			verifiedClaims: result.data.verifiedClaims || [],
		};

		this.logger.log(`   - Verified ${data.verifiedClaims.length} claims`);
		this.logger.log(`   - Overall credibility: ${data.overallCredibility ?? 0}/10`);

		// Check quality gate
		if (data.overallCredibility < this.options.qualityThreshold) {
			this.logger.log(`   ❌ Credibility below threshold (${this.options.qualityThreshold})`);
			this.logger.log(`   Summary: ${data.summary}`);
			if (data.unverifiedClaims && data.unverifiedClaims.length > 0) {
				this.logger.log(`   Unverified claims (${data.unverifiedClaims.length}):`);
				for (const claim of data.unverifiedClaims) {
					this.logger.log(`     - ${claim.claim}: ${claim.reason}`);
				}
			}
			if (data.recommendations && data.recommendations.length > 0) {
				this.logger.log("   Recommendations:");
				for (const rec of data.recommendations) {
					this.logger.log(`     - ${rec}`);
				}
			}
			return {
				success: false,
				data,
				error: `Credibility score ${data.overallCredibility} below threshold ${this.options.qualityThreshold}`,
				duration: result.duration,
			};
		}

		return { ...result, data };
	}

	/**
	 * Revise research after a failing fact-check — a targeted correction pass,
	 * not a fresh research assignment. Reuses the research tools (web + MCP) so
	 * the model can actually verify replacements instead of guessing fixes.
	 */
	async runResearchRevision(
		research: ResearchOutput,
		factCheck: FactCheckOutput,
	): Promise<{ result: StageResult<ResearchOutput>; summary: string }> {
		const startTime = Date.now();

		const blocklist = formatBlockedDomainsPrompt(getBlockedDomains(loadDomainTracker()));

		const flaggedClaims =
			(factCheck.unverifiedClaims || [])
				.map((c) => `- CLAIM: ${c.claim}\n  PROBLEM: ${c.reason}`)
				.join("\n") || "(none)";
		const missingPerspectives =
			(factCheck.missingPerspectives || []).map((p) => `- ${p}`).join("\n") || "(none)";
		const recommendations =
			(factCheck.recommendations || []).map((r) => `- ${r}`).join("\n") || "(none)";

		const systemPrompt = `<original_research>
${JSON.stringify(research, null, 2)}
</original_research>

<fact_check_findings>
Overall credibility: ${factCheck.overallCredibility}/10 (must reach ${this.options.qualityThreshold}+)
Fact-checker's summary: ${factCheck.summary}

Flagged claims:
${flaggedClaims}

Missing perspectives:
${missingPerspectives}

Recommendations:
${recommendations}
</fact_check_findings>${blocklist}`;

		const mcpConfigPath = join(__dirname, "../../..", ".mcp.json");
		const result = await this.executeClaudeStage<ResearchOutput>({
			name: "Stage 1b: Research Revision",
			stage: "research",
			emoji: "🔧",
			promptFile: "research-reviser.md",
			systemPrompt,
			userContent: this.sourceDocsBlock(),
			allowedTools: RESEARCH_ALLOWED_TOOLS,
			mcpConfig: mcpConfigPath,
			schema: ResearchOutputSchema,
			jsonSchema: getResearchJsonSchema(),
			effort: "high",
			timeout: 1800000, // 30 min — same budget as research; fixes require real tool calls
		});

		return this.processResearchResult(result, startTime);
	}

	/**
	 * Run the authoring stage
	 */
	async runAuthoring(
		research: ResearchOutput,
		factCheck: FactCheckOutput,
		ideaBrief?: IdeaBrief,
	): Promise<StageResult<DraftOutput>> {
		let systemPrompt = "";

		if (ideaBrief) {
			const difficultyGuidance: Record<string, string> = {
				standard:
					"Accessible but never condescending. A well-read generalist should follow every argument. Define technical terms on first use.",
				challenging:
					"Assume readers know basic Islamic terminology (taqwa, fitna, tazkiya). Move quickly through fundamentals to reach the insight.",
				expert:
					"Write for specialists. Use technical vocabulary freely. The value is in the original synthesis, not in explaining established concepts.",
			};

			// ⚠️ Direction and requirements are split. Both used to arrive as one »angle« under
			// »creative compass, not handcuffs — deviate where the material demands it«, which
			// told the author that »INGEN RÖSTREKOMMENDATION« was negotiable.
			const { angle } = splitBriefRequirements(ideaBrief);
			systemPrompt += `## CREATIVE DIRECTION
Thesis and angle are your creative compass, not handcuffs — deviate where the material demands it. The HARD REQUIREMENTS further down are not direction: they are not negotiable.

**Working title** (improve it if you find something sharper): ${ideaBrief.title}

**Thesis:** ${ideaBrief.thesis}

**Angle:** ${angle}

**Register:** ${difficultyGuidance[ideaBrief.difficulty] ?? difficultyGuidance.standard}

The research below was gathered to support this angle.

`;
		}

		systemPrompt += `## DEVELOPED ANGLE
${research.summary}

## CONTEXT
You are writing for islam.se. The purpose is to promote Islamic thought intelligently to Swedish readers.

Key requirements:
- ONE clear thematic thread from start to finish
- Compelling subtitles that make readers want to continue
- Let quotes and passages earn their place
- Reference the Quran where relevant
- Let classical Islamic scholars shine
- Swedish/Western authors strengthen the Islamic stance — when the research has one that genuinely illuminates the argument, never as a checkbox
- Use markdown blockquotes and footnotes
- Write natural Swedish prose — avoid anglicisms like "i termer av", "adressera", "baserat på", calque constructions. Prefer Swedish idiom and rhythm (Axess/Respons register).${this.briefingNote()}`;

		// Format quotes with metadata so author can prioritize the strongest material
		if (research.quotes.length > 0) {
			const formatted = research.quotes
				.map((q) => {
					const text = q.textSv && q.textSv !== q.text ? q.textSv : q.text;
					const lang = q.textSv && q.textSv !== q.text ? " (arabic)" : "";
					return `- "${text}" — ${q.author}${q.source ? `, *${q.source}*` : ""}${lang}`;
				})
				.join("\n");
			systemPrompt += `\n\n## QUOTES\n${formatted}`;
		}

		if (research.quranReferences.length > 0) {
			systemPrompt += `\n\n${formatQuranReferences(research.quranReferences)}`;
		}

		// Format book passages with full text for weaving in
		if (research.bookPassages && research.bookPassages.length > 0) {
			const formatted = research.bookPassages
				.map((p) => `### ${p.bookTitle} — ${p.author}${passagePage(p)}\n${p.text}`)
				.join("\n\n---\n\n");
			systemPrompt += `\n\n## BOOK PASSAGES
Weave the strongest into your prose — quote directly when the original language is powerful, paraphrase for flow. Cite as footnotes (Author, *Work*, volume:page where the heading gives one, otherwise chapter/section). Never supply a page the heading does not give.

${formatted}`;
		}

		// Format web sources with key findings so author can weave insights into prose
		if (research.sources.length > 0) {
			const formatted = research.sources
				.map((s) => {
					let line = `- ${s.title}: ${s.url}`;
					if (s.keyFindings && s.keyFindings.length > 0) {
						line += `\n  Findings: ${s.keyFindings.join("; ")}`;
					}
					return line;
				})
				.join("\n");
			systemPrompt += `\n\n## WEB SOURCES (for footnotes)\n${formatted}`;
		}

		// ⚠️ What the fact-checker CONFIRMED, with how. Only the flags used to be passed on,
		// so the wording, edition numbers and URLs it had found were thrown away and the
		// author hedged claims that were verified (»the fact-checker had it from search but I
		// could not cite it«, pipeline-feedback 2026-08-23).
		const verified = factCheck.verifiedClaims.filter((c) => c.method || c.notes);
		if (verified.length > 0) {
			const formatted = verified
				.map(
					(c) =>
						`- ${c.claim}${c.method ? `\n  How: ${c.method}` : ""}${c.notes ? `\n  Notes: ${c.notes}` : ""}`,
				)
				.join("\n");
			systemPrompt += `\n\n## VERIFIED BY FACT-CHECK\nCite from here: this is what was confirmed, and against what.\n${formatted}`;
		}

		// Pass actionable guidance from fact-checker
		const guidance: string[] = [];
		if (factCheck.unverifiedClaims && factCheck.unverifiedClaims.length > 0) {
			guidance.push(
				"UNVERIFIED CLAIMS (do NOT use these without rewording or independent support):\n" +
					factCheck.unverifiedClaims.map((c) => `- ${c.claim}: ${c.reason}`).join("\n"),
			);
		}
		if (factCheck.missingPerspectives && factCheck.missingPerspectives.length > 0) {
			guidance.push(
				"MISSING PERSPECTIVES (consider addressing):\n" +
					factCheck.missingPerspectives.map((p) => `- ${p}`).join("\n"),
			);
		}
		if (factCheck.recommendations && factCheck.recommendations.length > 0) {
			guidance.push(
				"FACT-CHECKER RECOMMENDATIONS:\n" +
					factCheck.recommendations.map((r) => `- ${r}`).join("\n"),
			);
		}
		if (guidance.length > 0) {
			systemPrompt += `\n\n## FACT-CHECK GUIDANCE\n${guidance.join("\n\n")}`;
		}
		systemPrompt += `${this.recentTitlesSection()}${this.houseRules()}${this.requirementsBlock()}`;

		const result = await this.executeClaudeStage<DraftOutput>({
			name: "Stage 3: Authoring",
			stage: "authoring",
			emoji: "✍️ ",
			promptFile: "author.md",
			systemPrompt,
			userContent: [this.earlierBlock("author"), this.sourceDocsBlock()]
				.filter(Boolean)
				.join("\n\n"),
			allowedTools: ["Read"],
			markdownMode: {
				frontmatterSchema: DraftFrontmatterSchema,
				combine: (meta, body) =>
					({
						...meta,
						body,
						wordCount: body.split(/\s+/).filter((w) => w.length > 0).length,
					}) as DraftOutput,
			},
			// Back on "max" — deliberately, and with the timeout raised to match.
			// History: max was downshifted to xhigh after Opus-tier failed to converge
			// twice within a 45-min timeout. That was a timeout problem, not a quality
			// one: the stage was killed mid-thought, so we never learned what max writes.
			// 75 min gives it room the earlier attempts never had. If this times out
			// again, the finding is that Opus at max genuinely does not terminate on
			// this prompt — go back to xhigh and record that here rather than raising
			// the ceiling a third time.
			effort: "max",
			timeout: 4500000, // 75 min
		});

		if (!(result.success && result.data)) {
			return result;
		}

		const wordCount = result.data.wordCount ?? result.data.body.split(/\s+/).length;
		this.logger.log(`   - Draft complete: ${wordCount} words`);
		if (result.data.struggles) {
			this.logger.log(`   - Struggles: ${result.data.struggles.slice(0, 200)}`);
		}
		if (result.data.efficiencySuggestions) {
			this.logger.log(`   - Suggestions: ${result.data.efficiencySuggestions.slice(0, 200)}`);
		}

		return result;
	}

	/**
	 * Run the review stage
	 */
	async runReview(
		draft: DraftOutput,
		research: ResearchOutput,
		factCheck?: FactCheckOutput,
		ideaBrief?: IdeaBrief,
		previousReview?: ReviewOutput,
		/**
		 * `patch` is the essay pipeline and what reviewer.md asks for: the model returns edits
		 * and the code applies them. `rewrite` has the model return the whole text; it is the
		 * default when a caller swaps in its own review prompt, as the fördjupning producer
		 * does. `finalRead` marks the gate after verification and the language stages, and
		 * lists what verification settled.
		 */
		opts: { mode?: "rewrite" | "patch"; finalRead?: { settled: string[] } } = {},
	): Promise<StageResult<ReviewOutput>> {
		const patchMode = opts.mode
			? opts.mode === "patch"
			: !this.options.promptOverrides?.["reviewer.md"];
		let systemPrompt = "";

		if (opts.finalRead) {
			systemPrompt += `## FINAL READ
This is the last read before publication. Since the first review the text has been checked against its sources, polished and language-checked. Judge the text as it now stands and patch what is still wrong. Nothing reads the text after you, so keep your patches to what the text needs.

**Settled by the verification stage** (checked against the source; do not list these in \`toVerify\` again):
${opts.finalRead.settled.map((s) => `- ${s}`).join("\n") || "- (nothing was sent to verification)"}

`;
		}

		// ⚠️ A re-review used to open with »You previously scored this article X/10 … If they
		// are [resolved], the score should reflect the improvement. Do NOT re-discover the same
		// issues«, while grading its own rewrite. Twelve runs in a row then ended at 8.5–8.8
		// after one or two rounds, so the score carried no information. The earlier issues
		// are still listed, to be checked; the earlier score is not.
		if (previousReview) {
			systemPrompt += `## REVISION CONTEXT
This text has been revised after an earlier review. Review it as you would any submission: score the text in front of you, not the improvement, and new problems count as much as old ones.

**Issues the earlier review flagged** (check each; list any that remain in \`issues\`):
${(previousReview.issues || []).map((i) => `- ${i}`).join("\n") || "- (none listed)"}

`;
			if ((previousReview.forEditor ?? []).length > 0) {
				systemPrompt += `**Left for the editor by the earlier review.** The text has been through verification and editing since. Repeat in \`forEditor\` each one that still applies, in your own words, and leave out what has been settled:
${(previousReview.forEditor ?? []).map((i) => `- ${i}`).join("\n")}

`;
			}
		}

		if (ideaBrief) {
			const { angle } = splitBriefRequirements(ideaBrief);
			systemPrompt += `## INTENDED DIRECTION
Assess whether the draft delivers on this promise — or drifted into a generic overview.

**Thesis:** ${ideaBrief.thesis}
**Angle:** ${angle}

`;
		}

		systemPrompt += `## ARTICLE TO REVIEW

**Title:** ${draft.title}

${draft.body}

## DESCRIPTION
${draft.description?.trim() || "(none — the author wrote no description; write one in `description`)"}`;

		// ⚠️ Label what the code verified. Every quote used to arrive under »VERIFIED QUOTES«,
		// including the half whose ids were labels research made up for web and primary texts.
		if (research.quotes.length > 0) {
			const quoteList = research.quotes
				.map((q) => {
					const status = isDatabaseQuoteId(q.id)
						? "database"
						: "web/primary, checked by fact-check";
					const sv = q.textSv && q.textSv !== q.text ? ` / sv: "${q.textSv}"` : "";
					return `- [${q.id}, ${status}] ${q.author}${q.source ? `, *${q.source}*` : ""}: "${q.text}"${sv}`;
				})
				.join("\n");
			systemPrompt += `\n\n## RESEARCH QUOTES\nCross-reference the article's blockquotes against this list, the book passages and the briefing (both in the user message). Flag any quoted passage found in none of them — it may be invented.\n\n${quoteList}`;
		}

		// The fördjupning producer calls this stage with research that never passed through
		// attachBernstrom(), so the lookup happens here too (a local database read).
		if (research.quranReferences.length > 0) {
			systemPrompt += `\n\n${formatQuranReferences(this.withBernstrom(research.quranReferences), "reviewer")}`;
		}

		systemPrompt += formatFactCheckFlags(factCheck);

		systemPrompt += `

<language_quality>
This article is for a Swedish publication. Watch for and fix anglicisms — English-influenced phrasing that sounds unnatural in Swedish:
- "i termer av" → "när det gäller", "vad gäller"
- "ta plats" (take place) → "äga rum", "ske"
- "göra en skillnad" → "göra skillnad"
- "vid slutet av dagen" → "i slutändan", "ytterst"
- "det är upp till" → "det ankommer på", "det beror på"
- "adressera" (address an issue) → "ta upp", "behandla"
- "nyckel-" as prefix (key insight) → "avgörande", "central"
- "baserat på" → "grundat på", "utifrån"
- "implementera" → "genomföra", "tillämpa"
- Stiff calque constructions: rephrase for natural Swedish prose rhythm
- Prefer Swedish conjunctions and flow over English sentence patterns
If the draft has anglicisms, fix them ${patchMode ? "with patches" : "in the revised article"}.
</language_quality>${this.recentTitlesSection()}${this.houseRules()}${this.requirementsBlock()}`;

		// ⚠️ The reviewer never saw the briefing or the book passages, and said so: on »Sorgen
		// vid Nilen« it left news quotes »unconfirmed against … the briefing«. They go in the
		// user message, where the other stages carry bulk material.
		const bookPassages =
			research.bookPassages.length > 0
				? `<book_passages>\n${research.bookPassages
						.map((p) => `### ${p.bookTitle} — ${p.author}${passagePage(p)} [${p.id}]\n${p.text}`)
						.join("\n\n---\n\n")}\n</book_passages>`
				: "";

		const userContent = [bookPassages, this.sourceDocsBlock()].filter(Boolean).join("\n\n");
		if (patchMode) {
			return this.reviewByPatch(draft.body, systemPrompt, userContent, !!opts.finalRead);
		}

		const result = await this.executeClaudeStage<ReviewOutput>({
			name: "Stage 4: Review",
			stage: "review",
			emoji: "👁️ ",
			promptFile: "reviewer.md",
			systemPrompt,
			userContent,
			markdownMode: {
				frontmatterSchema: ReviewFrontmatterSchema,
				combine: (meta, body) =>
					({
						...meta,
						revisedText: body || null,
					}) as ReviewOutput,
			},
			// Raised to "max" alongside Authoring. Review is the last stage that can
			// restructure the argument, and its score drives the revision loop — a
			// blunt reviewer that hands out an 8.5 skips revision entirely, so depth
			// here buys more than in the prose passes downstream.
			// Timeout 45 min rather than 30: a Review timeout is FATAL (produce()
			// returns with no article), unlike the non-fatal passes after it, so this
			// stage gets headroom the others don't need.
			effort: "max",
			timeout: 2700000, // 45 min — full rewrite + language audit at max
		});

		if (!(result.success && result.data)) {
			return result;
		}

		this.logger.log(`   - Quality Score: ${result.data.finalScore ?? 0}/10`);
		this.logger.log(`   - VERDICT: ${(result.data.verdict || "unknown").toUpperCase()}`);

		return result;
	}

	/**
	 * The essay review as patches. The reviewer used to return the whole essay, so every
	 * round regenerated 3 000 words at max effort and a non-cosmetic rewrite then had to be
	 * reviewed again: three rounds on four of five runs, 35 % of the pipeline's time, for
	 * rounds two and three that changed 0.5–4 % of the words. The model now lists its
	 * edits; an edit it does not list cannot ship, and each one is in the log.
	 */
	private async reviewByPatch(
		text: string,
		systemPrompt: string,
		userContent: string,
		finalRead: boolean,
	): Promise<StageResult<ReviewOutput>> {
		const stage = await this.executeClaudeStage<ReviewPatch>({
			name: finalRead ? "Final read" : "Stage 4: Review",
			stage: "review",
			emoji: "👁️ ",
			promptFile: "reviewer.md",
			systemPrompt,
			userContent,
			schema: ReviewPatchSchema,
			jsonSchema: getReviewPatchJsonSchema(),
			// max: this is the stage that can still restructure the argument, and its score is
			// the gate. Timeout 45 min: a review failure is fatal, unlike the passes around it.
			effort: "max",
			timeout: 2700000,
		});
		if (!(stage.success && stage.data)) {
			return {
				success: false,
				error: stage.error ?? "Review failed",
				output: stage.success ? undefined : stage.output,
				duration: stage.duration,
				meta: stage.meta,
			};
		}

		const { patches, ...review } = stage.data;
		// sourceEdits: the reviewer is the gate, so it may restore a quotation or cut a note.
		const applied = applyTextPatches(text, patches, { sourceEdits: true });
		const notes = renumberFootnotes(applied.body);
		this.logger.log(`   - Quality Score: ${review.finalScore}/10`);
		this.logger.log(`   - VERDICT: ${review.verdict.toUpperCase()}`);
		this.logger.log(
			`   - ${applied.applied.length} ändring(ar) införda, ${applied.rejected.length} avvisade, ${review.toVerify.length} att verifiera`,
		);
		for (const p of applied.applied) this.logger.log(`     ✍️  ${describePatch(p, 160)}`);
		if (notes.dropped.length > 0 || notes.renumbered > 0) {
			this.logger.log(
				`     Fotnoter: ${notes.renumbered} omnumrerade, ${notes.dropped.length} utan markör borttagna`,
			);
		}
		for (const id of notes.dangling) {
			this.noteOpenIssue("Fotnoter", `Markören [^${id}] saknar not.`);
		}

		return {
			success: true,
			data: {
				...review,
				revisedText: notes.body,
				patches: applied.applied,
				rejected: applied.rejected,
			},
			duration: stage.duration,
			meta: stage.meta,
		};
	}

	/**
	 * Verify — settle, with tools, what the tool-less reviewer could only flag.
	 *
	 * ⚠️ WHY THIS STAGE EXISTS. Every run ended with three to five reviewer items and three
	 * to nine fact-check claims that nobody had checked, handed to the editor. The reviewer
	 * re-raised the same ones round after round because it had no way to look them up: on
	 * »Bokmässan« (2026-09-27) three rounds asked for one primary source and the run failed.
	 * And where it cut instead, it cut true details the editor then restored. The time those
	 * rounds took is spent here, reading the sources.
	 */
	async runVerify(
		articleBody: string,
		items: VerifyItem[],
		research: ResearchOutput,
	): Promise<StageResult<VerifyOutput>> {
		if (items.length === 0) {
			return {
				success: true,
				data: { items: [], summary: "Inget att verifiera.", body: articleBody },
				duration: 0,
			};
		}

		const itemList = items
			.map(
				(item, i) =>
					`${i + 1}. [${item.origin}] ${item.claim}\n   Sentence: ${item.sentence}\n   Doubt: ${item.reason}`,
			)
			.join("\n\n");
		const sources = research.sources.map((s) => `- ${s.title} — ${s.url}`).join("\n");
		const passages = research.bookPassages
			.map((p) => `- [${p.id}] ${p.bookTitle} — ${p.author}${passagePage(p)}`)
			.join("\n");
		const userContent = [
			`<article>\n${articleBody}\n</article>`,
			`<items>\n${itemList}\n</items>`,
			sources ? `<research_sources>\n${sources}\n</research_sources>` : "",
			passages ? `<research_book_passages>\n${passages}\n</research_book_passages>` : "",
			this.sourceDocsBlock(),
		]
			.filter(Boolean)
			.join("\n\n");

		const stage = await this.executeClaudeStage<VerifyFindings>({
			name: "Verify",
			stage: "review",
			emoji: "🔎",
			promptFile: "verify.md",
			systemPrompt: `You verify open factual items in a Swedish essay for islam.se against primary sources.${this.houseRules()}${this.requirementsBlock()}`,
			userContent,
			allowedTools: [
				"WebSearch",
				"WebFetch",
				"mcp__quotes__search_books",
				"mcp__quotes__get_passage_context",
				"mcp__quotes__search_text",
				"mcp__quotes__search_quran",
				"mcp__quotes__get_quote_by_id",
				"mcp__quotes__search_quotes",
				"mcp__quotes__search_by_filter",
				"mcp__quotes__fetch_wikipedia",
			],
			mcpConfig: join(__dirname, "../../..", ".mcp.json"),
			schema: VerifyOutputSchema,
			jsonSchema: getVerifyJsonSchema(),
			// max, like fact-check: pure verification, and depth can only catch more.
			effort: "max",
			timeout: 2700000, // 45 min — this is where the old review rounds' time goes
		});
		if (!(stage.success && stage.data)) {
			return {
				success: false,
				error: stage.error ?? "Verify failed",
				duration: stage.duration,
				meta: stage.meta,
			};
		}

		const patches = stage.data.items.flatMap((item) => (item.patch ? [item.patch] : []));
		const applied = applyTextPatches(articleBody, patches, { sourceEdits: true });
		const notes = renumberFootnotes(applied.body);
		return {
			success: true,
			data: { ...stage.data, body: notes.body, rejected: applied.rejected },
			duration: stage.duration,
			meta: stage.meta,
		};
	}

	/**
	 * Run the polish stage — final prose refinement by a Swedish literary master matched to content
	 */
	async runPolish(articleBody: string): Promise<StageResult<PolishOutput>> {
		this.logger.log("   🖊️  Polish: prose rhythm, momentum, voice");

		const systemPrompt = `Du är en erfaren svensk essäist och redaktör. Du läser den här texten som en krävande läsare, inte som en redigerare.${this.houseRules()}${this.requirementsBlock()}`;

		return this.executeClaudeStage<PolishOutput>({
			name: "Stage 5: Polish",
			stage: "polish",
			emoji: "🖊️ ",
			promptFile: "polish.md",
			systemPrompt,
			userContent: `## TEXTEN\n\n${articleBody}`,
			markdownMode: {
				frontmatterSchema: PolishFrontmatterSchema,
				combine: (meta) => {
					const m = meta as Omit<PolishOutput, "body" | "edits" | "rejected">;
					const applied = applyTextPatches(articleBody, m.patches, {
						maxApplied: 15,
						vet: vetMisspelling,
					});
					return {
						...m,
						body: applied.body,
						edits: applied.applied
							.map((x) => `${describePatch(x)}${x.reason ? ` — ${x.reason}` : ""}`)
							.join("\n"),
						rejected: applied.rejected,
					};
				},
			},
			effort: "high",
		});
	}

	/**
	 * Consolidated Swedish-language pass — the article's only language review.
	 * Folds in three formerly-separate stages in one pass:
	 *  - Swedish voice: anglicisms, English rhetoric, repetition, overexplanation, rhythm
	 *  - Word-level (former Language stage): non-existent words, gender, prepositions
	 *  - Measured AI-patterns (former Detox stage): "inte X utan Y", em-dash overflow, etc.
	 */
	async runSwedishVoice(
		articleBody: string,
		meta?: { title?: string; description?: string },
	): Promise<StageResult<SwedishVoiceOutput>> {
		this.logger.log("   🇸🇪 Swedish voice: anglicisms, word-level, measured AI-patterns");

		let metaSection = "";
		if (meta?.title || meta?.description) {
			metaSection = "\n\n## TITEL OCH INGRESS\n";
			if (meta.title) metaSection += `**Titel:** ${meta.title}\n`;
			if (meta.description) metaSection += `**Ingress:** ${meta.description}\n`;
		}

		const systemPrompt = `Du granskar en publicerad artikel för islam.se. Detta är artikelns enda språkgranskning — åtgärda i ett svep det som avslöjar att texten tänkts på engelska, ord som inte är naturlig svenska, och de mätbara AI-mönster som prompten räknar.${metaSection}${meta?.title ? this.recentTitlesSection() : ""}${this.houseRules()}${this.requirementsBlock()}`;

		const isMetaLocation = (location: string) => /^(titel|ingress)\b/i.test(location.trim());

		return this.executeClaudeStage<SwedishVoiceOutput>({
			name: "Swedish Voice",
			stage: "polish", // reuse polish stage type for streaming
			emoji: "🇸🇪",
			promptFile: "swedish-voice.md",
			systemPrompt,
			userContent: [
				editorEditsBlock(join(findDataDir(), "pipeline-feedback.jsonl")),
				`## TEXTEN\n\n${articleBody}`,
			]
				.filter(Boolean)
				.join("\n\n"),
			markdownMode: {
				frontmatterSchema: SwedishVoiceFrontmatterSchema,
				combine: (meta) => {
					const m = meta as Omit<SwedishVoiceOutput, "body" | "rejected">;
					const bodyIssues = m.issuesFound.filter((i) => !isMetaLocation(i.location));
					// A heading typo is this stage's to fix; the other stages may not touch headings.
					const applied = applyTextPatches(
						articleBody,
						bodyIssues.map((i) => ({
							original: i.original,
							replacement: i.correction,
							reason: i.reason,
						})),
						{ protectHeadings: false, vet: vetMisspelling },
					);
					const kept = new Set(applied.applied.map((a) => a.original));
					const appliedIssues = bodyIssues.filter((i) => kept.has(i.original));
					return {
						...m,
						issuesFound: [
							...m.issuesFound.filter((i) => isMetaLocation(i.location)),
							...appliedIssues,
						],
						body: applied.body,
						rejected: applied.rejected,
					};
				},
			},
			// xhigh and 30 min: the stage read a 3 000-word essay in two or three minutes, and
			// the Swedish is what the editor still corrects by hand after publication. It is
			// the one place where a slower read is the whole point.
			effort: "xhigh",
			timeout: 1800000,
			maxRetries: 3,
		});
	}

	async runGround(articleBody: string): Promise<StageResult<GroundOutput>> {
		this.logger.log("   🌱 Ground: anchoring abstract concepts in concrete human moments");

		const systemPrompt = `Du är en svensk essäredaktör specialiserad på att förankra abstrakt filosofi i konkreta mänskliga ögonblick. Du lägger till EN mening där ett begrepp svävar utan förankring — ingenting annat.${this.houseRules()}${this.requirementsBlock()}`;

		return this.executeClaudeStage<GroundOutput>({
			name: "Ground",
			stage: "polish",
			emoji: "🌱",
			promptFile: "ground.md",
			systemPrompt,
			userContent: `Här är texten att granska:\n\n${articleBody}`,
			markdownMode: {
				frontmatterSchema: GroundFrontmatterSchema,
				combine: (meta) => {
					const m = meta as Omit<GroundOutput, "body" | "rejected">;
					const patches = m.changes.map((c) => ({
						original: c.original,
						replacement: `${c.original.trimEnd()} ${c.addition.trim()}`,
						reason: c.why,
					}));
					const applied = applyTextPatches(articleBody, patches, {
						maxApplied: GROUND_MAX_ADDITIONS,
						vet: (patch) => {
							const addition = patch.replacement.slice(patch.original.trimEnd().length).trim();
							return GROUND_FORMULA.test(addition)
								? `formula opener »${addition.split(/\s+/).slice(0, 3).join(" ")} …«`
								: undefined;
						},
					});
					const kept = new Set(applied.applied.map((a) => a.original));
					const changes = m.changes.filter((c) => kept.has(c.original));
					return {
						...m,
						verdict: changes.length > 0 ? "grounded" : "clean",
						changes,
						changesCount: changes.length,
						body: applied.body,
						rejected: applied.rejected,
					};
				},
			},
			effort: "high",
			timeout: 900000,
		});
	}

	/**
	 * Run the deepen stage — find where the essay illustrates rather than argues,
	 * and add the missing reasoning steps. 1–2 surgical changes per article.
	 */
	async runDeepen(articleBody: string): Promise<StageResult<DeepenOutput>> {
		this.logger.log("   🔬 Deepen: finding illustration where argumentation is needed");

		const systemPrompt =
			"Du är en filosof och argumentationsanalytiker. Du söker avsnitt som illustrerar sin tes istället för att argumentera för den — och lägger till det saknade resonemangssteget.";

		const result = await this.executeClaudeStage<DeepenOutput>({
			name: "Deepen",
			stage: "polish",
			emoji: "🔬",
			promptFile: "deepen.md",
			systemPrompt: `${systemPrompt}${this.houseRules()}${this.requirementsBlock()}`,
			userContent: `## TEXTEN\n\n${articleBody}`,
			markdownMode: {
				frontmatterSchema: DeepenFrontmatterSchema,
				combine: (meta) => {
					const m = meta as Omit<DeepenOutput, "body" | "rejected">;
					const applied = applyTextPatches(
						articleBody,
						m.changes.map((c) => ({
							original: c.before,
							replacement: c.after,
							reason: c.reasoning,
						})),
						{ maxApplied: 2 },
					);
					const kept = new Set(applied.applied.map((a) => a.original));
					const changes = m.changes.filter((c) => kept.has(c.before));
					return {
						...m,
						verdict: changes.length > 0 ? "deepened" : "clean",
						changes,
						changesCount: changes.length,
						body: applied.body,
						rejected: applied.rejected,
					};
				},
			},
			// xhigh, chosen when Deepen ran after the review gate with nothing downstream to
			// check what it wrote. In the essay pipeline the review and verify stages now
			// read its additions; the standalone `deepen` command still has no gate after
			// it, so the level stays until a measurement says otherwise.
			// Timeout 20 min, raised with the effort: this stage is non-fatal, so a
			// timeout degrades silently to "no deepening" with nothing in the log to
			// say the essay lost a pass.
			effort: "xhigh",
			timeout: 1200000, // 20 min — argument analysis at xhigh
		});

		return result;
	}

	/**
	 * Run the figures stage — decide whether the finished essay has earned a chart or a
	 * table, and if so, splice one in.
	 *
	 * ⚠️ THIS STAGE RUNS AFTER EVERY GATE. Nothing downstream reads what it writes, which is
	 * the position ground.md's Jokkmokk note describes — and a figure is worse there than a
	 * sentence, because a reader takes a bar as a fact with no hedge. Three things follow:
	 *
	 *   1. A deterministic pre-filter decides whether to call the model AT ALL. On a corpus
	 *      measurement, exactly one essay in 57 has a chartable paragraph, so the common path
	 *      must be free. No candidates and no verified datasets → no call.
	 *   2. The model returns a PATCH, never a body. Twelve lines of change should not carry a
	 *      3 000-word drift surface.
	 *   3. Everything it returns is re-checked by figure-guard.ts and by the gates the BUILD
	 *      runs. A failure drops the figure and keeps the essay, which is always survivable:
	 *      the essay was publishable without one.
	 */
	async runFigures(
		articleBody: string,
		datasets: NonNullable<ResearchOutput["datasets"]>,
	): Promise<StageResult<FiguresOutput>> {
		const repoRoot = join(findDataDir(), "..");
		const candidates = findFigureCandidates(articleBody, repoRoot);

		if (candidates.chart.length === 0 && candidates.table.length === 0 && datasets.length === 0) {
			// The common case, and it costs nothing.
			this.logger.log("   📊 Figurer: inga kandidater och inga dataset — hoppar över");
			return {
				success: true,
				data: {
					verdict: "none",
					reasoning: "Inga figurkandidater i texten och inga godkända dataset.",
					figure: null,
					summary: "Ingen figur (inget att pröva)",
				},
				duration: 0,
			};
		}

		this.logger.log(
			`   📊 Figurer: ${candidates.chart.length} diagram-, ${candidates.table.length} tabellkandidat(er), ${datasets.length} dataset`,
		);

		const systemPrompt =
			"Du är bildredaktör på en litterär tidskrift. Du säger nej till nästan varje figur, och ja bara när figuren bär ett resonemang som prosan inte redan bär.";

		const result = await this.executeClaudeStage<FiguresOutput>({
			name: "Figures",
			stage: "figures",
			emoji: "📊",
			promptFile: "figures.md",
			systemPrompt,
			userContent: [
				`## ESSÄN\n\n${articleBody}`,
				candidates.chart.length > 0
					? `## KANDIDATSTYCKEN MED JÄMFÖRBARA TAL\n\n${JSON.stringify(candidates.chart, null, 1)}`
					: "",
				candidates.table.length > 0
					? `## KANDIDATSTYCKEN MED PARALLELLA STÅNDPUNKTER\n\n${JSON.stringify(candidates.table, null, 1)}`
					: "",
				datasets.length > 0
					? `## GODKÄNDA DATASET (faktagranskade)\n\n${JSON.stringify(datasets, null, 1)}`
					: "",
			]
				.filter(Boolean)
				.join("\n\n"),
			markdownMode: {
				frontmatterSchema: FiguresFrontmatterSchema,
				// The body is discarded on purpose: this stage returns a patch, not an essay.
				combine: (meta) => meta as unknown as FiguresOutput,
			},
			// high, not max. The stage's job is judgement about ONE inclusion, and every
			// number it may use is fixed in advance — ambition buys nothing here and the
			// deepen.md note explains what max costs on a stage with no grader downstream.
			effort: "high",
			timeout: 900000, // 15 min
		});

		return result;
	}

	/**
	 * Run the eval-correction stage — fix the concrete issues flagged by the
	 * deterministic prose evaluator (latinisms, anglicisms, AI-tic overuse,
	 * em-dashes, footnote integrity, etc.). The machine report is passed verbatim
	 * so Claude fixes exactly what was measured, not a vague impression.
	 */
	async runEvalCorrection(
		articleBody: string,
		evalReport: string,
	): Promise<StageResult<EvalCorrectionOutput>> {
		this.logger.log("   📋 Eval correction: fixing flagged prose issues");

		const systemPrompt =
			"Du åtgärdar exakt de språkproblem en automatisk granskare har flaggat i en färdig svensk artikel. Du är inte en allmän stilredaktör — du rättar bara de ord och formuleringar rapporten pekar ut, och bevarar varje meningens innebörd. Rör aldrig blockcitat, inline-citat, fotnotskällor, rubriker eller argumentationsriktning.";

		const result = await this.executeClaudeStage<EvalCorrectionOutput>({
			name: "Eval Correction",
			stage: "polish",
			emoji: "📋",
			promptFile: "eval-correction.md",
			systemPrompt,
			userContent: `## Granskningsrapport (åtgärda dessa problem)\n\n${evalReport}\n\n## Texten att åtgärda\n\n${articleBody}`,
			markdownMode: {
				frontmatterSchema: EvalCorrectionFrontmatterSchema,
				combine: (meta, body) =>
					({
						...meta,
						body,
					}) as EvalCorrectionOutput,
			},
			effort: "high",
			timeout: 1200000, // 20 min
		});

		return result;
	}

	/**
	 * Give the finished essay to a second model for a deliberately narrow audit.
	 * Codex may propose exact replacements, but cannot edit files or rewrite the
	 * article wholesale; deterministic guards decide which patches are admissible.
	 */
	async runCodexTicAudit(
		articleBody: string,
		evalReport: string,
	): Promise<StageResult<CodexTicAudit>> {
		this.logger.log("   🔎 Codex: independent AI-tic audit");
		return this.codexAuditor.run({
			article: articleBody,
			evalReport,
			adapterPromptPath: join(this.promptsDir, "codex-tic-audit.md"),
			definitionPaths: [
				join(this.promptsDir, "house-rules.md"),
				join(this.promptsDir, "swedish-voice.md"),
				join(this.promptsDir, "eval-correction.md"),
			],
			schemaPath: join(this.promptsDir, "codex-tic-audit.schema.json"),
			repoRoot: join(findDataDir(), ".."),
		});
	}

	/**
	 * Publish article and update idea status
	 */
	private publishArticle(
		outputDir: string,
		draft: { title: string; description?: string },
		qualityScore: number,
		finalWordCount: number,
		ideaContext?: IdeaContext,
	): string | undefined {
		// Derive slug from final title, not the working topic slug
		const articleSlug = slugify(draft.title);

		// Publish to web-accessible directory
		try {
			const publisher = new ArticlePublisher();
			publisher.publish(outputDir, articleSlug, {
				title: draft.title,
				description: draft.description,
				wordCount: finalWordCount,
				qualityScore,
			});
			this.logger.log(`   📤 Published to data/articles/${articleSlug}.md`);
		} catch (publishError) {
			this.logger.warn(`   ⚠️  Failed to publish article: ${publishError}`);
			return undefined;
		}

		// Update idea status if context provided
		if (ideaContext) {
			try {
				const ideationService = new IdeationService({
					outputDir: this.options.outputDir,
				});
				ideationService.updateIdeaStatus(ideaContext.topicSlug, ideaContext.ideaId, {
					status: "done",
					producedAt: new Date().toISOString(),
					articleSlug,
				});
				this.logger.log(`   ✓ Marked idea #${ideaContext.ideaId} as done`);
			} catch (statusError) {
				this.logger.warn(`   ⚠️  Failed to update idea status: ${statusError}`);
			}
		}

		return articleSlug;
	}

	/**
	 * Everything publishing writes: the essay in data/articles, the sources' record in the
	 * domain tracker, and the run's line in the feedback log. One path for a run that
	 * publishes itself and for a trial run published afterwards (see publishRun).
	 */
	private recordPublication(
		record: PublicationRecord,
		ideaContext?: IdeaContext,
	): string | undefined {
		const publishedSlug = this.publishArticle(
			record.outputDir,
			{ title: record.title, description: record.description },
			record.qualityScore,
			record.wordCount,
			ideaContext,
		);

		// Record domain quality for published articles
		if (publishedSlug && record.sourceUrls.length > 0) {
			try {
				const tracker = loadDomainTracker();
				recordPublishedArticle(tracker, record.sourceUrls, record.qualityScore);
				saveDomainTracker(tracker);
			} catch (e) {
				this.logger.warn(`   ⚠️  Failed to record domain quality: ${e}`);
			}
		}

		// Persist the author's struggles/suggestions + eval scores to a sidecar
		// log. The published frontmatter keeps only 7 fields, so these otherwise
		// vanish at publish — this JSONL is the durable record for mining what
		// the pipeline finds hard and whether the eval pass is helping.
		try {
			const entry = {
				producedAt: record.producedAt,
				slug: publishedSlug ?? slugify(record.topic),
				topic: record.topic,
				outputDir: record.outputDir,
				qualityScore: record.qualityScore,
				reviewRounds: record.reviewRounds,
				wordCount: record.wordCount,
				revisionCount: record.revisionCount,
				evaluation: record.evaluation,
				models: record.models,
				openIssues: record.openIssues,
				reviewerIssues: record.reviewerIssues,
				struggles: record.struggles,
				efficiencySuggestions: record.efficiencySuggestions,
			};
			appendFileSync(
				join(findDataDir(), "pipeline-feedback.jsonl"),
				`${JSON.stringify(entry)}\n`,
				"utf-8",
			);
		} catch (e) {
			this.logger.warn(`   ⚠️  Failed to record pipeline feedback: ${e}`);
		}
		return publishedSlug;
	}

	/**
	 * Publish a finished trial run exactly as its final.md stands.
	 *
	 * Nothing is produced or re-read by a model here. A run that failed the final read has
	 * no final.md and is refused, and an essay already standing at the slug is not
	 * overwritten unless `force` says so: the one in data/articles may carry hand edits.
	 */
	publishRun(outputDir: string, options: { force?: boolean } = {}): string {
		const record = publicationFromRun(outputDir);
		const target = publicationTarget(record, join(findDataDir(), "articles"));
		if (target.exists && !options.force) {
			throw new Error(
				`${target.path} finns redan. Den kan vara redigerad för hand; kör med --force för att skriva över den.`,
			);
		}
		this.logFile = join(outputDir, "run.log");
		this.logger.log(
			`\n══ ${new Date().toISOString()} — publicerar »${record.title}« ur provkörningen`,
		);
		const slug = this.recordPublication(record);
		this.logFile = undefined;
		if (!slug) throw new Error(`Publiceringen av »${record.title}« misslyckades; se run.log.`);
		return slug;
	}

	/**
	 * Knut Bernström's wording for each Quran reference, looked up in quran.db. The author is
	 * told to quote this and nothing else (see formatQuranReferences).
	 */
	private attachBernstrom(research: ResearchOutput): ResearchOutput {
		const quranReferences = this.withBernstrom(research.quranReferences);
		const found = quranReferences.filter((r) => r.bernstrom).length;
		if (quranReferences.length > 0) {
			this.logger.log(
				`   - Bernström: ${found}/${quranReferences.length} koranhänvisningar har husets lydelse`,
			);
		}
		return { ...research, quranReferences };
	}

	private withBernstrom(
		refs: ResearchOutput["quranReferences"],
	): ResearchOutput["quranReferences"] {
		return refs.map((ref) => {
			if (ref.bernstrom) return ref;
			const key = ref.verseKey ?? this.verseKeyFromName(ref.surah, ref.ayah);
			const parsed = key?.match(/^(\d{1,3}):(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?$/);
			if (!(key && parsed)) return ref;
			const surah = Number(parsed[1]);
			const from = Number(parsed[2]);
			const to = parsed[3] ? Number(parsed[3]) : from;
			let bernstrom: string | null = null;
			try {
				bernstrom = getBernstromRange(surah, from, to);
			} catch {
				bernstrom = null;
			}
			if (!bernstrom) return { ...ref, verseKey: key };
			return { ...ref, verseKey: key, bernstrom };
		});
	}

	private verseKeyFromName(surah: string, ayah: string): string | undefined {
		let number: number | null = null;
		try {
			number = resolveSurahNumber(surah);
		} catch {
			number = null;
		}
		const range = ayah.replace(/[–—]/g, "-").replace(/\s+/g, "");
		if (!(number && /^\d{1,3}(?:-\d{1,3})?$/.test(range))) return undefined;
		return `${number}:${range}`;
	}

	/**
	 * Run scripts/check-quran-quotes.py on the finished text. Returns one line per
	 * blockquote that does not match Bernström, or null when the check could not run.
	 */
	private checkQuranQuotes(text: string, outputDir: string): string[] | null {
		const script = join(findDataDir(), "..", "scripts", "check-quran-quotes.py");
		if (!existsSync(script)) return null;
		const input = join(outputDir, "quran-check-input.md");
		saveOutput(outputDir, "quran-check-input.md", text);
		for (const python of ["python3", "python"]) {
			const run = spawnSync(python, [script, input], { encoding: "utf-8", timeout: 120_000 });
			if (run.error) continue;
			const lines = run.stdout.split("\n");
			const findings: string[] = [];
			lines.forEach((line, i) => {
				if (!/^\s+(⛔|\?)\s/.test(line)) return;
				const detail = lines
					.slice(i + 1, i + 3)
					.filter((l) => /^\s{4,}\S/.test(l))
					.map((l) => l.trim());
				findings.push([line.trim(), ...detail].join(" | "));
			});
			return findings;
		}
		return null;
	}

	/**
	 * Run the complete content production pipeline
	 * @param topic - The article topic
	 * @param ideaContext - Optional context linking to source idea for status tracking
	 */
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: multi-stage pipeline orchestrator
	async produce(
		topic: string,
		ideaContext?: IdeaContext,
		ideaBrief?: IdeaBrief,
		options?: { resume?: boolean },
	): Promise<ProductionResult> {
		const startTime = Date.now();
		const topicSlug = slugify(topic);
		const outputDir = this.ensureOutputDir(topicSlug);
		const resume = options?.resume ?? false;

		// ⚠️ Every run writes its own log. Two of sixteen run directories had one, because
		// only runs launched with a manual `tee` kept theirs — and the log was the only
		// record of the first review round's score.
		this.logFile = join(outputDir, "run.log");
		this.logger.log(`\n══ ${new Date().toISOString()} — ${topic}${resume ? " (resume)" : ""}`);
		this.stageRuns = [];
		this.runDir = outputDir;
		this.openIssues = [];
		const brief = ideaBrief ? splitBriefRequirements(ideaBrief) : undefined;
		this.requirements = brief?.requirements;
		if (this.requirements) {
			this.logger.log(
				`   - Briefens hårda krav (${this.requirements.length} tecken) går till varje steg som skriver`,
			);
		}

		const result: ProductionResult = {
			success: false,
			topic,
			outputDir,
			stages: {},
		};

		// Save idea brief for audit trail
		if (ideaBrief) {
			saveOutput(outputDir, "idea-brief.json", ideaBrief);
		}

		// Stage 1: Research
		let researchResult: StageResult<ResearchOutput>;
		const cachedResearch = resume ? loadOutput<ResearchOutput>(outputDir, "research.json") : null;

		// The earlier essays this one builds on. Research and the author both read them, so
		// a resumed run goes without only when both of those are already on disk.
		this.earlier = null;
		const pastAuthoring =
			!!cachedResearch &&
			ResearchOutputSchema.safeParse(cachedResearch).success &&
			loadOutput<DraftOutput>(outputDir, "draft-meta.json") !== null;
		if (!pastAuthoring) {
			this.earlier = await this.earlierEssaysForRun(
				this.ideaText(topic, ideaBrief && { ...ideaBrief, angle: brief?.angle ?? ideaBrief.angle }),
				outputDir,
				resume,
			);
		}

		if (cachedResearch && ResearchOutputSchema.safeParse(cachedResearch).success) {
			this.logger.log("📚 Stage 1: Research — loaded from checkpoint");
			const enriched = this.attachBernstrom(cachedResearch);
			researchResult = { success: true, data: enriched, duration: 0 };
			trackResearchReferences(this.references, enriched);
			this.options.onStageChange?.({
				stage: "research",
				status: "complete",
				duration: 0,
				summary: `${enriched.sources.length} sources, ${enriched.quotes.length} quotes (cached)`,
			});
		} else {
			this.options.onStageChange?.({ stage: "research", status: "running" });
			const research = ideaBrief
				? await this.runResearchFromIdea({
						thesis: ideaBrief.thesis,
						angle: brief?.angle ?? ideaBrief.angle,
						keywords: ideaBrief.keywords,
						seedQuotes: ideaBrief.seedQuotes,
					})
				: await this.runResearch(topic);
			researchResult = research.result;
			if (!(researchResult.success && researchResult.data)) {
				this.options.onStageChange?.({
					stage: "research",
					status: "failed",
					duration: researchResult.duration,
					error: researchResult.error,
				});
				result.stages.research = researchResult;
				result.totalDuration = Date.now() - startTime;
				return result;
			}
			researchResult = { ...researchResult, data: this.attachBernstrom(researchResult.data) };
			this.options.onStageChange?.({
				stage: "research",
				status: "complete",
				duration: researchResult.duration,
				summary: research.summary,
			});
			saveOutput(outputDir, "research.json", researchResult.data);
		}
		result.stages.research = researchResult;

		// Stage 2: Fact-Check (with a research-revision loop for fixable issues)
		let factCheckResult: StageResult<FactCheckOutput>;
		const cachedFactCheck = resume
			? loadOutput<FactCheckOutput>(outputDir, "fact-check.json")
			: null;
		if (
			cachedFactCheck &&
			FactCheckOutputSchema.safeParse(cachedFactCheck).success &&
			factCheckPassed(cachedFactCheck, this.options.qualityThreshold)
		) {
			this.logger.log("🔍 Stage 2: Quality Review — loaded from checkpoint");
			factCheckResult = { success: true, data: cachedFactCheck, duration: 0 };
			this.options.onStageChange?.({
				stage: "factCheck",
				status: "complete",
				duration: 0,
				summary: `Score: ${cachedFactCheck.overallCredibility}/10 (cached)`,
			});
		} else {
			this.options.onStageChange?.({ stage: "factCheck", status: "running" });
			factCheckResult = await this.runFactCheck(researchResult.data);
			if (factCheckResult.data) {
				saveOutput(outputDir, "fact-check.json", factCheckResult.data);
			}

			// verdict "revise" means specific, fixable claims — not fabrication or
			// systemic bias ("reject"). Feed the flagged claims back into a targeted
			// research correction and re-check, mirroring the Review↔Authoring loop
			// below. "reject" skips straight to hard failure: no automated revision
			// rescues fabricated quotes or systematic bias.
			let researchRevisionCount = 0;
			while (
				factCheckResult.data &&
				!factCheckPassed(factCheckResult.data, this.options.qualityThreshold) &&
				factCheckResult.data.verdict !== "reject" &&
				researchRevisionCount < this.options.maxRevisions
			) {
				const fc = factCheckResult.data;
				this.logger.log(
					`   📝 Kreditbarhet ${fc.overallCredibility}/10 — reviderar research (försök ${researchRevisionCount + 1}/${this.options.maxRevisions})`,
				);
				this.options.onStageChange?.({
					stage: "research",
					status: "running",
					summary: `Reviderar research (fact-check ${fc.overallCredibility}/10)`,
				});
				const revision = await this.runResearchRevision(researchResult.data, fc);
				if (!(revision.result.success && revision.result.data)) {
					this.logger.warn("   ⚠️  Research-revidering misslyckades — avbryter revideringar");
					break;
				}
				researchResult = { ...researchResult, data: this.attachBernstrom(revision.result.data) };
				saveOutput(outputDir, "research.json", researchResult.data);
				researchRevisionCount++;

				this.options.onStageChange?.({ stage: "factCheck", status: "running" });
				factCheckResult = await this.runFactCheck(researchResult.data);
				if (factCheckResult.data) {
					saveOutput(outputDir, "fact-check.json", factCheckResult.data);
				}
			}

			if (
				!(
					factCheckResult.success &&
					factCheckResult.data &&
					factCheckPassed(factCheckResult.data, this.options.qualityThreshold)
				)
			) {
				const gateError = factCheckResult.data
					? `Fact-check gate failed: ${factCheckResult.data.verdict} at ${factCheckResult.data.overallCredibility}/10`
					: factCheckResult.error;
				this.options.onStageChange?.({
					stage: "factCheck",
					status: "failed",
					duration: factCheckResult.duration,
					error: gateError,
				});
				result.stages.research = researchResult;
				result.stages.factCheck = factCheckResult.data
					? { ...factCheckResult, success: false, error: gateError ?? "Fact-check gate failed" }
					: factCheckResult;
				result.totalDuration = Date.now() - startTime;
				return result;
			}
			this.options.onStageChange?.({
				stage: "factCheck",
				status: "complete",
				duration: factCheckResult.duration,
				summary: `Score: ${factCheckResult.data.overallCredibility}/10${researchRevisionCount > 0 ? ` (efter ${researchRevisionCount} researchrevidering${researchRevisionCount > 1 ? "ar" : ""})` : ""}`,
			});
		}
		result.stages.research = researchResult;
		result.stages.factCheck = factCheckResult;

		// Only datasets the fact-checker actually attested may become a figure. A series the
		// checker did not speak to is treated exactly like an unverified source URL: dropped.
		// The figures stage runs after every gate, so this is the last place anything can
		// vouch for a number, and »the checker said nothing« must not read as »fine«.
		const attested = new Map(
			(factCheckResult.data.datasetChecks ?? []).map((c) => [c.id, c.status]),
		);
		const verifiedDatasets = (researchResult.data.datasets ?? []).filter(
			(d) => attested.get(d.id) === "verified",
		);
		const droppedDatasets = (researchResult.data.datasets ?? []).length - verifiedDatasets.length;
		if (verifiedDatasets.length > 0) {
			this.logger.log(`   - ${verifiedDatasets.length} dataset godkända för figursteget`);
		}
		if (droppedDatasets > 0) {
			this.logger.log(
				`   - ⚠️  ${droppedDatasets} dataset utan godkännande från faktakollen — de kan inte bli figurer`,
			);
		}

		// Stage 3: Authoring
		let authoringResult: StageResult<DraftOutput>;
		const cachedDraft = resume ? loadOutput<DraftOutput>(outputDir, "draft-meta.json") : null;
		if (cachedDraft && DraftOutputSchema.safeParse(cachedDraft).success) {
			this.logger.log("✍️  Stage 3: Authoring — loaded from checkpoint");
			const cachedWordCount = cachedDraft.wordCount ?? cachedDraft.body.split(/\s+/).length;
			authoringResult = { success: true, data: cachedDraft, duration: 0 };
			this.options.onStageChange?.({
				stage: "authoring",
				status: "complete",
				duration: 0,
				summary: `${cachedWordCount} words (cached)`,
			});
		} else {
			this.options.onStageChange?.({ stage: "authoring", status: "running" });
			authoringResult = await this.runAuthoring(
				researchResult.data,
				factCheckResult.data,
				ideaBrief,
			);
			if (!(authoringResult.success && authoringResult.data)) {
				this.options.onStageChange?.({
					stage: "authoring",
					status: "failed",
					duration: authoringResult.duration,
					error: authoringResult.error,
				});
				result.stages.authoring = authoringResult;
				result.totalDuration = Date.now() - startTime;
				return result;
			}
			// The draft is where a reference is written; linked here, every later stage and
			// every patch guard sees the link.
			authoringResult = {
				...authoringResult,
				data: { ...authoringResult.data, body: this.linkReferences(authoringResult.data.body) },
			};
			const wordCount =
				authoringResult.data.wordCount ?? authoringResult.data.body.split(/\s+/).length;
			this.options.onStageChange?.({
				stage: "authoring",
				status: "complete",
				duration: authoringResult.duration,
				summary: `${wordCount} words`,
			});
			saveOutput(outputDir, "draft.md", authoringResult.data.body);
			saveOutput(outputDir, "draft-meta.json", authoringResult.data);
		}
		result.stages.authoring = authoringResult;

		// Stage 4: Review (with potential revision loop)
		// All three are guaranteed non-null: either loaded from cache or ran successfully
		const currentDraft = authoringResult.data;
		const researchData = researchResult.data;
		const factCheckData = factCheckResult.data;
		let revisionCount = 0;
		let reviewRound = 0;
		let finalText = currentDraft.body;
		let title = currentDraft.title;
		let description = currentDraft.description;
		/** The first review's verdict on the draft: how good the text was before the edits. */
		let firstReview: ReviewOutput | undefined;
		/** Facts for the verify stage: what deepen and ground added, and what review could not confirm. */
		let verifyItems: VerifyItem[] = [];
		/** What verification settled, so the final read does not reopen it. */
		let settled: string[] = [];
		let deepenResult: StageResult<DeepenOutput> | undefined;
		let groundResult: StageResult<GroundOutput> | undefined;
		let polishResult: StageResult<PolishOutput> | undefined;
		let swedishVoiceResult: StageResult<SwedishVoiceOutput> | undefined;

		// ⚠️ ORDER: deepen → ground → review → verify → polish → Swedish voice → audit → final
		// read → figures. Two rules decide it.
		//   1. Nothing is added after the last gate. Deepen and ground used to run after the
		//      review, and open-issues.md listed every sentence they wrote under »ingen grind
		//      har läst det«. They now run before it; the review reads them, and verify checks
		//      the facts in them.
		//   2. Reading sources beats re-reading the essay. The review used to loop up to three
		//      rounds over its own rewrite; it now runs once, as patches, hands what it cannot
		//      confirm to verify, and the gate is a final read of the text that ships.
		// Every stage here returns patches that code applies (text-patches.ts): an edit a
		// stage does not list does not ship, and each applied one is logged.
		//
		// One checkpoint covers these stages. The files each stage wrote (review.json,
		// deepen.json, …) were never read back, so a crash in Swedish voice repeated up to
		// three max-effort reviews. The checkpoint is tied to the draft it edits.
		const draftKey = createHash("sha256").update(currentDraft.body).digest("hex").slice(0, 16);
		const done = new Set<string>();
		const saved = resume ? loadOutput<EditCheckpoint>(outputDir, "edit-checkpoint.json") : null;
		if (saved?.draftKey === draftKey) {
			for (const step of saved.done) done.add(step);
			finalText = saved.text;
			title = saved.title;
			description = saved.description;
			firstReview = saved.firstReview;
			verifyItems = saved.verifyItems;
			settled = saved.settled;
			reviewRound = saved.reviewRound;
			this.openIssues = saved.openIssues;
			this.logger.log(`   ↩︎  Återupptar efter: ${saved.done.join(", ")}`);
		}
		const checkpoint = (step: string) => {
			done.add(step);
			const state: EditCheckpoint = {
				draftKey,
				done: [...done],
				text: finalText,
				title,
				description,
				firstReview,
				verifyItems,
				settled,
				reviewRound,
				openIssues: this.openIssues,
			};
			saveOutput(outputDir, "edit-checkpoint.json", state);
		};

		const logPatches = (label: string, rejected: PatchRejection[] | undefined) => {
			if (rejected && rejected.length > 0) {
				this.logger.log(`     ${label}: ${rejected.length} ändring(ar) avvisade av vakterna`);
				for (const r of rejected.slice(0, 6)) {
					this.logger.log(`       ✗ ${r.reason}: ${describePatch(r.patch, 80)}`);
				}
			}
		};
		/** A reviewer's new description, unless it introduces a word the spell guard does not know. */
		const adoptDescription = (next: string | undefined) => {
			const reviewed = next?.trim();
			if (!reviewed) return;
			const bad = newMisspellings(description ?? "", reviewed);
			if (bad && bad.length > 0) {
				this.noteOpenIssue(
					"Språkgranskningens förslag som avvisades",
					`Granskarens ingress: »${reviewed}« (okända ord: ${bad.join(", ")})`,
				);
			} else {
				description = reviewed;
			}
		};
		const rejectArticle = (duration: number | undefined, summary: string) => {
			this.options.onStageChange?.({
				stage: "review",
				status: "failed",
				duration,
				summary,
				error: "Article rejected",
			});
			this.logger.log("   ❌ Article rejected - requires complete rewrite");
			result.totalDuration = Date.now() - startTime;
			return result;
		};

		if (!done.has("deepen")) {
			// Deepen — argument development, logical gaps (non-fatal)
			this.options.onStageChange?.({ stage: "deepen", status: "running" });
			deepenResult = await this.runDeepen(finalText);
			result.stages.deepen = deepenResult;
			if (deepenResult.success && deepenResult.data) {
				finalText = deepenResult.data.body;
				this.logger.log(`   - Deepen: ${deepenResult.data.verdict}`);
				for (const c of deepenResult.data.changes) {
					this.logger.log(
						`     ✍️  ${c.location}: ${describePatch({ original: c.before, replacement: c.after }, 160)}`,
					);
					verifyItems.push({
						origin: "deepen",
						claim: `Passage added by the deepen stage (${c.location})`,
						sentence: c.after,
						reason:
							"written after the fact-check; check any name, date, number or attribution in it",
					});
				}
				logPatches("Deepen", deepenResult.data.rejected);
				saveOutput(outputDir, "deepen.json", deepenResult.data);
				this.options.onStageChange?.({
					stage: "deepen",
					status: "complete",
					duration: deepenResult.duration,
					summary: deepenResult.data.verdict,
				});
			} else {
				this.logger.warn(`   ⚠️  Deepen hoppades över: ${deepenResult.error?.slice(0, 200)}`);
				this.options.onStageChange?.({
					stage: "deepen",
					status: "failed",
					duration: deepenResult.duration,
					error: deepenResult.error,
					summary: "skipped (non-fatal)",
				});
			}
			checkpoint("deepen");
		}

		if (!done.has("ground")) {
			// Ground — anchor abstract concepts in concrete moments (non-fatal)
			this.options.onStageChange?.({ stage: "ground", status: "running" });
			groundResult = await this.runGround(finalText);
			result.stages.ground = groundResult;
			if (groundResult.success && groundResult.data) {
				finalText = groundResult.data.body;
				this.logger.log(`   - Ground: ${groundResult.data.verdict}`);
				// ⚠️ Additionerna skrivs alltid ut, en per rad. Loggades tidigare bara som
				// »grounded«, vilket gör en påhittad konkretion osynlig i körningen: på en
				// fördjupningssida skrev steget in en namngiven ort och ett vårdpåstående som
				// aldrig hänt. I essäpipelinen läser granskaren och verifieringen dem numera.
				for (const c of groundResult.data.changes ?? []) {
					this.logger.log(`     ✍️  ${c.location}: ${c.addition}`);
					verifyItems.push({
						origin: "ground",
						claim: `Sentence added by the ground stage (${c.location})`,
						sentence: c.addition,
						reason: "written after the fact-check; it must be a general moment, never a named case",
					});
				}
				if ((groundResult.data.changes ?? []).length > 0) {
					this.logger.log("     → går till granskning och verifiering");
				}
				logPatches("Ground", groundResult.data.rejected);
				saveOutput(outputDir, "ground.json", groundResult.data);
				this.options.onStageChange?.({
					stage: "ground",
					status: "complete",
					duration: groundResult.duration,
					summary: groundResult.data.verdict,
				});
			} else {
				this.logger.warn(`   ⚠️  Ground hoppades över: ${groundResult.error?.slice(0, 200)}`);
				this.options.onStageChange?.({
					stage: "ground",
					status: "failed",
					duration: groundResult.duration,
					error: groundResult.error,
					summary: "skipped (non-fatal)",
				});
			}
			checkpoint("ground");
		}

		// Review — one round, as patches. A failure or a »reject« is fatal; anything else goes on.
		if (!done.has("review")) {
			this.options.onStageChange?.({ stage: "review", status: "running" });
			const reviewResult = await this.runReview(
				{ ...currentDraft, body: finalText, description },
				researchData,
				factCheckData,
				ideaBrief,
				undefined,
				{ mode: "patch" },
			);
			result.stages.review = reviewResult;
			if (!(reviewResult.success && reviewResult.data)) {
				this.options.onStageChange?.({
					stage: "review",
					status: "failed",
					duration: reviewResult.duration,
					error: reviewResult.error,
				});
				result.totalDuration = Date.now() - startTime;
				return result;
			}
			firstReview = reviewResult.data;
			reviewRound++;
			// Every round is kept. review.json alone was overwritten each round, so the first
			// round's score — the one that says how good the draft was — was lost.
			saveOutput(outputDir, `review-round-${reviewRound}.json`, firstReview);
			saveOutput(outputDir, "review.json", firstReview);
			const reviewSummary = `${firstReview.finalScore}/10 — ${firstReview.verdict}`;
			if (firstReview.verdict === "reject") {
				return rejectArticle(reviewResult.duration, reviewSummary);
			}
			adoptDescription(firstReview.description);
			finalText = firstReview.revisedText ?? finalText;
			logPatches("Review", firstReview.rejected);
			for (const item of firstReview.toVerify ?? []) {
				verifyItems.push({ origin: "review", ...item });
			}
			// What this review leaves for a person is handed to the final read, which repeats
			// what still applies. Written straight to the editor's list it went stale: on the
			// trial of »Resenären som sitter still« (2026-10-04) the list asked for note 22 to
			// be attributed, which verify had already done, and named one question twice.
			for (const issue of firstReview.forEditor ?? []) {
				this.logger.log(`     📌 (till sista läsningen) ${issue}`);
			}
			this.options.onStageChange?.({
				stage: "review",
				status: "complete",
				duration: reviewResult.duration,
				summary: `${reviewSummary}, ${firstReview.patches?.length ?? 0} ändringar`,
			});
			checkpoint("review");
		}

		// Verify — the facts review could not confirm, and the ones deepen and ground added,
		// against their sources (non-fatal: what is not settled goes to the editor's list).
		if (!done.has("verify")) {
			const verifyResult = await this.runVerify(finalText, verifyItems, researchData);
			if (verifyResult.success && verifyResult.data) {
				finalText = verifyResult.data.body;
				const triage = triageVerification(verifyItems, verifyResult.data);
				for (const line of triage.log) this.logger.log(`     ${line}`);
				settled.push(...triage.settled);
				for (const open of triage.open) this.noteOpenIssue("Kunde inte verifieras", open);
				logPatches("Verify", verifyResult.data.rejected);
				if (verifyItems.length > 0) {
					this.logger.log(`   - Verify: ${verifyResult.data.summary}`);
					saveOutput(outputDir, "verify.json", verifyResult.data);
				}
			} else {
				this.logger.warn(`   ⚠️  Verify hoppades över: ${verifyResult.error?.slice(0, 200)}`);
				for (const item of verifyItems) {
					this.noteOpenIssue(
						"Kunde inte verifieras",
						`${item.claim} — verifieringssteget föll (${item.reason})`,
					);
				}
			}
			checkpoint("verify");
		}

		if (!done.has("polish")) {
			// Polish — prose rhythm, over the reviewed and verified text (non-fatal)
			this.options.onStageChange?.({ stage: "polish", status: "running" });
			polishResult = await this.runPolish(finalText);
			result.stages.polish = polishResult;
			if (polishResult.success && polishResult.data) {
				finalText = polishResult.data.body;
				const editCount = polishResult.data.edits.split("\n").filter((l) => l.trim()).length;
				this.logger.log(
					`   - Polish: ${editCount} edits, weakest: "${polishResult.data.weakestSentence.slice(0, 60)}..."`,
				);
				logPatches("Polish", polishResult.data.rejected);
				saveOutput(outputDir, "polish.json", polishResult.data);
				this.options.onStageChange?.({
					stage: "polish",
					status: "complete",
					duration: polishResult.duration,
					summary: `${editCount} edits`,
				});
			} else {
				this.logger.warn(`   ⚠️  Polish hoppades över: ${polishResult.error?.slice(0, 200)}`);
				this.options.onStageChange?.({
					stage: "polish",
					status: "failed",
					duration: polishResult.duration,
					error: polishResult.error,
					summary: "skipped (non-fatal)",
				});
			}
			checkpoint("polish");
		}

		if (!done.has("swedishVoice")) {
			// Swedish Voice — consolidated language pass over body, title and
			// description. The title and description used to get no language check at all:
			// the stage had the parameter and produce() never passed it (non-fatal).
			this.options.onStageChange?.({ stage: "swedishVoice", status: "running" });
			swedishVoiceResult = await this.runSwedishVoice(finalText, { title, description });
			result.stages.swedishVoice = swedishVoiceResult;
			if (swedishVoiceResult.success && swedishVoiceResult.data) {
				finalText = swedishVoiceResult.data.body;
				const issueCount = swedishVoiceResult.data.issuesFound.length;
				this.logger.log(
					`   - Swedish Voice: ${issueCount} issues fixed (${swedishVoiceResult.data.verdict})`,
				);
				// The title and description get no patch guard (they are not in the body), so a
				// correction that misspells is refused here and handed to a human instead.
				const guarded = (label: string, before: string, after: string | undefined) => {
					const next = after?.trim();
					if (!next || next === before) return before;
					const bad = newMisspellings(before, next);
					if (bad && bad.length > 0) {
						this.logger.warn(`     ⚠️  ${label}: rättelsen avvisad, okända ord: ${bad.join(", ")}`);
						this.noteOpenIssue(
							"Språkgranskningens förslag som avvisades",
							`${label}: »${next}« (okända ord: ${bad.join(", ")})`,
						);
						return before;
					}
					this.logger.log(`     ${label}: »${before}« → »${next}«`);
					return next;
				};
				title = guarded("Titel", title, swedishVoiceResult.data.correctedTitle);
				description =
					guarded("Ingress", description ?? "", swedishVoiceResult.data.correctedDescription) ||
					undefined;
				logPatches("Swedish voice", swedishVoiceResult.data.rejected);
				saveOutput(outputDir, "swedish-voice.json", swedishVoiceResult.data);
				this.options.onStageChange?.({
					stage: "swedishVoice",
					status: "complete",
					duration: swedishVoiceResult.duration,
					summary: `${issueCount} issues`,
				});
			} else {
				this.logger.warn(
					`   ⚠️  Swedish voice hoppades över: ${swedishVoiceResult.error?.slice(0, 200)}`,
				);
				this.options.onStageChange?.({
					stage: "swedishVoice",
					status: "failed",
					duration: swedishVoiceResult.duration,
					error: swedishVoiceResult.error,
					summary: "skipped (non-fatal)",
				});
			}
			checkpoint("swedishVoice");
		}

		// The second-model audit, on what the deterministic checks can see.
		//
		// ⚠️ It used to run only when evaluate-article.py's TOTAL passed 12, and that total was
		// 93–100 % repetition findings, so it said nothing; the patches it proposed were then
		// kept only if the total fell, which word-choice fixes never make it do. It now always
		// runs (it takes under a minute), its report adds the house checks, and a guarded patch
		// set is kept when neither measure gets worse.
		let evalAfter: ProseEvalResult | null = null;
		const evalScript = findEvalScript();
		const writeEvalInput = (text: string): string => {
			// ⚠️ Figures are stripped before measuring. scripts/evaluate-article.py has no
			// fence awareness: it would read a spec's caption and note as prose.
			const prose = text.replace(/```[\s\S]*?```/g, "");
			saveOutput(
				outputDir,
				"eval-input.md",
				`---\ntitle: ${JSON.stringify(title)}\n---\n\n${prose}`,
			);
			return join(outputDir, "eval-input.md");
		};
		const measure = (text: string) => ({
			prose: evalScript ? evaluateProse(writeEvalInput(text), evalScript) : null,
			house: checkHouseRules(text, { description, checkDescription: true }),
		});
		const fixableCount = (findings: HouseFinding[]) =>
			findings.filter((f) => f.kind === "fixable").length;

		const before = measure(finalText);
		const evalBefore = before.prose;
		const houseBefore = before.house;
		this.logger.log(
			`   📋 Mätning: ${evalBefore ? `${evalBefore.actionableIssues} åtgärdbara prosaproblem (${evalBefore.totalIssues} totalt, resten upprepningar)` : "evaluate-article.py saknas"} · husregler: ${fixableCount(houseBefore)} att rätta, ${houseBefore.length - fixableCount(houseBefore)} för en människa`,
		);
		const report = [
			evalBefore?.report,
			formatHouseFindings(houseBefore.filter((f) => f.kind === "fixable")),
		]
			.filter(Boolean)
			.join("\n\n");

		const accept = (
			candidate: string,
			applied: number,
		): { ok: boolean; after: ReturnType<typeof measure> } => {
			const after = measure(candidate);
			const proseOk =
				evalBefore === null ||
				proseCorrectionAcceptable(evalBefore.actionableIssues, after.prose?.actionableIssues);
			const houseOk = fixableCount(after.house) <= fixableCount(houseBefore);
			return { ok: applied > 0 && proseOk && houseOk, after };
		};

		let houseAfter = houseBefore;
		const audit = await this.runCodexTicAudit(finalText, report || "Inga deterministiska fynd.");
		const codexAuditDuration = audit.duration;
		if (audit.success && audit.data) {
			const application = applyCodexTicAudit(finalText, audit.data);
			const verdict = accept(application.body, application.applied.length);
			saveOutput(outputDir, "codex-tic-audit.json", {
				...audit.data,
				application: { applied: application.applied, rejected: application.rejected },
				evaluation: {
					before: evalBefore?.actionableIssues,
					candidate: verdict.after.prose?.actionableIssues,
					houseBefore: fixableCount(houseBefore),
					houseCandidate: fixableCount(verdict.after.house),
					accepted: verdict.ok,
				},
			});
			if (verdict.ok) {
				finalText = application.body;
				evalAfter = verdict.after.prose;
				houseAfter = verdict.after.house;
				this.logger.log(`   🔎 Codex: ${application.applied.length} ändring(ar) godtagna`);
				for (const p of application.applied) this.logger.log(`     ✓ ${describePatch(p, 100)}`);
			} else {
				this.logger.log(
					`   🔎 Codex: inget godtaget (${application.applied.length} möjliga, ${application.rejected.length} avvisade)`,
				);
			}
		} else if (report) {
			// Codex is a second model family; when it is missing or fails, the Claude-side
			// corrector takes the same report, and its changes go through the same guards.
			this.logger.warn(
				`   ⚠️  Codex-granskningen misslyckades (${audit.error?.slice(0, 160)}) — Claude rättar i stället`,
			);
			const fix = await this.runEvalCorrection(finalText, report);
			if (fix.success && fix.data) {
				const application = applyTextPatches(
					finalText,
					fix.data.changes.map((c) => ({
						original: c.original,
						replacement: c.replacement,
						reason: c.category,
					})),
				);
				const verdict = accept(application.body, application.applied.length);
				saveOutput(outputDir, "eval-correction.json", {
					...fix.data,
					application: { applied: application.applied, rejected: application.rejected },
					accepted: verdict.ok,
				});
				if (verdict.ok) {
					finalText = application.body;
					evalAfter = verdict.after.prose;
					houseAfter = verdict.after.house;
					this.logger.log(
						`   📋 Eval-rättning: ${application.applied.length} ändring(ar) godtagna`,
					);
				}
			}
		}
		// The scratch file should describe what ships.
		if (evalScript) writeEvalInput(finalText);

		// What no fixer resolved goes to a human, named.
		for (const f of houseAfter) {
			const where = f.line ? `rad ${f.line}` : "frontmatter";
			this.logger.warn(`   ⚠️  [${f.rule}] ${where}: ${f.excerpt ? `»${f.excerpt}«` : f.message}`);
			this.noteOpenIssue(
				f.kind === "review" ? "Husregler — bedöm" : "Husregler — kvar efter rättning",
				`[${f.rule}] ${where}: ${f.excerpt ? `»${f.excerpt}« — ` : ""}${f.message}`,
			);
		}

		// Before the gate, so that it reads the text that ships: a reference a later stage
		// wrote, or one whose link a patch took, is linked again.
		finalText = this.linkReferences(finalText);

		// The gate: a final read of the text that ships. It replaces review rounds two and
		// three, and it is the first gate to read what polish and Swedish voice did.
		//
		// ⚠️ The score is gated in code, not only the verdict: {finalScore: 4, verdict:
		// "publish"} once published an essay. A model that sets both does not always set them
		// consistently, and then the score is what carries information.
		this.options.onStageChange?.({ stage: "review", status: "running" });
		let passed: ReviewOutput | undefined;
		let previousReview = firstReview;
		while (!passed) {
			const read = await this.runReview(
				{ ...currentDraft, title, body: finalText, description },
				researchData,
				factCheckData,
				ideaBrief,
				previousReview,
				{ mode: "patch", finalRead: { settled } },
			);
			result.stages.review = read;
			if (!(read.success && read.data)) {
				this.options.onStageChange?.({
					stage: "review",
					status: "failed",
					duration: read.duration,
					error: read.error,
				});
				result.totalDuration = Date.now() - startTime;
				return result;
			}
			reviewRound++;
			saveOutput(outputDir, `review-round-${reviewRound}.json`, read.data);
			saveOutput(outputDir, "review.json", read.data);
			const readSummary = `${read.data.finalScore}/10 — ${read.data.verdict}`;
			if (read.data.verdict === "reject") {
				return rejectArticle(read.duration, readSummary);
			}
			logPatches("Final read", read.data.rejected);
			const revised = read.data.revisedText ?? finalText;
			const extent = measureRewrite(finalText, revised);
			const size = `${Math.round(extent.changedRatio * 100)} % av orden, ${extent.newParagraphs.length} nya stycken`;

			if (reviewPassed(read.data)) {
				if (revised === finalText || isCosmeticRewrite(extent)) {
					// »publish« means cosmetic edits; this checks it.
					finalText = revised;
					adoptDescription(read.data.description);
					this.logger.log(`   - Sista läsningen godkänner texten (${size})`);
					passed = read.data;
				} else if (revisionCount < this.options.maxRevisions) {
					finalText = revised;
					adoptDescription(read.data.description);
					revisionCount++;
					previousReview = read.data;
					this.logger.log(
						`   ⚠️  »publish« men ändringarna var inte kosmetiska (${size}) — läses igen (varv ${revisionCount})`,
					);
				} else {
					// No rounds left: ship the text the passing read actually read.
					this.logger.warn(
						`   ⚠️  »publish« men ändringarna var inte kosmetiska (${size}) och inga varv återstår — den lästa texten publiceras, ändringarna kasseras`,
					);
					for (const p of extent.newParagraphs) {
						this.noteOpenIssue("Kasserat ur granskarens sista varv", p);
					}
					saveOutput(outputDir, "review-discarded-rewrite.md", revised);
					passed = read.data;
				}
				continue;
			}

			// Not passed: »revise«, or »publish« under the score gate.
			if (revisionCount >= this.options.maxRevisions || revised === finalText) {
				const why =
					revised === finalText
						? "granskaren begärde ändringar men förde inte in några"
						: `${this.options.maxRevisions} revisioner utan godkänd läsning`;
				this.options.onStageChange?.({
					stage: "review",
					status: "failed",
					duration: read.duration,
					summary: `${readSummary} (not publishable)`,
					error: "Review gate failed",
				});
				this.logger.log(`   ❌ Sista läsningen underkände texten: ${why}`);
				// ⚠️ The text is kept. »Bokmässan« (2026-09-27) failed this gate with nothing
				// written but the review rounds, and the essay was then finished by hand.
				for (const issue of read.data.issues ?? []) {
					this.noteOpenIssue("Underkänt vid sista läsningen", issue);
				}
				saveOutput(outputDir, "candidate.md", revised);
				result.openIssuesPath = this.writeOpenIssues(outputDir, title);
				result.totalDuration = Date.now() - startTime;
				return result;
			}
			finalText = revised;
			adoptDescription(read.data.description);
			revisionCount++;
			previousReview = read.data;
			this.logger.log(`   📝 Revision ${revisionCount} införd (${size}), läses igen...`);
		}
		const reviewData = passed;
		// What the reviewer leaves for a person must reach the editor's list. It used to
		// vanish: on »Sorgen vid Nilen« the reviewer said a translation »must be fixed
		// before print«, and final.md shipped it unchanged.
		for (const issue of reviewData.forEditor ?? []) {
			this.logger.log(`     📌 ${issue}`);
			this.noteOpenIssue("Granskaren lämnade åt en människa", issue);
		}
		// Nothing checks sources after this read, so what it flags goes to the editor.
		for (const item of reviewData.toVerify ?? []) {
			this.noteOpenIssue(
				"Kunde inte verifieras",
				`${item.claim} — flaggad vid sista läsningen: ${item.reason}`,
			);
		}
		this.options.onStageChange?.({
			stage: "review",
			status: "complete",
			duration: result.stages.review?.duration,
			summary: `${reviewData.finalScore}/10 — ${reviewData.verdict}`,
		});

		// The Quran quotes, against Bernström, on the exact text that ships.
		const quranFindings = this.checkQuranQuotes(finalText, outputDir);
		if (quranFindings === null) {
			this.noteOpenIssue(
				"Koranciteten",
				"check-quran-quotes.py kunde inte köras — kontrollera blockcitaten mot Bernström för hand.",
			);
		} else if (quranFindings.length > 0) {
			this.logger.warn(
				`   ⛔ Koranciteten: ${quranFindings.length} blockcitat stämmer inte med Bernström`,
			);
			for (const f of quranFindings) {
				this.logger.warn(`     ${f}`);
				this.noteOpenIssue("Koranciteten — återställ mot Bernström", f);
			}
		} else {
			this.logger.log("   - Koranciteten: alla blockcitat stämmer med Bernström");
		}

		// Stage 10: Figures — a chart or a table, if the essay has earned one (non-fatal).
		//
		// ⚠️ LAST, AND THAT PLACEMENT IS LOAD-BEARING. Three reasons, in order of weight:
		//   1. Number drift. Run earlier, a later prose pass could rewrite "196 000" to
		//      "knappt 200 000" and the figure would then contradict the paragraph above it.
		//      Running last means provenance is checked against the exact string that ships.
		//   2. The eval loop. scripts/evaluate-article.py has no fence awareness, so a figure
		//      present before the eval block would inflate totalIssues. (writeEvalInput strips
		//      fences too — belt and braces.)
		//   3. Only swedish-voice.md protected code fences before this change. All six prose
		//      prompts now do, but placement is a guarantee and a prompt is a request.
		//
		// The cost is that the caption never gets a Swedish-voice pass. Accepted: the caption
		// is assembled by the renderer from short formulaic fields, housePunctuation() fixes
		// the quotes, and check-house-style.py still reads fence lines at doctrine level.
		this.options.onStageChange?.({ stage: "figures", status: "running" });
		const figuresResult = await this.runFigures(finalText, verifiedDatasets);
		result.stages.figures = figuresResult;
		if (figuresResult.success && figuresResult.data) {
			const proposal = figuresResult.data.figure;
			if (proposal) {
				const applied = applyFigure({
					body: finalText,
					kind: proposal.kind,
					spec: proposal.spec,
					anchorText: proposal.anchorText,
					datasets: verifiedDatasets,
					repoRoot: join(findDataDir(), ".."),
				});
				if (applied.body) {
					finalText = applied.body;
					this.logger.log(`   - Figur (${proposal.kind}): ${proposal.carriesArgument}`);
					// Logged in full, for the same reason Ground logs every addition: no gate
					// upstream has read this, and a summary line would hide a bad figure.
					for (const line of proposal.spec.split("\n")) this.logger.log(`     │ ${line}`);
					this.logger.log(
						"     ⚠️  Ingen grind har läst figuren. Kontrollera varje tal mot källan.",
					);
					this.noteOpenIssue(
						"Tillagt efter granskningen (ingen grind har läst det)",
						`Figur (${proposal.kind}): ${proposal.carriesArgument} — kontrollera varje tal mot källan`,
					);
				} else {
					figuresResult.data.refusedFor = applied.verdict.reasons;
					this.logger.log("   - ⚠️  Figuren refuserades och essän behålls som den var:");
					for (const reason of applied.verdict.reasons) this.logger.log(`     • ${reason}`);
				}
			} else {
				this.logger.log(`   - Ingen figur: ${figuresResult.data.reasoning}`);
			}
			saveOutput(outputDir, "figures.json", figuresResult.data);
			this.options.onStageChange?.({
				stage: "figures",
				status: "complete",
				duration: figuresResult.duration,
				summary: figuresResult.data.figure
					? figuresResult.data.refusedFor
						? "figur refuserad"
						: `figur (${figuresResult.data.figure.kind})`
					: "ingen figur",
			});
		} else {
			this.options.onStageChange?.({
				stage: "figures",
				status: "failed",
				duration: figuresResult.duration,
				error: figuresResult.error,
				summary: "skipped (non-fatal)",
			});
		}

		// A reference to an earlier essay is a link. What the code could not make one,
		// and any address that leads nowhere, goes to the editor.
		for (const title of unlinkedEssayReferences(finalText)) {
			this.logger.warn(`   ⚠️  Hänvisningen till essän »${title}« saknar länk`);
			this.noteOpenIssue(
				"Länkar",
				`Hänvisningen till essän »${title}« saknar länk: titeln stämmer inte med någon publicerad essä. Är det en essä på islam.se, rätta titeln eller länka för hand.`,
			);
		}
		for (const link of deadEssayLinks(finalText, this.publishedEssays())) {
			this.logger.warn(`   ⚠️  Länken ${link} leder inte till någon publicerad essä`);
			this.noteOpenIssue(
				"Länkar",
				`Länken ${link} leder inte till någon publicerad essä. Rätta adressen eller ta bort länken.`,
			);
		}

		// The prompts name the worn title frames, and a model can still land on one; the
		// editor then reads it in open-issues.md rather than on the front page.
		const frame = titleFrame(title);
		if (frame) {
			this.noteOpenIssue(
				"Titeln",
				`»${title}« har ramen ${frame === "som-sats" ? "»X som …«" : "»Xs Y«"}, som de senaste titlarna redan har nött ut. Välj en annan form före publicering: ett påstående med subjekt och verb, en fråga eller ord ur materialet.`,
			);
		}

		saveOutput(outputDir, "final.md", finalText);

		// Generate bibliography (include all tracked references)
		const bibliography = this.references.formatSwedishBibliography(false);
		if (bibliography.trim()) {
			saveOutput(outputDir, "references.md", `# Referenser\n\n${bibliography}`);
		}

		// Save metadata with stage timings
		const finalWordCount = finalText.split(/\s+/).filter((w) => w.length > 0).length;
		const models = [...new Set(this.stageRuns.flatMap((r) => r.models))];
		const costUsd = this.stageRuns.reduce((sum, r) => sum + (r.costUsd ?? 0), 0);
		saveOutput(outputDir, "metadata.json", {
			topic,
			producedAt: new Date().toISOString(),
			title,
			description,
			qualityScore: reviewData.finalScore,
			draftScore: firstReview?.finalScore,
			wordCount: finalWordCount,
			revisionCount,
			reviewRounds: reviewRound,
			evaluation: {
				before: evalBefore?.totalIssues,
				after: (evalAfter ?? evalBefore)?.totalIssues,
				actionableBefore: evalBefore?.actionableIssues,
				actionableAfter: (evalAfter ?? evalBefore)?.actionableIssues,
				houseBefore: houseBefore.length,
				houseAfter: houseAfter.length,
			},
			openIssues: this.openIssues.length,
			models,
			costUsd: Math.round(costUsd * 100) / 100,
			stageRuns: this.stageRuns,
			stageDurations: {
				research: researchResult.duration,
				factCheck: factCheckResult.duration,
				authoring: authoringResult.duration,
				review: result.stages.review?.duration,
				deepen: deepenResult?.duration,
				ground: groundResult?.duration,
				polish: polishResult?.duration,
				swedishVoice: swedishVoiceResult?.duration,
				codexAudit: codexAuditDuration,
				figures: figuresResult.duration,
				total: Date.now() - startTime,
			},
		});

		if (this.options.publish) {
			result.publishedSlug = this.recordPublication(
				{
					outputDir,
					topic,
					producedAt: new Date().toISOString(),
					title,
					description,
					qualityScore: reviewData.finalScore,
					wordCount: finalWordCount,
					sourceUrls: researchData.sources.map((s) => s.url),
					reviewRounds: reviewRound,
					revisionCount,
					evaluation: {
						before: evalBefore?.actionableIssues,
						after: (evalAfter ?? evalBefore)?.actionableIssues,
						houseBefore: houseBefore.length,
						houseAfter: houseAfter.length,
					},
					models,
					openIssues: this.openIssues.length,
					reviewerIssues: reviewData.issues ?? [],
					struggles: authoringResult.data?.struggles ?? null,
					efficiencySuggestions: authoringResult.data?.efficiencySuggestions ?? null,
				},
				ideaContext,
			);
		} else {
			this.logger.log(
				`   - Provkörning: essän publiceras inte och körningen loggas inte. Publicera den som den står med: produce publish ${topicSlug}`,
			);
		}

		// The editor's list: everything a person should look at before the essay goes live.
		const openIssuesPath = this.writeOpenIssues(outputDir, title);
		if (openIssuesPath) {
			this.logger.log(`   📌 ${this.openIssues.length} öppna frågor — ${openIssuesPath}`);
		}
		result.openIssuesPath = openIssuesPath;

		result.success = true;
		result.finalArticle = finalText;
		result.bibliography = bibliography;

		result.totalDuration = Date.now() - startTime;

		this.logger.log("✅ Content production complete!");
		this.logFile = undefined;

		return result;
	}

	/** open-issues.md, grouped by section; returns its path, or undefined when there is nothing. */
	private writeOpenIssues(outputDir: string, title: string): string | undefined {
		if (this.openIssues.length === 0) return undefined;
		const sections = new Map<string, string[]>();
		for (const issue of this.openIssues) {
			sections.set(issue.section, [...(sections.get(issue.section) ?? []), issue.text]);
		}
		const body = [...sections]
			.map(([section, items]) => `## ${section}\n\n${items.map((i) => `- [ ] ${i}`).join("\n")}`)
			.join("\n\n");
		saveOutput(
			outputDir,
			"open-issues.md",
			`# Öppna frågor — ${title}\n\nInget av detta har någon grind avgjort. Gå igenom listan innan essän publiceras.\n\n${body}\n`,
		);
		return join(outputDir, "open-issues.md");
	}

	/**
	 * Find the earlier essays for an idea without producing anything else. The result is
	 * kept in the idea's run directory.
	 */
	async relatedEssays(
		topic: string,
		ideaBrief?: IdeaBrief,
	): Promise<StageResult<{ vetted: VettedRelatedEssays; essays: PublishedEssay[] }>> {
		const outputDir = this.ensureOutputDir(slugify(topic));
		const brief = ideaBrief && { ...ideaBrief, angle: splitBriefRequirements(ideaBrief).angle };
		const result = await this.runRelatedEssays(this.ideaText(topic, brief));
		if (result.success && result.data) {
			saveOutput(outputDir, "related-essays.json", result.data.vetted);
		}
		return result;
	}

	/**
	 * Run research only (no writing)
	 */
	async researchOnly(topic: string): Promise<StageResult<ResearchOutput>> {
		const topicSlug = slugify(topic);
		const outputDir = this.ensureOutputDir(topicSlug);

		const { result } = await this.runResearch(topic);
		if (result.success && result.data) {
			saveOutput(outputDir, "research.json", result.data);
		}

		return result;
	}

	/**
	 * Get production status for a topic
	 */
	getStatus(topicSlug: string): {
		exists: boolean;
		stages: {
			research: boolean;
			factCheck: boolean;
			draft: boolean;
			review: boolean;
			final: boolean;
		};
		metadata?: {
			producedAt: string;
			qualityScore: number;
			wordCount: number;
		};
	} {
		const dir = join(this.options.outputDir, topicSlug);

		if (!existsSync(dir)) {
			return {
				exists: false,
				stages: {
					research: false,
					factCheck: false,
					draft: false,
					review: false,
					final: false,
				},
			};
		}

		const metadata = loadOutput<{
			producedAt: string;
			qualityScore: number;
			wordCount: number;
		}>(dir, "metadata.json");

		return {
			exists: true,
			stages: {
				research: existsSync(join(dir, "research.json")),
				factCheck: existsSync(join(dir, "fact-check.json")),
				draft: existsSync(join(dir, "draft.md")),
				review: existsSync(join(dir, "review.json")),
				final: existsSync(join(dir, "final.md")),
			},
			metadata: metadata || undefined,
		};
	}
}

// Exposed for sibling producers (e.g. the svar answer-page producer) that drive
// a single Claude stage directly instead of the full essay pipeline.
export { ClaudeRunner, type ClaudeRunOptions } from "./claude-runner.js";
// Exposed for the retro-fit `produce figures` command, which proposes a figure for an
// already-published essay and must run it through exactly the same guard the pipeline does.
export { applyFigure, type GuardDataset, type GuardVerdict } from "./figure-guard.js";
// Exposed for sibling producers that run a research stage of their own: the /fordjupning/
// pipeline reuses this schema so its output is accepted by runFactCheck() unchanged, and
// therefore passes the same code-enforced credibility gate the essays do.
export {
	FactCheckOutputSchema,
	getResearchJsonSchema,
	ResearchOutputSchema,
} from "./schemas.js";
export { findDataDir } from "./services/article-publisher.js";
// Re-export services
export {
	ArticlePublisher,
	buildCorpusBrief,
	type CorpusAngles,
	type CorpusBrief,
	type CorpusBriefInput,
	type EnrichedIdea,
	type EnrichedIdeationOutput,
	type EnrichedQuote,
	formatCorpusBrief,
	formatQuotesForPrompt,
	type Idea,
	type IdeaProductionStatus,
	type IdeationOutput,
	IdeationService,
	type IdeationServiceOptions,
	type PodcastResult,
	PodcastService,
	type PublishedArticle,
	parseFrontmatter,
	type QuoteSearchOptions,
	type QuoteSearchResult,
	quotesToResearchFormat,
	searchQuotesComprehensive,
} from "./services/index.js";
export { SourceValidator } from "./source-validator.js";
export { loadSourceDocs, RESEARCH_ALLOWED_TOOLS, type SourceDoc, slugify } from "./utils.js";
