import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { type PipelineModelTier, getModelId as resolveModelId } from "@islam-se/quotes";
import type { ClaudeRunOptions } from "./claude-runner.js";

/**
 * Generate a URL-safe slug from text.
 * Handles Swedish characters and falls back to a hash for non-Latin text (e.g. Arabic).
 *
 * Accents are folded via NFD — decompose to base letter + combining mark, then drop
 * the marks. This used to be three hand-written rules for å, ä and ö, which meant
 * every OTHER accented letter fell through to the `[^a-z0-9]` catch-all and became a
 * hyphen: "Moskén som skulle skada" was written to disk as mosk-n-som-skulle-skada.md
 * — a hole in the middle of the first word, caught before it was ever deployed. NFD
 * reproduces the Swedish three exactly (å→a, ä→a, ö→o are all base+mark) and fixes
 * é, è, ü, ñ, á and the rest in the same step.
 *
 * The Nordic four are listed separately because they do NOT decompose — ø, æ, ð and
 * þ are atomic code points, so NFD leaves them intact and the catch-all would still
 * eat them. This corpus covers the sagas; a Norse name losing a letter is not
 * hypothetical.
 */
const ATOMIC_FOLDS: [RegExp, string][] = [
	[/ø/g, "o"],
	[/æ/g, "ae"],
	[/ð/g, "d"],
	[/þ/g, "th"],
	[/ß/g, "ss"],
];

export function slugify(text: string): string {
	let folded = text.toLowerCase();
	for (const [pattern, replacement] of ATOMIC_FOLDS) folded = folded.replace(pattern, replacement);

	let slug = folded
		.normalize("NFD")
		// U+0300–U+036F, the combining diacritical marks NFD just split off.
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");

	// Truncate at word boundary (hyphen) within limit, never leave trailing hyphen
	if (slug.length > 50) {
		const lastHyphen = slug.lastIndexOf("-", 50);
		slug = lastHyphen > 10 ? slug.slice(0, lastHyphen) : slug.slice(0, 50);
	}
	slug = slug.replace(/-$/, "");

	// Fallback for text with no Latin characters (e.g. Arabic topics)
	if (!slug) {
		let hash = 0;
		for (let i = 0; i < text.length; i++) {
			hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
		}
		slug = `topic-${Math.abs(hash).toString(36)}`;
	}

	return slug;
}

/**
 * Get model ID for Claude CLI.
 *
 * Kept as a re-export rather than its own mapping: the IDs live in MODEL_MAP
 * (`@islam-se/quotes`) so a new Opus or Sonnet release is a one-line change
 * there instead of a hunt through every producer.
 */
export function getModelId(model: PipelineModelTier): ClaudeRunOptions["model"] {
	return resolveModelId(model);
}

/**
 * Create a logger that respects quiet mode
 */
export function createLogger(quiet: boolean) {
	return {
		log: (msg: string) => {
			if (!quiet) console.log(msg);
		},
		warn: (msg: string) => {
			if (!quiet) console.warn(msg);
		},
	};
}

/**
 * Save stage output to file
 */
export function saveOutput(dir: string, filename: string, data: unknown): void {
	const filepath = join(dir, filename);
	if (typeof data === "string") {
		writeFileSync(filepath, data, "utf-8");
	} else {
		writeFileSync(filepath, JSON.stringify(data, null, 2), "utf-8");
	}
}

/**
 * Load stage output from file
 */
export function loadOutput<T>(dir: string, filename: string): T | null {
	const filepath = join(dir, filename);
	if (!existsSync(filepath)) {
		return null;
	}
	const content = readFileSync(filepath, "utf-8");
	if (filename.endsWith(".json")) {
		return JSON.parse(content) as T;
	}
	return content as T;
}

/**
 * Format milliseconds as a human-readable duration (e.g. "2m 30s", "45s")
 */
export function formatDuration(ms: number): string {
	const seconds = Math.round(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

/**
 * Swedish authors in the quote database, ordered by quote count.
 * Used to vary which authors are suggested in prompts so the pipeline
 * doesn't always gravitate toward Strindberg/Lagerlöf/Söderberg.
 */
const SWEDISH_AUTHORS = [
	"August Strindberg",
	"Ellen Key",
	"Hjalmar Söderberg",
	"Viktor Rydberg",
	"Johan Ludvig Runeberg",
	"Hjalmar Bergman",
	"Zacharias Topelius",
	"August Blanche",
	"Erik Gustaf Geijer",
	"Karin Boye",
	"Selma Lagerlöf",
	"Fredrika Bremer",
	"Carl von Linné",
	"Gustaf af Geijerstam",
	"Minna Canth",
	"Victoria Benedictsson",
	"Per Hallström",
	"Ester Blenda Nordström",
	"Oscar Levertin",
	"Verner von Heidenstam",
	"Dan Andersson",
	"Anne Charlotte Leffler",
	"C. J. L. Almqvist",
	"Albert Engström",
	"Esaias Tegnér",
];

/**
 * Pick N random Swedish authors from the database pool.
 * Always includes 1 from the top 5 (well-known) and the rest from the wider pool,
 * to balance recognizability with variety.
 */
export function pickSwedishAuthors(count = 4): string[] {
	// Fisher-Yates shuffle on a copy
	const pool = [...SWEDISH_AUTHORS];
	for (let i = pool.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		const tmp = pool[i] as string;
		pool[i] = pool[j] as string;
		pool[j] = tmp;
	}
	// Ensure at least 1 top-5 author (well-known) ends up in the pick
	const top5 = new Set(SWEDISH_AUTHORS.slice(0, 5));
	const fromTop = pool.filter((a) => top5.has(a));
	const fromRest = pool.filter((a) => !top5.has(a));
	const result: string[] = [];
	if (fromTop.length > 0) result.push(fromTop[0] as string);
	for (const a of fromRest) {
		if (result.length >= count) break;
		result.push(a);
	}
	return result;
}

/**
 * MCP tools allowed during the research stage
 */
export const RESEARCH_ALLOWED_TOOLS = [
	"mcp__quotes__search_quotes",
	"mcp__quotes__search_by_filter",
	"mcp__quotes__search_text",
	"mcp__quotes__get_quote_by_id",
	"mcp__quotes__get_inventory",
	"mcp__quotes__bulk_search",
	"mcp__quotes__search_quran",
	"mcp__quotes__search_books",
	"mcp__quotes__fetch_wikipedia",
	"WebSearch",
	"WebFetch",
	"Read",
];

/** A pre-validated briefing document handed to the pipeline from disk. */
export interface SourceDoc {
	/** Label the stages see — the file's basename. */
	name: string;
	/** Plain text. PDFs are extracted with pdftotext -layout. */
	text: string;
}

/**
 * Read briefing documents (.pdf, .md, .txt) for the research, fact-check and author
 * stages.
 *
 * ⚠️ WHY THE PIPELINE NEEDS THIS AT ALL. Research can only reach material it can find
 * with WebSearch, and the three prompts all tell it in so many words that WebFetch
 * "cannot read PDFs — returns binary garbage". A compiled report that the human has
 * already checked was therefore unreachable: its figures could enter the essay only if
 * the model happened to rediscover each one on the open web, and anything it missed was
 * simply absent. Extraction happens HERE, on disk, before any model sees the file — so
 * the stages get text, not a URL they are forbidden to fetch.
 *
 * These documents are handed to the stages as ALREADY VERIFIED. That is a deliberate
 * choice by the caller, not an assumption: the briefings are compiled and source-checked
 * by hand, and making the fact-checker re-derive every figure from the open web would
 * fail the credibility gate on material that is better sourced than what the gate can
 * reach. The gate still does its real job — catching fabrication in what the model adds.
 */
export function loadSourceDocs(paths: string[]): SourceDoc[] {
	return paths.map((path) => {
		if (!existsSync(path)) throw new Error(`Källdokument saknas: ${path}`);
		const name = basename(path);
		const ext = extname(path).toLowerCase();

		if (ext !== ".pdf") return { name, text: readFileSync(path, "utf-8") };

		// -layout keeps the tables and the two-column boxes readable. Without it the
		// summary boxes interleave with body text and the numbers lose their labels.
		let text: string;
		try {
			text = execFileSync("pdftotext", ["-layout", path, "-"], {
				encoding: "utf-8",
				maxBuffer: 64 * 1024 * 1024,
			});
		} catch (e) {
			throw new Error(
				`Kunde inte läsa PDF:en ${name} — pdftotext (poppler-utils) krävs. ${String(e)}`,
			);
		}
		// A scanned PDF extracts to almost nothing. Failing here is far better than
		// handing every stage an empty <source_document> it will quietly write around.
		if (text.trim().length < 500) {
			throw new Error(
				`${name} gav bara ${text.trim().length} tecken text — troligen en skannad PDF utan textlager. OCR:a den först.`,
			);
		}
		return { name, text };
	});
}

/**
 * Wrap briefing documents for a stage prompt.
 *
 * The framing matters more than the text: without it the model treats a compiled report
 * as one more web hit to weigh, and either re-verifies figures it cannot reach or drops
 * them. It is told the opposite — trust the figures, attribute to the primary source the
 * report names, and never cite the briefing itself, which has no public URL and would be
 * stripped by the source gate anyway.
 */
export function formatSourceDocs(docs: SourceDoc[]): string {
	if (docs.length === 0) return "";
	const bodies = docs
		.map((d) => `<source_document name="${d.name}">\n${d.text.trim()}\n</source_document>`)
		.join("\n\n");
	return `<briefing_documents>
Dessa rapporter är sammanställda och källgranskade för hand innan körningen. Behandla
dem som VERIFIERAT underlag:

- Siffror, datum, citat och rättsfall i dem får användas som de står. Du behöver inte
  belägga dem på nytt, och de ska inte räknas som obelagda påståenden.
- Attribuera till PRIMÄRKÄLLAN som rapporten namnger (SCB, METR, Högsta
  förvaltningsdomstolen, regeringen, riksdagen …), aldrig till rapporten. Rapporternas
  bilaga A namnger primärkällan för varje uppgift.
- Lägg URL:en i \`sources\` bara när du faktiskt hämtat sidan. En källa utan länk är
  korrekt; en påhittad länk är en förfalskning. Själva briefingfilerna har ingen publik
  URL och hör aldrig hemma i \`sources\`.
- Det som INTE står i dem gäller vanliga regler för: sök, hämta, belägg.

${bodies}
</briefing_documents>`;
}
