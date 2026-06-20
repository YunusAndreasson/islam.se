import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClaudeRunner, slugify } from "@islam-se/orchestrator";
import { stringify as yamlStringify } from "yaml";
import { type SvarFrontmatter, SvarFrontmatterSchema } from "./svar-schema.js";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

const MODEL_MAP = {
	opus: "claude-opus-4-8",
	sonnet: "claude-sonnet-4-6",
} as const;

// MCP research tools (loaded via .mcp.json) the author/reviewer may call.
const MCP_TOOLS = [
	"mcp__quotes__search_quran",
	"mcp__quotes__search_books",
	"mcp__quotes__search_quotes",
	"mcp__quotes__search_by_filter",
	"mcp__quotes__get_inventory",
	"mcp__quotes__fetch_wikipedia",
];
// Built-in tools restricted to research only — the model must NOT write files
// or run shells; the producer writes the page from the returned text.
const WEB_TOOLS = ["WebSearch", "WebFetch"];

export interface SvarProducerOptions {
	repoRoot: string;
	/** Path to the authoring system prompt (svar-author.md). */
	promptFile: string;
	/** Path to the review/revise system prompt (svar-review.md). Enables pass 2. */
	reviewPromptFile?: string;
	/** Path to .mcp.json so the spawned Claude can reach the quotes MCP server. */
	mcpConfig?: string;
	model?: "opus" | "sonnet";
	/** Thinking effort for the author (draft) run (default "xhigh"). */
	effort?: Effort;
	/** Thinking effort for the review/revise run (default "max" — the quality pass). */
	reviewEffort?: Effort;
	/** Skip pass 2 (the review/revise pass). */
	singlePass?: boolean;
	/** Also write the pre-review draft to a temp file (for before/after comparison). */
	saveDraft?: boolean;
	/** How many times to retry the author on parse/validation failure (default 2). */
	maxAttempts?: number;
}

export interface SvarProduceInput {
	/** The search intent / question to answer, e.g. "Vad är sunna?" */
	question: string;
	/** Explicit slug; otherwise derived from the produced title. */
	slug?: string;
	/** Legacy URL this page replaces — used to propose a redirect. */
	legacyPath?: string;
	/** Overwrite an existing data/svar/<slug>.md. */
	overwrite?: boolean;
}

export interface SvarResult {
	success: boolean;
	slug?: string;
	filePath?: string;
	frontmatter?: SvarFrontmatter;
	body?: string;
	wordCount?: number;
	/** Whether the pass-2 review/revise ran and produced the final page. */
	reviewed?: boolean;
	/** Path to the saved pre-review draft (when saveDraft is set). */
	draftPath?: string;
	/** Proposed [legacyPath, "/svar/<slug>/"] for astro.config customRedirects. */
	redirect?: [string, string];
	raw?: string;
	error?: string;
}

type StageOk = { ok: true; fm: SvarFrontmatter; body: string; raw: string };
type StageErr = { ok: false; error: string; raw: string };

// House-style key order for the YAML frontmatter (matches the hand-written pages).
const KEY_ORDER = [
	"title",
	"question",
	"description",
	"publishedAt",
	"keywords",
	"faq",
	"sources",
	"related",
];

function orderFrontmatter(meta: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const k of KEY_ORDER) if (meta[k] !== undefined) out[k] = meta[k];
	return out;
}

export class SvarProducer {
	private readonly runner = new ClaudeRunner();
	private readonly svarDir: string;

	constructor(private readonly opts: SvarProducerOptions) {
		this.svarDir = join(opts.repoRoot, "data", "svar");
	}

	/** Slugs of answer pages that already exist — the only valid `related` targets. */
	private existingSlugs(): string[] {
		try {
			return readdirSync(this.svarDir)
				.filter((f) => f.endsWith(".md"))
				.map((f) => f.replace(/\.md$/, ""));
		} catch {
			return [];
		}
	}

	async produce(input: SvarProduceInput): Promise<SvarResult> {
		const existing = this.existingSlugs();

		// Pass 1 — author the draft (with retries).
		const draft = await this.author(input, existing);
		if (!draft.ok)
			return { success: false, error: `author failed: ${draft.error}`, raw: draft.raw };

		let draftPath: string | undefined;
		if (this.opts.saveDraft) draftPath = this.writeDraft(input, draft, existing);

		// Pass 2 — adversarial review/revise (the quality pass). Keep the draft if it fails.
		let final = draft;
		let reviewed = false;
		if (!this.opts.singlePass && this.opts.reviewPromptFile) {
			const revised = await this.review(input, existing, draft);
			if (revised.ok) {
				final = revised;
				reviewed = true;
			}
		}

		const res = this.write(input, final.fm, final.body, existing, final.raw);
		return { ...res, reviewed, draftPath };
	}

	/** Run one Claude stage and parse+validate its ---frontmatter---/body output. */
	private async runStage(args: {
		systemPromptFile: string;
		userPrompt: string;
		effort: Effort;
	}): Promise<StageOk | StageErr> {
		const run = await this.runner.run({
			prompt: args.userPrompt,
			systemPrompt: readFileSync(args.systemPromptFile, "utf-8"),
			model: MODEL_MAP[this.opts.model ?? "opus"],
			builtinTools: WEB_TOOLS,
			allowedTools: [...MCP_TOOLS, ...WEB_TOOLS],
			mcpConfig: this.opts.mcpConfig,
			skipPermissions: true,
			noSessionPersistence: true,
			effort: args.effort,
			timeout: 1_800_000,
		});
		if (!(run.success && run.output))
			return { ok: false, error: run.error ?? "no output", raw: "" };

		const parsed = this.runner.parseMarkdownWithMeta(run.output);
		if (!parsed)
			return {
				ok: false,
				error: "could not parse the ---frontmatter---/body block",
				raw: run.output,
			};
		const v = SvarFrontmatterSchema.safeParse(parsed.meta);
		if (!v.success)
			return {
				ok: false,
				error: `frontmatter invalid: ${v.error.issues
					.map((i) => `${i.path.join(".")}: ${i.message}`)
					.join("; ")}`,
				raw: run.output,
			};
		const body = parsed.body.trim();
		if (body.length < 400)
			return { ok: false, error: `body too short (${body.length} chars)`, raw: run.output };
		return { ok: true, fm: v.data, body, raw: run.output };
	}

	private async author(input: SvarProduceInput, existing: string[]): Promise<StageOk | StageErr> {
		const maxAttempts = this.opts.maxAttempts ?? 2;
		let last: StageErr = { ok: false, error: "author did not run", raw: "" };
		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			const r = await this.runStage({
				systemPromptFile: this.opts.promptFile,
				userPrompt: this.buildAuthorPrompt(input, existing, attempt, last.error),
				effort: this.opts.effort ?? "xhigh",
			});
			if (r.ok) return r;
			last = r;
		}
		return last;
	}

	private async review(
		input: SvarProduceInput,
		existing: string[],
		draft: StageOk,
	): Promise<StageOk | StageErr> {
		if (!this.opts.reviewPromptFile) return { ok: false, error: "no review prompt", raw: "" };
		return this.runStage({
			systemPromptFile: this.opts.reviewPromptFile,
			userPrompt: this.buildReviewPrompt(input, existing, draft),
			effort: this.opts.reviewEffort ?? "max",
		});
	}

	private buildAuthorPrompt(
		input: SvarProduceInput,
		existing: string[],
		attempt: number,
		lastError: string,
	): string {
		const lines = [`FRÅGA / SÖKINTENTION att besvara: "${input.question}"`];
		if (input.slug) lines.push(`Föreslagen slug: ${input.slug}`);
		if (input.legacyPath)
			lines.push(
				`Denna sida ärver rankingen från den gamla URL:en ${input.legacyPath} (301:as hit).`,
			);
		if (existing.length > 0)
			lines.push(
				`\nVälj 1–3 värden till \`related\` ENBART ur denna lista över befintliga svarssidor (annars utelämna):\n${existing.map((s) => `  - ${s}`).join("\n")}`,
			);
		if (attempt > 1 && lastError)
			lines.push(
				`\n⚠️ FÖRRA FÖRSÖKET underkändes: ${lastError}\nRätta felet och följ utdataformatet exakt (---JSON-frontmatter--- följt av markdown-brödtext).`,
			);
		return lines.join("\n");
	}

	private buildReviewPrompt(input: SvarProduceInput, existing: string[], draft: StageOk): string {
		const draftMd = `---\n${JSON.stringify(draft.fm, null, 2)}\n---\n\n${draft.body}`;
		const lines = [`FRÅGA / SÖKINTENTION: "${input.question}"`];
		if (existing.length > 0)
			lines.push(
				`Giltiga \`related\`-slugs (ENBART dessa befintliga sidor får användas): ${existing.join(", ")}`,
			);
		lines.push(
			"\nNedan följer ett UTKAST till svarssida. Granska det hårt mot kvalitetsribban i systemprompten och returnera HELA den FÖRBÄTTRADE sidan i exakt samma format (---JSON-frontmatter--- följt av markdown-brödtext). Behåll allt som redan är korrekt och välkällat.",
			`\n--- UTKAST ---\n${draftMd}`,
		);
		return lines.join("\n");
	}

	private writeDraft(input: SvarProduceInput, draft: StageOk, existing: string[]): string {
		const slug = input.slug ?? slugify(draft.fm.title);
		// Temp dir, NOT data/svar — the collection glob would otherwise load it as a page.
		const path = join(tmpdir(), `svar-${slug}.draft.md`);
		writeFileSync(path, this.serialize(draft.fm, draft.body, slug, existing), "utf-8");
		return path;
	}

	/** Assemble the final `---YAML--- body` file content. */
	private serialize(fm: SvarFrontmatter, body: string, slug: string, existing: string[]): string {
		// Drop any `related` slugs that don't exist — a dangling ref crashes the build.
		const valid = new Set(existing.filter((s) => s !== slug));
		const related = (fm.related ?? []).filter((r) => valid.has(r));
		const today = new Date().toISOString().slice(0, 10);
		const meta = orderFrontmatter({
			...fm,
			related: related.length > 0 ? related : undefined,
			publishedAt: `${today}T00:00:00Z`,
		});
		// QUOTE_DOUBLE on values is required, not cosmetic: an unquoted ISO date is parsed
		// by Astro's frontmatter loader as a YAML timestamp → a JS Date, which fails the
		// collection's `z.string()` and breaks the build. Quoting keeps it a string (and
		// matches the hand-written pages, which quote every scalar). Keys stay plain.
		const yaml = yamlStringify(meta, {
			lineWidth: 0,
			defaultStringType: "QUOTE_DOUBLE",
			defaultKeyType: "PLAIN",
		}).trim();
		return `---\n${yaml}\n---\n\n${body}\n`;
	}

	private write(
		input: SvarProduceInput,
		fm: SvarFrontmatter,
		body: string,
		existing: string[],
		raw: string,
	): SvarResult {
		const slug = input.slug ?? slugify(fm.title);
		const filePath = join(this.svarDir, `${slug}.md`);
		if (existsSync(filePath) && !input.overwrite)
			return {
				success: false,
				error: `refusing to overwrite existing ${slug}.md (use overwrite)`,
				raw,
			};

		writeFileSync(filePath, this.serialize(fm, body, slug, existing), "utf-8");

		const valid = new Set(existing.filter((s) => s !== slug));
		const related = (fm.related ?? []).filter((r) => valid.has(r));
		const redirect: [string, string] | undefined = input.legacyPath
			? [input.legacyPath.replace(/\/+$/, ""), `/svar/${slug}/`]
			: undefined;

		return {
			success: true,
			slug,
			filePath,
			frontmatter: { ...fm, related },
			body,
			wordCount: body.split(/\s+/).filter(Boolean).length,
			redirect,
			raw,
		};
	}
}
