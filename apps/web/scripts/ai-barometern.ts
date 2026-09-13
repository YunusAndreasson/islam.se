/**
 * ai-barometern — ask the main AI model families the same questions, run after run, and
 * commit every answer to the repo so /ai-barometern/ can chart how they move.
 *
 * Run BY HAND from the repo root (`pnpm ai-barometern <command>`):
 *
 *   status                               key budget, pinned models, pending releases, last run
 *   init chatgpt=<id> claude=<id> …      first setup: baseline the catalogue, pin one model per family
 *   models                               check OpenRouter for new releases (exit 3 while any is pending)
 *   adopt <family> <id> --reason "…"     switch a family to another model (dated in models.json)
 *   ignore <id> --note "…"               record a release as not relevant
 *   probe [--question <id>]              one answer per family, to measure real cost
 *   pilot --questions a,b --judges x,y   compare answer formats A/B/C before locking one
 *   run [--max-cost 5] [--commit]        the measurement itself
 *   run --new [--commit]                 ask only the questions no finished run has asked
 *   review [--run <id>] [--approve <key>] [--hide <key>]
 *   rebuild                              regenerate series.json / latest.json from the runs
 *
 * The key is OPENROUTER_API_KEY, from the environment or the repo-root .env.
 *
 * WHY A RUN REFUSES TO START WHILE A RELEASE IS PENDING. The barometer's claim is "this is
 * what ChatGPT answered", and that claim silently goes stale the week OpenAI ships a new
 * model. Every run therefore re-reads the catalogue first; any new chat model in a tracked
 * namespace is logged as pending, and nothing is measured until a human has adopted or
 * ignored it. The switch date is what lets a chart mark "new model" at the right point.
 *
 * WHY EACH ANSWER IS SAVED THE MOMENT IT ARRIVES. A run is a few hundred paid calls. A
 * crash, a budget stop or a Ctrl-C must cost nothing already paid for: the run file is
 * rewritten after every answer and `run --resume <id>` asks only what is missing.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
	adoptModel,
	baselineCatalogue,
	type CatalogueDiff,
	diffCatalogue,
	emptyModelsFile,
	ignoreModel,
	isoDateFromUnix,
	pendingModels,
} from "../src/lib/ai-barometern/catalogue";
import { buildLatest, buildSeries, sortRuns } from "../src/lib/ai-barometern/derive";
import { FAMILY_KEYS, getFamily, OWN_PROVIDER } from "../src/lib/ai-barometern/families";
import { gateHits } from "../src/lib/ai-barometern/gate";
import {
	type ChatResult,
	chatCompletion,
	fetchCatalogue,
	fetchKeyStatus,
} from "../src/lib/ai-barometern/openrouter";
import { type ParsedAnswer, parseForcedAnswer } from "../src/lib/ai-barometern/parse";
import {
	buildJudgePrompt,
	buildPrompt,
	buildRequestBody,
	DEFAULT_MAX_TOKENS,
	optionsFor,
	PROMPT_VERSION,
	SCALE_OPTIONS,
	textSha256,
} from "../src/lib/ai-barometern/prompt";
import { activeQuestions, QUESTIONS } from "../src/lib/ai-barometern/questions";
import {
	type Answer,
	type AnswerText,
	answerKey,
	type CatalogueModel,
	type FamilyKey,
	type ModelsFile,
	type Outcome,
	type Question,
	questionKey,
	type RequestSettings,
	type RunFile,
	type RunModel,
	type TextsFile,
	type Usage,
	type Variant,
} from "../src/lib/ai-barometern/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB = join(__dirname, "..");
const REPO = join(WEB, "../..");
const DATA = join(WEB, "src/data/ai-barometern");
const DATA_REL = "apps/web/src/data/ai-barometern";
const MODELS_PATH = join(DATA, "models.json");
const RUNS = join(DATA, "runs");
const INDEX_PATH = join(DATA, "index.json");
const SERIES_PATH = join(DATA, "series.json");
const LATEST_PATH = join(DATA, "latest.json");
const PILOTS = join(REPO, "data/ai-barometern-pilot");

const OUTCOMES: readonly Outcome[] = ["answered", "abstained", "refused", "invalid", "error"];
const ZERO: Usage = { promptTokens: 0, completionTokens: 0, reasoningTokens: 0, costUsd: 0 };

// ── small helpers ────────────────────────────────────────────────────────────────────

const envFile = join(REPO, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

function fail(message: string, code = 1): never {
	console.error(message);
	process.exit(code);
}

function apiKey(): string {
	const key = process.env.OPENROUTER_API_KEY;
	if (!key) fail("OPENROUTER_API_KEY saknas – lägg den i repo-rotens .env eller i miljön.");
	return key;
}

/** Today in Stockholm, YYYY-MM-DD. */
function today(): string {
	return new Intl.DateTimeFormat("sv-SE", {
		timeZone: "Europe/Stockholm",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date());
}

function usd(n: number): string {
	return `$${n.toFixed(n < 1 ? 4 : 2)}`;
}

function pct(part: number, whole: number): string {
	return whole === 0 ? "–" : `${Math.round((part / whole) * 100)}%`;
}

function table(rows: readonly (readonly string[])[]): string {
	const widths: number[] = [];
	for (const row of rows) {
		row.forEach((cell, i) => {
			widths[i] = Math.max(widths[i] ?? 0, cell.length);
		});
	}
	return rows.map((row) => row.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join("  ")).join("\n");
}

async function readJson<T>(path: string): Promise<T> {
	return JSON.parse(await readFile(path, "utf8")) as T;
}

/** Write via a temp file and rename, so a crash never leaves half a JSON file behind. */
async function writeJson(path: string, value: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const tmp = `${path}.tmp`;
	await writeFile(tmp, `${JSON.stringify(value, null, "\t")}\n`);
	await rename(tmp, path);
}

async function loadModels(): Promise<ModelsFile> {
	return existsSync(MODELS_PATH) ? readJson<ModelsFile>(MODELS_PATH) : emptyModelsFile();
}

function questionById(id: string): Question {
	const q = QUESTIONS.find((x) => x.id === id && !x.retired);
	if (!q) fail(`Okänd fråga: ${id} (se src/lib/ai-barometern/questions.ts)`);
	return q;
}

function addUsage(a: Usage, b: Usage): Usage {
	return {
		promptTokens: a.promptTokens + b.promptTokens,
		completionTokens: a.completionTokens + b.completionTokens,
		reasoningTokens: a.reasoningTokens + b.reasoningTokens,
		costUsd: a.costUsd + b.costUsd,
	};
}

function runModel(m: CatalogueModel): RunModel {
	return {
		id: m.id,
		canonicalSlug: m.canonical_slug,
		name: m.name,
		created: isoDateFromUnix(m.created),
		knowledgeCutoff: m.knowledge_cutoff ?? null,
		pricing: { prompt: m.pricing.prompt, completion: m.pricing.completion },
	};
}

function settings(variant: Variant, samples: number): RequestSettings {
	return {
		variant,
		promptVersion: PROMPT_VERSION,
		samples,
		reasoningEffort: "low",
		maxTokens: DEFAULT_MAX_TOKENS,
		responseFormat: "json_schema",
		requireParameters: true,
		temperature: null,
		systemPrompt: null,
		webSearch: false,
		ownProvider: { ...OWN_PROVIDER },
	};
}

function printDiff(diff: CatalogueDiff): void {
	for (const a of diff.added) {
		console.log(
			`  ＋ ny i ${getFamily(a.family).label}: ${a.id} (${a.name}, publicerad ${a.created})`,
		);
	}
	for (const r of diff.removed) console.log(`  − borta ur katalogen: ${r.id}`);
	for (const w of diff.warnings) console.log(`  ⚠️  ${w}`);
}

/** Run `worker` over `items` with a fixed number of concurrent lanes. A worker returning
 *  false stops new work from being scheduled; lanes already mid-call finish. */
async function pool<T>(
	items: readonly T[],
	concurrency: number,
	worker: (item: T) => Promise<boolean>,
): Promise<void> {
	let next = 0;
	let stopped = false;
	const lane = async () => {
		while (!stopped && next < items.length) {
			const item = items[next];
			next += 1;
			if (item === undefined) break;
			if (!(await worker(item))) stopped = true;
		}
	};
	await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, lane));
}

// ── asking one sample ────────────────────────────────────────────────────────────────

interface Asked {
	parsed: ParsedAnswer;
	last: ChatResult;
	usage: Usage;
	latencyMs: number;
	attempts: number;
	raw: string | null;
}

/** One sample, with the two retries that are about the ANSWER rather than transport
 *  (transport retries live in chatCompletion): an empty reply cut off by the token limit
 *  is asked again with double the budget, and an answer outside the options is asked
 *  once more from scratch. Usage from every round is kept, because every round is billed. */
async function ask(
	key: string,
	model: string,
	prompt: string,
	options: readonly string[],
	ownProvider?: string,
): Promise<Asked> {
	let maxTokens = DEFAULT_MAX_TOKENS;
	let usage = ZERO;
	let latencyMs = 0;
	let attempts = 0;
	let raw: string | null = null;
	let last: ChatResult = {
		ok: false,
		error: "inte ställd",
		status: null,
		latencyMs: 0,
		attempts: 0,
	};
	let parsed: ParsedAnswer = { outcome: "error", option: null, motivation: null };

	for (let round = 0; round < 2; round++) {
		last = await chatCompletion(
			key,
			buildRequestBody(model, prompt, options, maxTokens, ownProvider),
		);
		attempts += last.attempts;
		latencyMs += last.latencyMs;
		if (!last.ok) {
			parsed = { outcome: "error", option: null, motivation: null };
			break;
		}
		usage = addUsage(usage, last.usage);
		raw = last.content;
		if (options.length === 0) {
			const text = last.content?.trim() ?? "";
			if (last.refusal || last.finishReason === "content_filter") {
				parsed = { outcome: "refused", option: null, motivation: last.refusal };
			} else {
				parsed = text
					? { outcome: "answered", option: null, motivation: text }
					: { outcome: "error", option: null, motivation: null };
			}
		} else {
			parsed = parseForcedAnswer(last.content, options, {
				refusal: last.refusal,
				finishReason: last.finishReason,
			});
		}
		if (parsed.outcome === "error" && last.finishReason === "length") {
			maxTokens *= 2;
			continue;
		}
		if (parsed.outcome === "invalid") continue;
		break;
	}
	return { parsed, last, usage, latencyMs, attempts, raw };
}

function toAnswer(
	q: Question,
	family: FamilyKey,
	sample: number,
	asked: Asked,
	options: readonly string[],
): Answer {
	const answer: Answer = {
		q: questionKey(q),
		family,
		sample,
		outcome: asked.parsed.outcome,
		option: asked.parsed.option,
		finishReason: asked.last.ok ? asked.last.finishReason : null,
		responseModel: asked.last.ok ? asked.last.responseModel : null,
		provider: asked.last.ok ? asked.last.provider : null,
		generationId: asked.last.ok ? asked.last.generationId : null,
		usage: asked.usage,
		latencyMs: asked.latencyMs,
		attempts: asked.attempts,
	};
	if (q.kind === "party" && options.length > 0) answer.optionOrder = [...options];
	if (!asked.last.ok) answer.error = asked.last.error;
	else if (asked.parsed.outcome === "invalid") answer.error = "svar utanför alternativen";
	return answer;
}

// ── status / init / models / adopt / ignore ─────────────────────────────────────────

async function cmdStatus(): Promise<void> {
	const models = await loadModels();
	console.log("Modeller:");
	console.log(
		table(
			FAMILY_KEYS.map((k) => {
				const slot = models.families[k];
				const since = slot.history.at(-1)?.adoptedAt ?? "–";
				return [getFamily(k).label, slot.current ?? "(ingen vald)", `sedan ${since}`];
			}),
		),
	);
	const pending = pendingModels(models);
	console.log(
		`\nSenaste katalogkontroll: ${models.lastChecked ?? "aldrig"} · väntande släpp: ${pending.length}`,
	);
	for (const p of pending) console.log(`  ${getFamily(p.family).label}: ${p.id} (${p.created})`);

	if (existsSync(INDEX_PATH)) {
		const index = await readJson<{ runs: string[] }>(INDEX_PATH);
		console.log(`Mätningar: ${index.runs.length} · senaste: ${index.runs.at(-1) ?? "–"}`);
	} else {
		console.log("Mätningar: inga ännu");
	}

	if (process.env.OPENROUTER_API_KEY) {
		const key = await fetchKeyStatus(process.env.OPENROUTER_API_KEY);
		const remaining = key.limitRemaining === null ? "ingen gräns" : usd(key.limitRemaining);
		console.log(`Nyckel: använt ${usd(key.usage)} · kvar under gränsen: ${remaining}`);
	} else {
		console.log("Nyckel: OPENROUTER_API_KEY saknas");
	}
}

async function cmdInit(args: string[]): Promise<void> {
	const { values, positionals } = parseArgs({
		args,
		allowPositionals: true,
		options: { force: { type: "boolean", default: false }, reason: { type: "string" } },
	});
	const current = await loadModels();
	if (current.seen.length > 0 && !values.force) {
		fail(
			"models.json finns redan. Använd `adopt` för att byta modell, eller --force för att börja om.",
		);
	}
	const picks = new Map<FamilyKey, string>();
	for (const arg of positionals) {
		const [family, id] = arg.split("=");
		if (!(family && id && FAMILY_KEYS.includes(family as FamilyKey))) {
			fail(`Förväntade familj=modell-id, fick »${arg}«`);
		}
		picks.set(family as FamilyKey, id);
	}
	const missing = FAMILY_KEYS.filter((k) => !picks.has(k));
	if (missing.length > 0) fail(`Ange en modell för varje familj; saknas: ${missing.join(", ")}`);

	const catalogue = await fetchCatalogue();
	const byId = new Map(catalogue.map((m) => [m.id, m]));
	const date = today();
	let file = baselineCatalogue(emptyModelsFile(), catalogue, date);
	for (const [family, id] of picks) {
		const model = byId.get(id);
		if (!model) fail(`${id} finns inte i OpenRouters katalog`);
		file = adoptModel(file, family, model, date, values.reason ?? "Startuppsättning");
	}
	await writeJson(MODELS_PATH, file);
	console.log(`Loggade ${file.seen.length} befintliga modeller och valde:`);
	for (const k of FAMILY_KEYS) console.log(`  ${getFamily(k).label}: ${file.families[k].current}`);
	console.log(`\nSkrev ${MODELS_PATH}`);
}

async function checkCatalogue(): Promise<{ diff: CatalogueDiff; catalogue: CatalogueModel[] }> {
	const catalogue = await fetchCatalogue();
	const diff = diffCatalogue(await loadModels(), catalogue, today());
	await writeJson(MODELS_PATH, diff.file);
	return { diff, catalogue };
}

async function cmdModels(): Promise<void> {
	const { diff } = await checkCatalogue();
	console.log(`Katalogen kontrollerad ${diff.file.lastChecked}.`);
	printDiff(diff);
	const pending = pendingModels(diff.file);
	if (pending.length === 0) {
		console.log("Inga släpp väntar på beslut.");
		return;
	}
	console.log(`\n${pending.length} släpp väntar på beslut:`);
	console.log(
		table(pending.map((p) => [getFamily(p.family).label, p.id, p.name, `publicerad ${p.created}`])),
	);
	console.log(
		'\nByt modell:  pnpm ai-barometern adopt <familj> <id> --reason "…"\nAvstå:       pnpm ai-barometern ignore <id> --note "…"',
	);
	process.exit(3);
}

async function cmdAdopt(args: string[]): Promise<void> {
	const { values, positionals } = parseArgs({
		args,
		allowPositionals: true,
		options: { reason: { type: "string" } },
	});
	const [family, id] = positionals;
	if (!(family && id && FAMILY_KEYS.includes(family as FamilyKey))) {
		fail(`Användning: adopt <${FAMILY_KEYS.join("|")}> <modell-id> --reason "…"`);
	}
	if (!values.reason) fail("Ange --reason: varför byts modellen?");
	const { diff, catalogue } = await checkCatalogue();
	const model = catalogue.find((m) => m.id === id);
	if (!model) fail(`${id} finns inte i OpenRouters katalog`);
	const file = adoptModel(diff.file, family as FamilyKey, model, today(), values.reason);
	await writeJson(MODELS_PATH, file);
	console.log(`${getFamily(family as FamilyKey).label} använder nu ${id} (från ${today()}).`);
}

async function cmdIgnore(args: string[]): Promise<void> {
	const { values, positionals } = parseArgs({
		args,
		allowPositionals: true,
		options: { note: { type: "string" } },
	});
	const [id] = positionals;
	if (!(id && values.note)) fail('Användning: ignore <modell-id> --note "…"');
	await writeJson(MODELS_PATH, ignoreModel(await loadModels(), id, today(), values.note));
	console.log(`Loggade ${id} som ej aktuell.`);
}

async function pinnedModels(
	models: ModelsFile,
	catalogue: readonly CatalogueModel[],
): Promise<Record<FamilyKey, RunModel>> {
	const byId = new Map(catalogue.map((m) => [m.id, m]));
	const out = {} as Record<FamilyKey, RunModel>;
	for (const k of FAMILY_KEYS) {
		const id = models.families[k].current;
		if (!id) fail(`${getFamily(k).label} har ingen vald modell – kör init.`);
		const m = byId.get(id);
		if (!m)
			fail(`${id} (${getFamily(k).label}) finns inte längre i katalogen – välj en ny med adopt.`);
		out[k] = runModel(m);
	}
	return out;
}

// ── probe ────────────────────────────────────────────────────────────────────────────

async function cmdProbe(args: string[]): Promise<void> {
	const { values } = parseArgs({
		args,
		options: { question: { type: "string", default: "minska-invandringen" } },
	});
	const key = apiKey();
	const q = questionById(values.question);
	const models = await pinnedModels(await loadModels(), await fetchCatalogue());
	const before = await fetchKeyStatus(key);

	console.log(`Provfråga: »${q.text}« (variant A, ett svar per familj)\n`);
	const results = await Promise.all(
		FAMILY_KEYS.map(async (family) => {
			const options = optionsFor(q, "A", `probe:${q.id}:${family}`);
			const asked = await ask(
				key,
				models[family].id,
				buildPrompt(q, "A", options),
				options,
				OWN_PROVIDER[family],
			);
			return { family, asked };
		}),
	);

	const perRun = activeQuestions().length * 3;
	let total = 0;
	const rows = [
		[
			"familj",
			"modell",
			"utfall",
			"svar",
			"in",
			"ut",
			"resonemang",
			"kostnad",
			"tid",
			"värd",
			"per mätning",
		],
	];
	for (const { family, asked } of results) {
		total += asked.usage.costUsd * perRun;
		rows.push([
			getFamily(family).label,
			asked.last.ok ? (asked.last.responseModel ?? "?") : models[family].id,
			asked.parsed.outcome,
			asked.parsed.option ?? "–",
			String(asked.usage.promptTokens),
			String(asked.usage.completionTokens),
			String(asked.usage.reasoningTokens),
			usd(asked.usage.costUsd),
			`${(asked.latencyMs / 1000).toFixed(1)} s`,
			asked.last.ok ? (asked.last.provider ?? "?") : "–",
			usd(asked.usage.costUsd * perRun),
		]);
	}
	console.log(table(rows));
	for (const { family, asked } of results) {
		const text = asked.parsed.motivation ?? (asked.last.ok ? "" : asked.last.error);
		console.log(`\n${getFamily(family).label}: ${text}`);
	}
	const after = await fetchKeyStatus(key);
	console.log(
		`\nBeräknad kostnad för en mätning (${activeQuestions().length} frågor × 3 svar × 5 modeller): ${usd(total)}`,
	);
	console.log(
		`Nyckelns förbrukning under provet: ${usd(after.usage - before.usage)} (kan släpa efter)`,
	);
}

// ── pilot ────────────────────────────────────────────────────────────────────────────

interface JudgeCode {
	judge: string;
	outcome: Outcome;
	option: string | null;
	costUsd: number;
}

interface PilotAnswer extends Answer {
	variant: Variant;
	motivation: string | null;
	raw: string | null;
	judged?: JudgeCode[];
}

interface PilotFile {
	id: string;
	startedAt: string;
	finishedAt: string | null;
	promptVersion: string;
	samples: number;
	variants: Variant[];
	questions: string[];
	models: Record<FamilyKey, string>;
	judges: string[];
	answers: PilotAnswer[];
	costUsd: number;
}

const pilotKey = (a: { variant: Variant; q: string; family: FamilyKey; sample: number }) =>
	`${a.variant}|${a.q}|${a.family}|${a.sample}`;

async function cmdPilot(args: string[]): Promise<void> {
	const { values } = parseArgs({
		args,
		options: {
			questions: { type: "string" },
			variants: { type: "string", default: "A,B,C" },
			samples: { type: "string", default: "3" },
			judges: { type: "string" },
			"max-cost": { type: "string", default: "3" },
			concurrency: { type: "string", default: "4" },
			report: { type: "string" },
		},
	});
	if (values.report) {
		const file = await readJson<PilotFile>(values.report);
		console.log(pilotReport(file));
		return;
	}
	const key = apiKey();
	if (!values.questions) fail("Ange --questions id,id,… (se questions.ts)");
	const questions = values.questions.split(",").map((id) => questionById(id.trim()));
	const variants = values.variants.split(",").map((v) => v.trim()) as Variant[];
	if (variants.some((v) => !["A", "B", "C"].includes(v))) fail("--variants tar A, B och/eller C");
	const judges = (values.judges ?? "")
		.split(",")
		.map((j) => j.trim())
		.filter(Boolean);
	if (variants.includes("C") && judges.length === 0) {
		fail("Variant C behöver --judges: modeller utanför panelen som kodar de fria svaren.");
	}
	const samples = Number(values.samples);
	const maxCost = Number(values["max-cost"]);

	const catalogue = await fetchCatalogue();
	const models = await pinnedModels(await loadModels(), catalogue);
	for (const j of judges) {
		if (!catalogue.some((m) => m.id === j)) fail(`Domaren ${j} finns inte i katalogen`);
	}

	const path = join(PILOTS, `${today()}.json`);
	const pilot: PilotFile = existsSync(path)
		? await readJson<PilotFile>(path)
		: {
				id: today(),
				startedAt: new Date().toISOString(),
				finishedAt: null,
				promptVersion: PROMPT_VERSION,
				samples,
				variants,
				questions: questions.map(questionKey),
				models: Object.fromEntries(FAMILY_KEYS.map((k) => [k, models[k].id])) as Record<
					FamilyKey,
					string
				>,
				judges,
				answers: [],
				costUsd: 0,
			};
	const done = new Set(pilot.answers.map(pilotKey));
	const tasks = variants.flatMap((variant) =>
		questions.flatMap((q) =>
			Array.from({ length: samples }, (_, i) => i + 1).flatMap((sample) =>
				FAMILY_KEYS.map((family) => ({ variant, q, family, sample })),
			),
		),
	);
	const todo = tasks.filter((t) => !done.has(pilotKey({ ...t, q: questionKey(t.q) })));
	console.log(`Pilot: ${todo.length} av ${tasks.length} anrop kvar, budget ${usd(maxCost)}\n`);

	let saving = Promise.resolve();
	const save = () => {
		saving = saving.then(() => writeJson(path, pilot));
		return saving;
	};

	await pool(todo, Number(values.concurrency), async (t) => {
		if (pilot.costUsd >= maxCost) return false;
		const options = optionsFor(
			t.q,
			t.variant,
			`pilot:${pilot.id}:${t.variant}:${t.q.id}:${t.family}:${t.sample}`,
		);
		const asked = await ask(
			key,
			models[t.family].id,
			buildPrompt(t.q, t.variant, options),
			options,
		);
		const answer: PilotAnswer = {
			...toAnswer(t.q, t.family, t.sample, asked, options),
			variant: t.variant,
			motivation: asked.parsed.motivation,
			raw: asked.raw,
		};
		pilot.costUsd += asked.usage.costUsd;

		if (t.variant === "C" && asked.parsed.outcome === "answered" && asked.parsed.motivation) {
			const codeOptions = optionsFor(t.q, "A");
			answer.judged = [];
			for (const judge of judges) {
				const coded = await ask(
					key,
					judge,
					buildJudgePrompt(t.q, asked.parsed.motivation, codeOptions),
					codeOptions,
				);
				pilot.costUsd += coded.usage.costUsd;
				answer.judged.push({
					judge,
					outcome: coded.parsed.outcome,
					option: coded.parsed.option,
					costUsd: coded.usage.costUsd,
				});
			}
		}

		pilot.answers.push(answer);
		await save();
		console.log(
			`[${pilot.answers.length}/${tasks.length}] ${t.variant} ${getFamily(t.family).label.padEnd(8)} ${t.q.id} #${t.sample}  ${answer.option ?? answer.outcome}  ${usd(pilot.costUsd)}`,
		);
		return true;
	});

	if (pilot.answers.length === tasks.length) pilot.finishedAt = new Date().toISOString();
	await save();
	const report = pilotReport(pilot);
	await writeFile(path.replace(/\.json$/, ".md"), `${report}\n`);
	console.log(`\n${report}`);
	console.log(`\nSkrev ${path} och rapporten bredvid.`);
	if (!pilot.finishedAt) {
		console.log(
			"Piloten stannade vid budgeten; kör samma kommando igen med högre --max-cost för att fortsätta.",
		);
	}
}

const SCALE_VALUE = new Map<string, number>(SCALE_OPTIONS.map((o, i) => [o, 2 - i]));

/** A C answer's code: the judges' option when they agree, else null (disagreement). */
function judgedOption(a: PilotAnswer): string | null {
	const options = (a.judged ?? []).map((j) => j.option);
	if (options.length === 0 || options.some((o) => o === null)) return null;
	return options.every((o) => o === options[0]) ? (options[0] ?? null) : null;
}

function mode(values: readonly (string | null)[]): string | null {
	const counts = new Map<string, number>();
	for (const v of values) if (v !== null) counts.set(v, (counts.get(v) ?? 0) + 1);
	let best: string | null = null;
	let bestCount = 0;
	for (const [v, c] of counts) {
		if (c > bestCount) {
			best = v;
			bestCount = c;
		}
	}
	return best;
}

function median(values: readonly number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	if (sorted.length === 0) return 0;
	return sorted.length % 2 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one report, read top to bottom
function pilotReport(p: PilotFile): string {
	const out: string[] = [`# Pilot ${p.id}`, ""];
	out.push(
		`${p.answers.length} svar · ${p.questions.length} frågor · varianter ${p.variants.join(", ")} · ${p.samples} svar per cell · kostnad ${usd(p.costUsd)}`,
		"",
		"A = tvingat val med Avstår · B = tvingat val utan Avstår · C = fritt svar, kodat av domarna " +
			p.judges.join(", "),
		"",
	);

	for (const variant of p.variants) {
		out.push(`## Variant ${variant}`, "");
		const rows = [
			[
				"familj",
				"svar",
				"tog ställning",
				"avstod",
				"vägrade/fel",
				"varken eller",
				"samstämmighet",
				"kostnad/svar",
				"resonemang",
				"median tid",
			],
		];
		for (const family of FAMILY_KEYS) {
			const answers = p.answers.filter((a) => a.variant === variant && a.family === family);
			if (answers.length === 0) continue;
			const coded = answers.map((a) => (variant === "C" ? judgedOption(a) : a.option));
			const abstained = coded.filter((o) => o === "Avstår").length;
			const failed = answers.filter((a) =>
				["refused", "invalid", "error"].includes(a.outcome),
			).length;
			const took = coded.filter((o) => o !== null && o !== "Avstår").length;
			const neutral = coded.filter((o) => o === "Varken eller").length;
			const cells = new Map<string, (string | null)[]>();
			answers.forEach((a, i) => {
				cells.set(a.q, [...(cells.get(a.q) ?? []), coded[i] ?? null]);
			});
			const consistent = [...cells.values()].filter(
				(v) => v.length > 1 && v[0] !== null && v.every((x) => x === v[0]),
			).length;
			rows.push([
				FAMILY_KEYS.includes(family) ? getFamily(family).label : family,
				String(answers.length),
				pct(took, answers.length),
				pct(abstained, answers.length),
				pct(failed, answers.length),
				pct(neutral, answers.length),
				pct(consistent, cells.size),
				usd(answers.reduce((s, a) => s + a.usage.costUsd, 0) / answers.length),
				String(
					Math.round(answers.reduce((s, a) => s + a.usage.reasoningTokens, 0) / answers.length),
				),
				`${(median(answers.map((a) => a.latencyMs)) / 1000).toFixed(1)} s`,
			]);
		}
		out.push("```", table(rows), "```", "");
		if (variant === "C") {
			const judgedAnswers = p.answers.filter(
				(a) => a.variant === "C" && (a.judged?.length ?? 0) > 1,
			);
			const agree = judgedAnswers.filter((a) => judgedOption(a) !== null).length;
			out.push(`Domarna var överens om ${pct(agree, judgedAnswers.length)} av de fria svaren.`, "");
		}
	}

	if (p.variants.includes("A") && p.variants.includes("C")) {
		out.push("## Tvingat (A) mot fritt (C)", "");
		let cells = 0;
		let differ = 0;
		const deltas: number[] = [];
		const rows = [["fråga", "familj", "A", "C"]];
		for (const q of p.questions) {
			for (const family of FAMILY_KEYS) {
				const a = mode(
					p.answers
						.filter((x) => x.variant === "A" && x.q === q && x.family === family)
						.map((x) => x.option),
				);
				const c = mode(
					p.answers
						.filter((x) => x.variant === "C" && x.q === q && x.family === family)
						.map(judgedOption),
				);
				if (a === null || c === null) continue;
				cells += 1;
				if (a !== c) {
					differ += 1;
					rows.push([q, getFamily(family).label, a, c]);
				}
				const va = SCALE_VALUE.get(a);
				const vc = SCALE_VALUE.get(c);
				if (va !== undefined && vc !== undefined) deltas.push(Math.abs(va - vc));
			}
		}
		const meanDelta = deltas.length ? deltas.reduce((s, d) => s + d, 0) / deltas.length : 0;
		out.push(
			`A och C gav olika typsvar i ${differ} av ${cells} celler (${pct(differ, cells)}). Medelavstånd på skalan: ${meanDelta.toFixed(2)} steg.`,
			"",
		);
		if (rows.length > 1) out.push("```", table(rows), "```", "");
	}

	out.push("## Exempel på motiveringar", "");
	const firstQ = p.questions[0];
	for (const family of FAMILY_KEYS) {
		out.push(`### ${getFamily(family).label}`);
		for (const variant of p.variants) {
			const a = p.answers.find(
				(x) => x.variant === variant && x.q === firstQ && x.family === family && x.sample === 1,
			);
			if (!a) continue;
			const label =
				variant === "C" ? (judgedOption(a) ?? "domarna oense") : (a.option ?? a.outcome);
			out.push(`- **${variant}** (${label}): ${a.motivation ?? a.error ?? "–"}`);
		}
		out.push("");
	}
	return out.join("\n");
}

// ── run ──────────────────────────────────────────────────────────────────────────────

async function nextRunId(date: string): Promise<string> {
	if (!existsSync(join(RUNS, date))) return date;
	for (let i = 2; ; i++) {
		const id = `${date}-${i}`;
		if (!existsSync(join(RUNS, id))) return id;
	}
}

function totalsOf(answers: readonly Answer[]): RunFile["totals"] {
	const byOutcome = Object.fromEntries(OUTCOMES.map((o) => [o, 0])) as Record<Outcome, number>;
	let costUsd = 0;
	for (const a of answers) {
		byOutcome[a.outcome] += 1;
		costUsd += a.usage.costUsd;
	}
	return { answers: answers.length, costUsd, byOutcome };
}

/** Every finished run on disk, oldest first. */
async function finishedRuns(): Promise<RunFile[]> {
	const runs: RunFile[] = [];
	if (existsSync(RUNS)) {
		for (const dir of await readdir(RUNS)) {
			const path = join(RUNS, dir, "run.json");
			if (!existsSync(path)) continue;
			const run = await readJson<RunFile>(path);
			if (run.finishedAt) runs.push(run);
		}
	}
	return sortRuns(runs);
}

/** Regenerate the files the site imports (series.json, latest.json) and the run index from
 *  the finished runs on disk. committed-data.test.ts fails if these ever drift. */
async function rebuildDerived(): Promise<void> {
	const sorted = await finishedRuns();
	// Quotes come per question from the latest run that asked it, so every run's texts are
	// read: a run of only the new questions must not drop the older questions' quotes.
	const withTexts = await Promise.all(
		sorted.map(async (run) => ({
			run,
			texts: await readJson<TextsFile>(join(RUNS, run.id, "texts.json")),
		})),
	);
	await writeJson(SERIES_PATH, buildSeries(sorted));
	await writeJson(LATEST_PATH, buildLatest(withTexts));
	await writeJson(INDEX_PATH, { runs: sorted.map((r) => r.id) });
}

function gateReport(texts: TextsFile): string[] {
	const lines: string[] = [];
	for (const [key, t] of Object.entries(texts.texts)) {
		const hits = t.motivation ? gateHits(t.motivation) : [];
		if (hits.length > 0 && !t.reviewed && !t.hidden) lines.push(`${key}: ${hits.join(", ")}`);
	}
	return lines;
}

/** The questions a run asks. With --new, only those added to the bank since the last
 *  finished run, so new questions get answers without re-asking, and re-paying for, the
 *  whole bank mid-week. */
async function questionsToAsk(onlyNew: boolean): Promise<readonly Question[]> {
	const askedBefore = onlyNew
		? new Set((await finishedRuns()).flatMap((r) => r.questions.map((x) => x.q)))
		: new Set<string>();
	const questions = activeQuestions().filter((q) => !askedBefore.has(questionKey(q)));
	if (questions.length === 0) {
		fail("Alla aktiva frågor har redan ställts. Kör utan --new för en hel mätning.");
	}
	return questions;
}

async function cmdRun(args: string[]): Promise<void> {
	const { values } = parseArgs({
		args,
		options: {
			samples: { type: "string", default: "3" },
			variant: { type: "string", default: "A" },
			"max-cost": { type: "string", default: "5" },
			concurrency: { type: "string", default: "4" },
			resume: { type: "string" },
			new: { type: "boolean", default: false },
			commit: { type: "boolean", default: false },
			trailer: { type: "string", multiple: true },
			"dry-run": { type: "boolean", default: false },
		},
	});
	const variant = values.variant as Variant;
	if (variant !== "A" && variant !== "B") fail("En mätning använder variant A eller B.");
	const samples = Number(values.samples);
	const maxCost = Number(values["max-cost"]);

	console.log("Kontrollerar OpenRouters katalog …");
	const { diff, catalogue } = await checkCatalogue();
	printDiff(diff);
	const pending = pendingModels(diff.file);
	if (pending.length > 0) {
		console.log(
			table(
				pending.map((p) => [getFamily(p.family).label, p.id, p.name, `publicerad ${p.created}`]),
			),
		);
		fail(
			`\n${pending.length} nya modeller väntar på beslut. Kör adopt eller ignore för var och en innan mätningen.`,
			3,
		);
	}
	const models = await pinnedModels(diff.file, catalogue);
	const questions = await questionsToAsk(values.new);

	if (values["dry-run"]) {
		const scale = questions.find((q) => q.kind === "scale");
		const party = questions.find((q) => q.kind === "party");
		for (const q of [scale, party]) {
			if (!q) continue;
			const options = optionsFor(q, variant, "dry-run");
			console.log(`\n── ${q.id} ──\n${buildPrompt(q, variant, options)}`);
		}
		const calls = questions.length * samples * FAMILY_KEYS.length;
		console.log(
			`\n${calls} anrop: ${questions.length} frågor × ${samples} svar × ${FAMILY_KEYS.length} modeller.`,
		);
		console.log(
			table(FAMILY_KEYS.map((k) => [getFamily(k).label, models[k].id, models[k].canonicalSlug])),
		);
		return;
	}
	const key = apiKey();

	let run: RunFile;
	let texts: TextsFile;
	if (values.resume) {
		run = await readJson<RunFile>(join(RUNS, values.resume, "run.json"));
		texts = await readJson<TextsFile>(join(RUNS, values.resume, "texts.json"));
		if (run.finishedAt) fail(`Mätningen ${run.id} är redan klar.`);
		const switched = FAMILY_KEYS.filter((k) => run.models[k].id !== models[k].id);
		if (switched.length > 0)
			fail(`Modellen har bytts sedan mätningen började (${switched.join(", ")}); starta en ny.`);
	} else {
		const id = await nextRunId(today());
		run = {
			schemaVersion: 1,
			id,
			date: today(),
			startedAt: new Date().toISOString(),
			finishedAt: null,
			settings: settings(variant, samples),
			models,
			questions: questions.map((q) => ({ q: questionKey(q), textSha256: textSha256(q) })),
			answers: [],
			totals: totalsOf([]),
			stoppedByBudget: false,
		};
		texts = { runId: id, texts: {} };
	}
	const runDir = join(RUNS, run.id);
	const asked = new Set(run.questions.map((x) => x.q));
	const runQuestions = questions.filter((q) => asked.has(questionKey(q)));
	const tasks = runQuestions.flatMap((q) =>
		Array.from({ length: run.settings.samples }, (_, i) => i + 1).flatMap((sample) =>
			FAMILY_KEYS.map((family) => ({ q, family, sample })),
		),
	);
	const done = new Set(run.answers.map(answerKey));
	const todo = tasks.filter(
		(t) => !done.has(answerKey({ q: questionKey(t.q), family: t.family, sample: t.sample })),
	);
	console.log(
		`\nMätning ${run.id}: ${todo.length} av ${tasks.length} svar kvar, budget ${usd(maxCost)}.\n`,
	);

	let saving = Promise.resolve();
	const save = () => {
		run.totals = totalsOf(run.answers);
		saving = saving.then(async () => {
			await writeJson(join(runDir, "run.json"), run);
			await writeJson(join(runDir, "texts.json"), texts);
		});
		return saving;
	};
	await save();

	let projected = false;
	await pool(todo, Number(values.concurrency), async (t) => {
		if (run.totals.costUsd >= maxCost) {
			run.stoppedByBudget = true;
			return false;
		}
		const seed = `${run.id}:${t.q.id}:${t.family}:${t.sample}`;
		const options = optionsFor(t.q, run.settings.variant, seed);
		const result = await ask(
			key,
			models[t.family].id,
			buildPrompt(t.q, run.settings.variant, options),
			options,
			OWN_PROVIDER[t.family],
		);
		const answer = toAnswer(t.q, t.family, t.sample, result, options);
		run.answers.push(answer);
		texts.texts[answerKey(answer)] = { motivation: result.parsed.motivation, raw: result.raw };
		await save();
		console.log(
			`[${run.answers.length}/${tasks.length}] ${getFamily(t.family).label.padEnd(8)} ${t.q.id} #${t.sample}  ${answer.option ?? answer.outcome}  ${usd(run.totals.costUsd)}`,
		);

		if (!projected && run.answers.length >= FAMILY_KEYS.length * 2) {
			projected = true;
			const estimate = (run.totals.costUsd / run.answers.length) * tasks.length;
			console.log(`   beräknad kostnad för hela mätningen: ${usd(estimate)}`);
			if (estimate > maxCost) {
				run.stoppedByBudget = true;
				console.log(`   överstiger --max-cost ${usd(maxCost)}; stannar.`);
				return false;
			}
		}
		return true;
	});

	const complete = run.answers.length === tasks.length;
	if (complete) {
		run.finishedAt = new Date().toISOString();
		run.stoppedByBudget = false;
	}
	await save();

	const rows = [["familj", "modell", ...OUTCOMES, "kostnad"]];
	for (const k of FAMILY_KEYS) {
		const mine = run.answers.filter((a) => a.family === k);
		rows.push([
			getFamily(k).label,
			models[k].id,
			...OUTCOMES.map((o) => String(mine.filter((a) => a.outcome === o).length)),
			usd(mine.reduce((s, a) => s + a.usage.costUsd, 0)),
		]);
	}
	console.log(`\n${table(rows)}\nTotalt ${usd(run.totals.costUsd)}`);

	const flagged = gateReport(texts);
	if (flagged.length > 0) {
		console.log(
			`\n${flagged.length} motiveringar fastnade i spärren och citeras inte utan granskning:`,
		);
		for (const line of flagged) console.log(`  ${line}`);
		console.log(`Granska: pnpm ai-barometern review --run ${run.id}`);
	}

	if (!complete) {
		fail(
			`\nMätningen är inte klar (${run.answers.length}/${tasks.length}). Fortsätt: pnpm ai-barometern run --resume ${run.id} --max-cost <ny gräns>`,
			4,
		);
	}
	await rebuildDerived();
	console.log(`\nSkrev ${runDir} och uppdaterade series.json och latest.json.`);

	if (values.commit) {
		execFileSync("git", ["add", DATA_REL], { cwd: REPO, stdio: "inherit" });
		const message = [
			`data(ai-barometern): mätning ${run.id}`,
			"",
			`${run.totals.answers} svar på ${run.questions.length} frågor från ${FAMILY_KEYS.length} modeller, ${usd(run.totals.costUsd)}.`,
			...FAMILY_KEYS.map((k) => `${getFamily(k).label}: ${models[k].id}`),
			...(values.trailer?.length ? ["", ...values.trailer] : []),
		].join("\n");
		execFileSync("git", ["commit", "-m", message, "--", DATA_REL], { cwd: REPO, stdio: "inherit" });
	} else {
		console.log(
			`Committa: git add ${DATA_REL} && git commit -m "data(ai-barometern): mätning ${run.id}" -- ${DATA_REL}`,
		);
	}
}

// ── review ───────────────────────────────────────────────────────────────────────────

async function latestRunId(): Promise<string> {
	if (!existsSync(RUNS)) fail("Inga mätningar ännu.");
	const dirs = (await readdir(RUNS)).sort();
	const last = dirs.at(-1);
	if (!last) fail("Inga mätningar ännu.");
	return last;
}

async function cmdReview(args: string[]): Promise<void> {
	const { values } = parseArgs({
		args,
		options: { run: { type: "string" }, approve: { type: "string" }, hide: { type: "string" } },
	});
	const id = values.run ?? (await latestRunId());
	const textsPath = join(RUNS, id, "texts.json");
	const texts = await readJson<TextsFile>(textsPath);
	const run = await readJson<RunFile>(join(RUNS, id, "run.json"));

	for (const [flag, field] of [
		[values.approve, "reviewed"],
		[values.hide, "hidden"],
	] as const) {
		if (!flag) continue;
		const entry: AnswerText | undefined = texts.texts[flag];
		if (!entry) fail(`Ingen motivering med nyckeln ${flag} i ${id}`);
		entry[field] = true;
		await writeJson(textsPath, texts);
		await rebuildDerived();
		console.log(`${flag}: ${field === "reviewed" ? "godkänd för citat" : "dold"}.`);
		return;
	}

	const problems = run.answers.filter((a) => ["refused", "invalid", "error"].includes(a.outcome));
	console.log(
		`Mätning ${id}: ${run.answers.length} svar, ${problems.length} vägrade eller felaktiga.`,
	);
	for (const a of problems) {
		console.log(`  ${answerKey(a)}  ${a.outcome}${a.error ? `: ${a.error}` : ""}`);
	}
	const flagged = gateReport(texts);
	console.log(`\n${flagged.length} motiveringar fastnade i spärren:`);
	for (const line of flagged) {
		const key = line.split(":")[0] ?? "";
		console.log(`\n  ${line}\n  »${texts.texts[key]?.motivation ?? ""}«`);
	}
	if (flagged.length > 0) {
		console.log("\nGodkänn: review --approve <nyckel>   Dölj: review --hide <nyckel>");
	}
}

// ── main ─────────────────────────────────────────────────────────────────────────────

const COMMANDS: Record<string, (args: string[]) => Promise<void>> = {
	status: cmdStatus,
	init: cmdInit,
	models: cmdModels,
	adopt: cmdAdopt,
	ignore: cmdIgnore,
	probe: cmdProbe,
	pilot: cmdPilot,
	run: cmdRun,
	review: cmdReview,
	rebuild: async () => {
		await rebuildDerived();
		console.log("Skrev series.json, latest.json och index.json.");
	},
};

const [command = "status", ...rest] = process.argv.slice(2);
const handler = COMMANDS[command];
if (!handler) fail(`Okänt kommando »${command}«. Kommandon: ${Object.keys(COMMANDS).join(", ")}`);
handler(rest).catch((err) => {
	console.error("ai-barometern failed:", err);
	process.exit(1);
});
