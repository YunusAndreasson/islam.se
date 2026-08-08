import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildCorpusBrief,
	ClaudeRunner,
	ContentOrchestrator,
	type CorpusAngles,
	evaluateProseText,
	type FactCheckOutput,
	FactCheckOutputSchema,
	formatCorpusBrief,
	getResearchJsonSchema,
	PROSE_EVAL_THRESHOLD,
	RESEARCH_ALLOWED_TOOLS,
	type ResearchOutput,
	ResearchOutputSchema,
	type ReviewOutput,
	SourceValidator,
	slugify,
} from "@islam-se/orchestrator";
import { getQuote, MODEL_MAP } from "@islam-se/quotes";
import { stringify as yamlStringify } from "yaml";
import { type FordjupningFrontmatter, FordjupningFrontmatterSchema } from "./fordjupning-schema.js";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

const MCP_TOOLS = [
	"mcp__quotes__search_quran",
	"mcp__quotes__search_books",
	"mcp__quotes__search_quotes",
	"mcp__quotes__search_by_filter",
	"mcp__quotes__get_quote_by_id",
	"mcp__quotes__get_inventory",
	"mcp__quotes__fetch_wikipedia",
];
const WEB_TOOLS = ["WebSearch", "WebFetch"];

/** Below this the review loop forces another revision regardless of the model's verdict. */
const MIN_FINAL_SCORE = 8;
/** Below this the page is abandoned rather than revised. */
const ABANDON_FINAL_SCORE = 6;

/** A reviewer body shorter than this fraction of the draft is treated as truncated. */
const MIN_REVISION_RATIO = 0.6;

/**
 * Body of a `---meta---\nbody` response, recovered without parsing the metadata.
 * ⚠️ Only safe for stages whose metadata is a report rather than a contract — the caller
 * must independently establish that the recovered text is good.
 */
export function bodyAfterFrontmatter(output: string | undefined): string | undefined {
	if (!output) return undefined;
	const open = output.indexOf("---");
	if (open === -1) return undefined;
	const close = output.indexOf("\n---", open + 3);
	if (close === -1) return undefined;
	const body = output.slice(output.indexOf("\n", close + 1) + 1).trim();
	return body.length > 0 ? body : undefined;
}

/**
 * ⚠️ The passing round's edits used to be dropped: the pass path returned before
 * `revisedText` was read, so every page shipped with the last reviewer's fixes
 * discarded while its issue list claimed »RÄTTAT AV MIG«. On the pass path nothing
 * downstream re-reads the body, hence the truncation guard.
 */
export function adoptRevision(
	revisedText: string | null | undefined,
	body: string,
): { text: string; rejected: boolean } {
	if (!revisedText) return { text: body, rejected: false };
	if (revisedText.length < body.length * MIN_REVISION_RATIO) {
		return { text: body, rejected: true };
	}
	return { text: revisedText, rejected: false };
}

export interface FordjupningProducerOptions {
	repoRoot: string;
	/** Absolute paths to the three authoring prompts. */
	prompts: { research: string; author: string; review: string };
	/** Path to .mcp.json so the spawned Claude can reach the quotes MCP server. */
	mcpConfig?: string;
	model?: "opus" | "sonnet";
	effort?: Effort;
	reviewEffort?: Effort;
	/** Credibility floor for the fact-check gate (default 7.5, as for essays). */
	qualityThreshold?: number;
	/** Revision rounds after the first review (default 2). */
	maxRevisions?: number;
	/** Author retries on parse/validation failure (default 2). */
	maxAttempts?: number;
	/** Reuse research.json / factcheck.json / draft-raw-N.md from a previous run. */
	resume?: boolean;
	/** Skip the ground / Swedish-voice / prose-eval passes (faster, lower quality). */
	skipLanguagePasses?: boolean;
	/** Where stage outputs are written for inspection. */
	outputDir?: string;
	quiet?: boolean;
}

export interface FordjupningProduceInput {
	/** The head entity, e.g. "Hijab". */
	term: string;
	angles: CorpusAngles;
	/** Loci classici fetched by reference — see buildCorpusBrief. */
	pinnedVerses?: string[];
	slug?: string;
	/** Legacy URL this page could inherit; only proposed, never wired here. */
	legacyPath?: string;
	overwrite?: boolean;
}

export interface FordjupningResult {
	success: boolean;
	slug?: string;
	filePath?: string;
	frontmatter?: FordjupningFrontmatter;
	body?: string;
	wordCount?: number;
	/** Every gate outcome, so a run can be judged without reading the log. */
	gates?: {
		credibility?: number;
		credibilityThreshold: number;
		finalScore?: number;
		verdict?: ReviewOutput["verdict"];
		revisions: number;
		droppedSources: string[];
		proseIssuesBefore?: number;
		proseIssuesAfter?: number;
		/** Corpus quote ids research carried through and verified against quotes.db. */
		verifiedQuotes?: number;
		/** Quote candidates the corpus brief offered, for comparison. */
		corpusQuotes?: number;
		/** Non-fatal stages that did not run. A silent skip reads as a clean pass otherwise. */
		skippedStages: string[];
		/** Frontmatter source URLs stripped because they 404'd or could not be verified. */
		strippedSourceUrls: string[];
		/** Sentences the Ground pass inserted AFTER every gate. Never let these be silent. */
		groundAdditions: string[];
	};
	redirect?: [string, string];
	error?: string;
}

/**
 * Reference databases whose deep links the author cannot be trusted to have opened, and
 * whose pages we cannot cheaply verify: the title is Arabic while the citation is a Latin
 * transliteration, so no token overlap exists to match on.
 *
 * ⚠️ Four of five such links across the first four pages were wrong — two 404, and two
 * answering 200 with a DIFFERENT book (`book/23653` is ʿUyūn al-athar, not Mughniyya;
 * `book/1157` is al-Shaybānī's al-Jāmiʿ al-kabīr, not Ibn Taymiyya). A liveness check can
 * never catch the second kind, so the url is dropped and the citation kept by name.
 */
export const UNVERIFIABLE_DEEP_LINK =
	/^https?:\/\/(www\.)?(shamela\.ws|islamweb\.net)\/(book|library)\//i;

const KEY_ORDER = [
	"title",
	"term",
	"description",
	"seoDescription",
	"blurb",
	"publishedAt",
	"keywords",
	"about",
	"faq",
	"sources",
	"related",
	"essays",
	"imageAlt",
	"imageCaption",
];

function orderFrontmatter(meta: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const k of KEY_ORDER) if (meta[k] !== undefined) out[k] = meta[k];
	return out;
}

/**
 * Fold a quotation to what a comparison should be sensitive to.
 *
 * The corpus is OCR of old print, so typography drifts freely between the database and
 * anything a model echoes back: curly vs straight quotes, en/em dashes, `se'n` vs `sen`,
 * doubled spaces. None of that is a rewrite. A changed WORD is.
 */
export function normaliseQuote(text: string): string {
	// Keep letters, digits and single spaces — nothing else. Anything narrower has to
	// enumerate the punctuation the scans use, and that list is never complete: the first
	// attempt missed the curly apostrophe (U+2019) and let a comma/em-dash swap through.
	return text
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim();
}

/**
 * Collate every corpus quotation against quotes.db: does the id exist, does the wording
 * match, and does the attribution differ?
 *
 * ⚠️ Existence alone is not enough. A real id carrying invented text is the same forgery
 * as an invented id, and nothing in code compared wording until 2026-08-03 — the
 * fact-check stage was the only guard, and on the kaba run it reported the quote MCP
 * tools "not present in my tool list" and compared nothing, while the very same flags
 * resolved the id correctly when run by hand. Never let a model's self-report be the
 * only guard on a forgery.
 */
export function verifyQuotesAgainstDb(
	quotes: ReadonlyArray<{ id: string | number; text?: string; author?: string }>,
): { missing: string[]; altered: string[]; reattributed: string[] } {
	const missing: string[] = [];
	const altered: string[] = [];
	const reattributed: string[] = [];

	for (const q of quotes) {
		const numeric = Number(String(q.id).replace(/\D/g, ""));
		if (!Number.isFinite(numeric) || numeric === 0) continue;
		const stored = getQuote(numeric);
		if (!stored) {
			missing.push(String(q.id));
			continue;
		}
		// Research may legitimately quote a span, so require containment rather than
		// equality — but the words it does keep must be the stored words.
		const claimed = normaliseQuote(q.text ?? "");
		const actual = normaliseQuote(stored.text ?? "");
		if (claimed.length >= 12 && !actual.includes(claimed)) altered.push(String(q.id));

		// Attribution differences are reported, never fatal: the author column is the
		// BOOK's author, not the speaker, so correcting it is usually right — Boye's
		// Gömda land is filed under "Unknown", and a novel's line belongs to its character.
		const claimedAuthor = (q.author ?? "").trim();
		if (claimedAuthor && stored.author && !looseNameMatch(claimedAuthor, stored.author)) {
			reattributed.push(`${q.id}: "${stored.author}" → "${claimedAuthor}"`);
		}
	}
	return { missing, altered, reattributed };
}

/** True when two spellings plainly name the same person. */
export function looseNameMatch(a: string, b: string): boolean {
	const key = (s: string) =>
		s
			.toLowerCase()
			.normalize("NFD")
			.replace(/[̀-ͯ]/g, "")
			.replace(/[^a-z]/g, "");
	const x = key(a);
	const y = key(b);
	return Boolean(x && y && (x.includes(y) || y.includes(x)));
}

type StageOk = { ok: true; fm: FordjupningFrontmatter; body: string };
type StageErr = { ok: false; error: string; raw: string };

export class FordjupningProducer {
	private readonly runner = new ClaudeRunner();
	private readonly validator = new SourceValidator();
	private readonly orchestrator: ContentOrchestrator;
	private readonly fordjupningDir: string;
	private readonly outputDir: string;
	private readonly log: (msg: string) => void;

	constructor(private readonly opts: FordjupningProducerOptions) {
		this.fordjupningDir = join(opts.repoRoot, "data", "fordjupning");
		this.outputDir = opts.outputDir ?? join(tmpdir(), "fordjupning-output");
		this.log = opts.quiet ? () => undefined : (msg) => console.log(msg);
		// The orchestrator owns the stages whose GATES we want: runFactCheck's credibility
		// floor and runReview's revision machinery. Only the review prompt is swapped —
		// runReview's system prompt is register-neutral (draft + verified quotes +
		// fact-check flags), so the essay rubric lives entirely in the prompt file.
		this.orchestrator = new ContentOrchestrator({
			outputDir: this.outputDir,
			model: opts.model ?? "opus",
			qualityThreshold: opts.qualityThreshold ?? 7.5,
			maxRevisions: opts.maxRevisions ?? 2,
			quiet: opts.quiet ?? false,
			promptOverrides: { "reviewer.md": opts.prompts.review },
		});
	}

	/** Slugs of existing answer pages — the only valid `related` targets. */
	private existingSvarSlugs(): string[] {
		try {
			return readdirSync(join(this.opts.repoRoot, "data", "svar"))
				.filter((f) => f.endsWith(".md"))
				.map((f) => f.replace(/\.md$/, ""));
		} catch {
			return [];
		}
	}

	private existingEssaySlugs(): string[] {
		try {
			return readdirSync(join(this.opts.repoRoot, "data", "articles"))
				.filter((f) => f.endsWith(".md"))
				.map((f) => f.replace(/\.md$/, ""));
		} catch {
			return [];
		}
	}

	async produce(input: FordjupningProduceInput): Promise<FordjupningResult> {
		mkdirSync(this.outputDir, { recursive: true });
		const svarSlugs = this.existingSvarSlugs();
		const essaySlugs = this.existingEssaySlugs();
		const gates: NonNullable<FordjupningResult["gates"]> = {
			credibilityThreshold: this.opts.qualityThreshold ?? 7.5,
			revisions: 0,
			droppedSources: [],
			skippedStages: [],
			strippedSourceUrls: [],
			groundAdditions: [],
		};

		// ── Step 0 — corpus (deterministic, no LLM) ───────────────────────────────
		this.log("📚 Korpus: hämtar material ur quotes.db, books.db och Koranen …");
		const brief = await buildCorpusBrief({
			term: input.term,
			angles: input.angles,
			pinnedVerses: input.pinnedVerses,
		});
		const briefText = formatCorpusBrief(brief);
		writeFileSync(join(this.outputDir, "corpus-brief.md"), briefText, "utf-8");
		if (brief.pinned.missing.length > 0) {
			this.log(`   ⚠️  Kärnverser saknas i databasen: ${brief.pinned.missing.join(", ")}`);
		}
		this.log(`   Brief: ${briefText.length} tecken → ${this.outputDir}/corpus-brief.md`);
		gates.corpusQuotes = brief.swedishQuotes.reduce((n, g) => n + g.hits.length, 0);

		// ── Step 1 — research ─────────────────────────────────────────────────────
		let researchOut = this.checkpoint("research.json", ResearchOutputSchema);
		if (researchOut) {
			this.log("♻️  Research: återanvänder research.json");
		} else {
			const research = await this.research(input, briefText);
			if (!research.ok) return { success: false, error: `research: ${research.error}`, gates };
			const validated = await this.validateResearch(research.data);
			gates.droppedSources = validated.dropped;
			if (validated.fatal) return { success: false, error: validated.fatal, gates };
			researchOut = validated.research;
			writeFileSync(
				join(this.outputDir, "research.json"),
				JSON.stringify(researchOut, null, 2),
				"utf-8",
			);
		}

		gates.verifiedQuotes = (researchOut.quotes ?? []).length;
		if (gates.corpusQuotes > 0 && gates.verifiedQuotes === 0) {
			this.log(
				`   ⚠️  Research bar inga citat-id vidare trots ${gates.corpusQuotes} kandidater i briefen — ` +
					"id-grinden kontrollerar ingenting och korpuscitaten i texten är overifierade.",
			);
		}

		// ── Step 2 — fact-check (orchestrator's gate, unchanged) ──────────────────
		// ⚠️ A cached fact-check is re-tested against the threshold below; never trust
		// that the run which wrote it used today's floor.
		let factCheck = this.checkpoint("factcheck.json", FactCheckOutputSchema);
		if (factCheck) {
			this.log("♻️  Faktagranskning: återanvänder factcheck.json");
		} else {
			this.log("🔎 Faktagranskning (kodtvingad trovärdighetsgrind) …");
			const fc = await this.orchestrator.runFactCheck(researchOut);
			if (!(fc.success && fc.data)) {
				gates.credibility = fc.data?.overallCredibility;
				return { success: false, error: `faktagranskning: ${fc.error}`, gates };
			}
			factCheck = fc.data;
			this.dump("factcheck.json", factCheck);
		}
		gates.credibility = factCheck.overallCredibility;
		if (factCheck.overallCredibility < gates.credibilityThreshold) {
			return {
				success: false,
				error: `faktagranskning: trovärdighet ${factCheck.overallCredibility} < ${gates.credibilityThreshold}`,
				gates,
			};
		}

		// ── Step 3 — author ───────────────────────────────────────────────────────
		const draft =
			this.checkpointDraft() ??
			(await this.author(input, briefText, researchOut, svarSlugs, essaySlugs));
		if (!draft.ok) return { success: false, error: `författande: ${draft.error}`, gates };

		// ── Step 4 — review loop with a code-enforced score gate ──────────────────
		const reviewed = await this.reviewLoop(draft, researchOut, factCheck, gates);
		if (!reviewed.ok) return { success: false, error: reviewed.error, gates };

		// ── Steps 5–7 — language passes ───────────────────────────────────────────
		let body = reviewed.body;
		if (!this.opts.skipLanguagePasses) body = await this.languagePasses(body, reviewed.fm, gates);

		// ── Step 8 — verify the bibliography that actually ships, then write ──────
		await this.validateArticleSources(reviewed.fm, gates);
		return this.write(input, reviewed.fm, body, svarSlugs, essaySlugs, gates);
	}

	private async research(
		input: FordjupningProduceInput,
		briefText: string,
	): Promise<{ ok: true; data: ResearchOutput } | StageErr> {
		this.log("🔬 Research: svensk rättslig och samhällelig kontext + källorna …");
		const run = await this.runner.runJSON(
			{
				prompt: this.opts.prompts.research,
				systemPrompt: `ÄMNE (huvudterm): ${input.term}`,
				userContent: briefText,
				model: MODEL_MAP[this.opts.model ?? "opus"],
				builtinTools: WEB_TOOLS,
				allowedTools: [...RESEARCH_ALLOWED_TOOLS, ...MCP_TOOLS],
				mcpConfig: this.opts.mcpConfig,
				skipPermissions: true,
				noSessionPersistence: true,
				jsonSchema: getResearchJsonSchema(),
				effort: "high",
				timeout: 1_800_000,
			},
			ResearchOutputSchema,
		);
		// Persist the raw envelope BEFORE validating. This stage costs 10–30 minutes of
		// Opus with web access; a schema mismatch used to discard all of it, leaving
		// nothing to inspect or reuse.
		this.dump("research-raw.json", run.output);

		// ⚠️ Read `data`, never `output`. runJSON already unwraps the CLI envelope's
		// `structured_output` and validates against the schema passed above; `output` is
		// still the raw envelope, so parsing it yields {structured_output, result, …} and
		// every field of the actual research reads as undefined.
		if (!(run.success && run.data)) {
			return {
				ok: false,
				error: run.error ?? "no structured output",
				raw: String(run.output ?? "").slice(0, 2000),
			};
		}
		return { ok: true, data: run.data };
	}

	/** Write a stage's raw output so an expensive run survives a validation failure. */
	/**
	 * Re-read a stage output from a previous run. Returns undefined unless `--resume` is
	 * set, so a normal run never picks up a stale artefact.
	 *
	 * ⚠️ Always re-validated against the schema: a checkpoint written by an older build
	 * may not match today's shape, and a silently half-loaded stage is worse than a rerun.
	 */
	private checkpoint<T>(filename: string, schema: import("zod").ZodType<T>): T | undefined {
		if (!this.opts.resume) return undefined;
		const path = join(this.outputDir, filename);
		if (!existsSync(path)) return undefined;
		try {
			const parsed = schema.safeParse(JSON.parse(readFileSync(path, "utf-8")));
			if (parsed.success) return parsed.data;
			this.log(`   ⚠️  ${filename} matchar inte schemat längre — kör om steget.`);
		} catch {
			this.log(`   ⚠️  ${filename} går inte att läsa — kör om steget.`);
		}
		return undefined;
	}

	/** The newest draft-raw-N.md from a previous run, if it still parses. */
	private checkpointDraft(): StageOk | undefined {
		if (!this.opts.resume) return undefined;
		const drafts = readdirSync(this.outputDir)
			.filter((f) => /^draft-raw-\d+\.md$/.test(f))
			.sort((a, b) => Number(b.match(/\d+/)?.[0]) - Number(a.match(/\d+/)?.[0]));
		for (const file of drafts) {
			const parsed = this.runner.parseMarkdownWithMeta(
				readFileSync(join(this.outputDir, file), "utf-8"),
			);
			if (!parsed) continue;
			const fm = FordjupningFrontmatterSchema.safeParse(parsed.meta);
			if (!fm.success) continue;
			this.log(`♻️  Författande: återanvänder ${file} (${parsed.body.split(/\s+/).length} ord)`);
			return { ok: true, fm: fm.data, body: parsed.body };
		}
		return undefined;
	}

	private dump(filename: string, contents: unknown): void {
		if (contents === undefined || contents === null) return;
		try {
			writeFileSync(
				join(this.outputDir, filename),
				typeof contents === "string" ? contents : JSON.stringify(contents, null, 2),
				"utf-8",
			);
		} catch {
			// Never let bookkeeping fail a production run.
		}
	}

	/**
	 * Verify every source URL and every quote id before the material can reach the page.
	 *
	 * ⚠️ Stricter than the essay pipeline on purpose. There, a quote id that is not in the
	 * database is only LOGGED, and the answer-page producer hallucinated a source URL at
	 * least once. An encyclopedic page carries ≥8 sources and a corpus whose attributions
	 * fail roughly one time in three, so a bad id aborts the run here.
	 */
	private async validateResearch(
		research: ResearchOutput,
	): Promise<{ research: ResearchOutput; dropped: string[]; fatal?: string }> {
		const urls = (research.sources ?? []).map((s) => s.url).filter(Boolean);
		const dropped: string[] = [];
		if (urls.length > 0) {
			this.log(`   Verifierar ${urls.length} käll-URL:er …`);
			const { results } = await this.validator.verifyUrls(urls);
			const bad = new Set<string>();
			for (const v of results) {
				const rejected = this.validator.validateSource(v.url).credibility === "rejected";
				if (!v.exists || rejected) {
					bad.add(v.url);
					dropped.push(`${v.url} (${rejected ? "svartlistad" : "nås inte"})`);
				}
			}
			if (bad.size > 0) this.log(`   ⚠️  Strök ${bad.size} källor: ${[...bad].join(", ")}`);
			research.sources = (research.sources ?? []).filter((s) => !bad.has(s.url));
		}

		// Quote ids must resolve. A numeric id that is not in quotes.db means the model
		// invented the citation, which is the one failure this page type cannot survive.
		//
		// ⚠️ An EMPTY quotes array silently disarms this gate. Both of the first two pages
		// quoted the corpus in prose (Strindberg, Tegnér, Boye) while research carried zero
		// ids, so nothing was ever checked. Count it into the gate report rather than let a
		// run report success with its strictest gate inert.
		//
		// ⚠️ Existence alone is NOT enough. A real id carrying invented text is the same
		// forgery as an invented id, and it used to pass: the fact-check stage was the only
		// thing comparing wording, and on the kaba run it reported the quote MCP tools
		// "not present in my tool list" and checked nothing — while the tools demonstrably
		// worked when invoked with identical flags. Never let a model's self-report be the
		// only guard. Compare the text here, in code.
		const { missing, altered, reattributed } = verifyQuotesAgainstDb(research.quotes ?? []);
		if (missing.length > 0) {
			return {
				research,
				dropped,
				fatal: `citat-id finns inte i quotes.db: ${missing.join(", ")} — påhittad attribution, avbryter`,
			};
		}
		if (altered.length > 0) {
			return {
				research,
				dropped,
				fatal: `citat-id finns men texten stämmer inte med quotes.db: ${altered.join(", ")} — omskrivet citat, avbryter`,
			};
		}
		if (reattributed.length > 0) {
			this.log(`   ℹ️  Omattribuerade citat (kontrollera för hand): ${reattributed.join("; ")}`);
		}
		return { research, dropped };
	}

	private async author(
		input: FordjupningProduceInput,
		briefText: string,
		research: ResearchOutput,
		svarSlugs: string[],
		essaySlugs: string[],
	): Promise<StageOk | StageErr> {
		const maxAttempts = this.opts.maxAttempts ?? 2;
		let last: StageErr = { ok: false, error: "author did not run", raw: "" };
		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			this.log(`✍️  Författande (försök ${attempt}/${maxAttempts}) …`);
			const userContent = [
				briefText,
				"\n\n# RESEARCHUNDERLAG\n",
				JSON.stringify(research, null, 2),
				`\n\n# GILTIGA \`related\`-SLUGS (endast dessa)\n${svarSlugs.join(", ")}`,
				`\n\n# GILTIGA \`essays\`-SLUGS (endast dessa)\n${essaySlugs.join(", ")}`,
				attempt > 1
					? `\n\n⚠️ FÖRRA FÖRSÖKET underkändes: ${last.error}\nRätta felet och följ utdataformatet exakt.`
					: "",
			].join("");

			const run = await this.runner.run({
				prompt: this.opts.prompts.author,
				systemPrompt: `HUVUDTERM att skriva fördjupningsartikel om: ${input.term}`,
				userContent,
				model: MODEL_MAP[this.opts.model ?? "opus"],
				builtinTools: WEB_TOOLS,
				allowedTools: [...MCP_TOOLS, ...WEB_TOOLS],
				mcpConfig: this.opts.mcpConfig,
				skipPermissions: true,
				noSessionPersistence: true,
				effort: this.opts.effort ?? "xhigh",
				timeout: 2_700_000,
			});
			if (!(run.success && run.output)) {
				last = { ok: false, error: run.error ?? "no output", raw: "" };
				continue;
			}
			// Same reasoning as the research stage: the draft is expensive, so keep the raw
			// text per attempt even when the frontmatter fails validation.
			this.dump(`draft-raw-${attempt}.md`, run.output);
			const parsedOut = this.runner.parseMarkdownWithMeta(run.output);
			if (!parsedOut) {
				last = {
					ok: false,
					error: "could not parse the ---frontmatter---/body block",
					raw: run.output,
				};
				this.log(`   ↻ Försök ${attempt} underkänt: ${last.error}`);
				continue;
			}
			const v = FordjupningFrontmatterSchema.safeParse(parsedOut.meta);
			if (!v.success) {
				last = {
					ok: false,
					error: `frontmatter invalid: ${v.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
					raw: run.output,
				};
				// A retry costs a full author pass; say what failed rather than leave the log
				// showing only "försök 2/2". The blurb field alone has cost one.
				this.log(`   ↻ Försök ${attempt} underkänt: ${last.error}`);
				continue;
			}
			const body = parsedOut.body.trim();
			const words = body.split(/\s+/).filter(Boolean).length;
			if (words < 2200) {
				last = {
					ok: false,
					error: `för kort: ${words} ord (målet är 2 800–4 500)`,
					raw: run.output,
				};
				this.log(`   ↻ Försök ${attempt} underkänt: ${last.error}`);
				continue;
			}
			this.log(`   Utkast: ${words} ord`);
			return { ok: true, fm: v.data, body };
		}
		return last;
	}

	/**
	 * Review with revisions. The score gate is enforced HERE, in code.
	 *
	 * ⚠️ The essay pipeline branches on `verdict` alone and never compares `finalScore`,
	 * so a model returning {finalScore: 4, verdict: "publish"} publishes. The ≥8 bar lives
	 * only in the prompt. For a YMYL page on a contested topic that is not good enough.
	 */
	private async reviewLoop(
		draft: StageOk,
		research: ResearchOutput,
		factCheck: FactCheckOutput,
		gates: NonNullable<FordjupningResult["gates"]>,
	): Promise<
		{ ok: true; fm: FordjupningFrontmatter; body: string } | { ok: false; error: string }
	> {
		const maxRevisions = this.opts.maxRevisions ?? 2;
		let body = draft.body;
		let previous: ReviewOutput | undefined;

		for (let round = 0; round <= maxRevisions; round++) {
			this.log(`🧐 Granskning (varv ${round + 1}/${maxRevisions + 1}) …`);
			const res = await this.orchestrator.runReview(
				{ title: draft.fm.title, body },
				research,
				factCheck,
				undefined,
				previous,
			);
			if (!res.success) {
				// ⚠️ Keep the unparseable text. A parse failure here used to discard the whole
				// run: the draft survived on disk but the reviewer's verdict did not.
				if (res.output) this.dump(`review-raw-${round + 1}.md`, res.output);
				return { ok: false, error: `granskning: ${res.error}` };
			}
			if (!res.data) return { ok: false, error: "granskning: tomt svar" };

			const review = res.data;
			gates.finalScore = review.finalScore;
			gates.verdict = review.verdict;
			this.log(`   Poäng ${review.finalScore}/10, utfall »${review.verdict}«`);
			// The reviewer's punch-list is the raw material for improving the author
			// prompt between sessions — logging the score alone threw it away. Kept per
			// round, since what round 2 still complains about is the durable lesson.
			this.dump(`review-${round + 1}.json`, {
				finalScore: review.finalScore,
				verdict: review.verdict,
				// Without this a bodiless dump looks identical whether the reviewer edited
				// the text or only described what it would have changed.
				revisedTextChars: review.revisedText?.length ?? 0,
				summary: review.summary,
				strengths: review.strengths,
				issues: review.issues,
			});

			if (review.verdict === "reject" || review.finalScore < ABANDON_FINAL_SCORE) {
				return {
					ok: false,
					error: `granskningen underkände sidan (${review.finalScore}/10): ${review.summary}`,
				};
			}

			const passes = review.verdict === "publish" && review.finalScore >= MIN_FINAL_SCORE;
			if (passes) return { ok: true, fm: draft.fm, body: this.adopt(review, body) };

			if (review.verdict === "publish" && review.finalScore < MIN_FINAL_SCORE) {
				this.log(
					`   ⚠️  Utfallet var »publish« men ${review.finalScore} < ${MIN_FINAL_SCORE} — tvingar revision.`,
				);
			}
			if (round === maxRevisions) {
				return {
					ok: false,
					error: `nådde ${review.finalScore}/10 efter ${maxRevisions} revisioner, under ribban ${MIN_FINAL_SCORE}`,
				};
			}
			body = this.adopt(review, body);
			previous = review;
			gates.revisions = round + 1;
		}
		return { ok: false, error: "granskningsloopen avslutades utan utfall" };
	}

	private adopt(review: ReviewOutput, body: string): string {
		const { text, rejected } = adoptRevision(review.revisedText, body);
		if (rejected) {
			this.log(
				`   ⚠️  Granskarens text kasserad: ${review.revisedText?.length} tecken mot utkastets ${body.length} — behåller utkastet.`,
			);
		}
		return text;
	}

	/** Ground → Swedish voice → prose eval, each non-fatal: a failure keeps the text. */
	private async languagePasses(
		body: string,
		fm: FordjupningFrontmatter,
		gates: NonNullable<FordjupningResult["gates"]>,
	): Promise<string> {
		let text = body;

		// ⚠️ Ground kör EFTER faktagranskningen och EFTER granskningsvarven — ingen grind
		// läser det den lägger till. Meningarna togs tidigare tyst ur `data.body` medan
		// `changes[]` kastades, så en påhittad mening kunde gå hela vägen ut osedd: på
		// abort.md skrev steget in en namngiven ort och ett specifikt vårdpåstående som
		// inte hade hänt, under omdömet »publish«. Additionerna skrivs nu alltid ut.
		this.log("🌍 Ground …");
		const ground = await this.orchestrator.runGround(text);
		if (ground.success && ground.data?.body) {
			text = ground.data.body;
			for (const c of ground.data.changes ?? []) {
				gates.groundAdditions.push(`${c.location}: ${c.addition}`);
			}
			if (gates.groundAdditions.length > 0)
				this.log(`   ✍️  Ground lade till ${gates.groundAdditions.length} mening(ar) — läs dem:`);
			for (const a of gates.groundAdditions) this.log(`      · ${a}`);
		} else this.skip(gates, "Ground", ground.error);

		this.log("🇸🇪 Svensk röst …");
		const voice = await this.orchestrator.runSwedishVoice(text, {
			title: fm.title,
			description: fm.description,
		});
		if (voice.success && voice.data?.body) text = voice.data.body;
		else this.skip(gates, "Svensk röst", voice.error);

		return await this.prosePass(text, fm, gates);
	}

	/** Measure, correct, re-measure. The correction is kept only if the count actually falls. */
	private async prosePass(
		text: string,
		fm: FordjupningFrontmatter,
		gates: NonNullable<FordjupningResult["gates"]>,
	): Promise<string> {
		const before = evaluateProseText({ body: text, title: fm.title, scratchDir: this.outputDir });
		if (!before) return text;

		gates.proseIssuesBefore = before.totalIssues;
		this.log(`📋 Prosa-eval: ${before.totalIssues} problem (tröskel ${PROSE_EVAL_THRESHOLD})`);
		if (before.totalIssues <= PROSE_EVAL_THRESHOLD) return text;

		const fix = await this.orchestrator.runEvalCorrection(text, before.report);
		// The stage's metadata is a change-log the run does not need; the body is the whole
		// point. Its `changes[]` quotes prose fragments, and prose fragments carry quote marks
		// — which is exactly what breaks the JSON. A parse failure must not cost the rewrite.
		const corrected = fix.success ? fix.data?.body : bodyAfterFrontmatter(fix.output);
		if (!corrected) {
			this.skip(gates, "Prosakorrigering", fix.success ? "tomt svar" : fix.error);
			return text;
		}

		const after = evaluateProseText({
			body: corrected,
			title: fm.title,
			scratchDir: this.outputDir,
		});
		if (!after || after.totalIssues >= before.totalIssues) {
			this.skip(
				gates,
				"Prosakorrigering",
				`förbättrade inte texten (${before.totalIssues} → ${after?.totalIssues ?? "?"}) — förkastad`,
			);
			return text;
		}

		gates.proseIssuesAfter = after.totalIssues;
		this.log(
			`   ${before.totalIssues} → ${after.totalIssues} problem` +
				(fix.success ? "" : "  (räddad ur oparsbart svar)"),
		);
		return corrected;
	}

	private skip(
		gates: NonNullable<FordjupningResult["gates"]>,
		stage: string,
		error: string | undefined,
	): void {
		gates.skippedStages.push(stage);
		this.log(`   ⚠️  ${stage} hoppades över: ${error}`);
	}

	/** Assemble the final `---YAML--- body` file content. */
	private serialize(
		fm: FordjupningFrontmatter,
		body: string,
		slug: string,
		svarSlugs: string[],
		essaySlugs: string[],
	): string {
		// A dangling slug crashes the Astro build (the route throws by design), so filter
		// rather than trust the model — it only ever sees the valid list as prose.
		const validSvar = new Set(svarSlugs);
		const validEssays = new Set(essaySlugs);
		const related = (fm.related ?? []).filter((r) => validSvar.has(r) && r !== slug);
		const essays = (fm.essays ?? []).filter((e) => validEssays.has(e));
		const today = new Date().toISOString().slice(0, 10);
		const meta = orderFrontmatter({
			...fm,
			related: related.length > 0 ? related : undefined,
			essays: essays.length > 0 ? essays : undefined,
			publishedAt: `${today}T00:00:00Z`,
		});
		// ⚠️ QUOTE_DOUBLE is load-bearing: an unquoted ISO date is parsed by Astro's
		// frontmatter loader as a YAML timestamp → a JS Date, which fails the collection's
		// z.string() and breaks the build.
		const yaml = yamlStringify(meta, {
			lineWidth: 0,
			defaultStringType: "QUOTE_DOUBLE",
			defaultKeyType: "PLAIN",
		}).trim();
		return `---\n${yaml}\n---\n\n${body}\n`;
	}

	/**
	 * Verify the ARTICLE's own bibliography — the list that actually ships.
	 *
	 * ⚠️ `validateResearch()` guards `research.sources`, a different list produced a stage
	 * earlier. The author writes its own frontmatter `sources` block afterwards and nothing
	 * checked it, so a fabricated link reached `aktenskap.md` and `ramadan.md` under a
	 * "publish" verdict. A citation without a url is correct scholarship; a citation with an
	 * invented one is a forgery, so the url is dropped and the name kept.
	 */
	private async validateArticleSources(
		fm: FordjupningFrontmatter,
		gates: NonNullable<FordjupningResult["gates"]>,
	): Promise<void> {
		const withUrl = (fm.sources ?? []).filter((s) => s.url);
		if (withUrl.length === 0) return;
		this.log(`   Verifierar ${withUrl.length} käll-URL:er i artikelns frontmatter …`);

		const deep = withUrl.filter((s) => UNVERIFIABLE_DEEP_LINK.test(s.url as string));
		const checkable = withUrl.filter((s) => !UNVERIFIABLE_DEEP_LINK.test(s.url as string));
		const { results } = await this.validator.verifyUrls(checkable.map((s) => s.url as string));
		const dead = new Set(results.filter((r) => !r.exists).map((r) => r.url));

		for (const s of fm.sources ?? []) {
			if (!s.url) continue;
			const why = UNVERIFIABLE_DEEP_LINK.test(s.url)
				? "djuplänk som inte går att verifiera"
				: dead.has(s.url)
					? "svarar inte"
					: null;
			if (!why) continue;
			gates.strippedSourceUrls.push(`${s.name} — ${s.url} (${why})`);
			s.url = undefined;
		}
		if (gates.strippedSourceUrls.length > 0) {
			this.log(
				`   ⚠️  Tog bort ${gates.strippedSourceUrls.length} käll-URL:er (källorna står kvar utan länk):`,
			);
			for (const d of gates.strippedSourceUrls) this.log(`      · ${d}`);
			if (deep.length > 0)
				this.log(
					"      Djuplänkar till shamela/islamweb strippas alltid — fyra av fem var fel " +
						"på de första sidorna, och två av dem svarade 200 på fel bok.",
				);
		}
	}

	private write(
		input: FordjupningProduceInput,
		fm: FordjupningFrontmatter,
		body: string,
		svarSlugs: string[],
		essaySlugs: string[],
		gates: NonNullable<FordjupningResult["gates"]>,
	): FordjupningResult {
		const slug = input.slug ?? slugify(fm.term);
		const filePath = join(this.fordjupningDir, `${slug}.md`);
		if (existsSync(filePath) && !input.overwrite) {
			return {
				success: false,
				error: `vägrar skriva över ${slug}.md (använd --overwrite)`,
				gates,
			};
		}
		mkdirSync(this.fordjupningDir, { recursive: true });
		writeFileSync(filePath, this.serialize(fm, body, slug, svarSlugs, essaySlugs), "utf-8");

		return {
			success: true,
			slug,
			filePath,
			frontmatter: fm,
			body,
			wordCount: body.split(/\s+/).filter(Boolean).length,
			gates,
			redirect: input.legacyPath
				? [input.legacyPath.replace(/\/+$/, ""), `/fordjupning/${slug}/`]
				: undefined,
		};
	}
}
