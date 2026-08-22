/**
 * The deterministic check that stands between the figures stage and a published figure.
 *
 * ⚠️ WHY THIS FILE EXISTS. The figures stage runs after research, after fact-check, after
 * review — after every gate the pipeline has. Nothing downstream reads what it writes.
 * ground.md opens with what that position costs: a stage in exactly this slot invented a
 * real Swedish place and a care claim that never happened, and shipped under the verdict
 * »publish«. A figure is worse there than a sentence, because a figure has no hedges. As
 * scripts/check-chart-sources.py puts it: »Läsaren läser en stapel som ett faktum — den har
 * inga hedges, ingen »omkring«, ingen brasklapp.«
 *
 * So the stage is not trusted and not asked to be careful. Every number it produces must
 * trace back to something that already passed a gate:
 *
 *   - a value stated in the fact-checked prose, or
 *   - a row in a dataset the fact-checker explicitly marked "verified".
 *
 * Anything else drops the whole figure. The essay is publishable without one; that is what
 * makes dropping the right answer rather than a loss.
 *
 * WHAT IS DELIBERATELY NOT RE-IMPLEMENTED HERE. Grammar, rendering, sourcing and the
 * category trap are all checked by shelling out to the gates the BUILD runs —
 * apps/web/scripts/chart-check.ts and scripts/check-chart-sources.py. Reimplementing their
 * doctrine in TypeScript would create a second opinion that could drift from the one that
 * actually blocks a deploy. The stage's acceptance test is the shipping gate itself.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type FigureKind = "chart" | "table";

export interface GuardDataset {
	id: string;
	rows: Array<{ label: string; values: string[] }>;
}

export interface GuardVerdict {
	ok: boolean;
	/** Every reason the figure was refused, for the run log. Empty when ok. */
	reasons: string[];
}

/**
 * Swedish number literals as prose and specs actually carry them: `196000`, `196 000`
 * (space, NBSP or narrow NBSP as the thousands separator), `12,5`, and `12.5`.
 *
 * ⚠️ The grouped form must come FIRST in the alternation. With `\d+` first, "196 000"
 * matches as 196 and then 000, and a figure claiming 196000 would find no match in a
 * text that plainly states it.
 */
const NUMBER = /\d{1,3}(?:[\s\u00A0\u202F]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?/g;

/**
 * Everything masked out before the prose is read for numbers.
 *
 * ⚠️ THIS LIST IS THE GUARD. Being generous here is the UNSAFE direction: every digit left
 * standing licenses a figure value. The first version masked only `\d+:\d+`, and an essay
 * with footnotes [^1]…[^12] and a link to `api.scb.se/OV0104/v1/…` therefore admitted
 * 1, 8, 12, 101 and 104 as "stated in the prose" — enough for a wholly fabricated bar
 * chart to pass the check whose entire purpose is to make that impossible.
 *
 * A number must be a QUANTITY THE PROSE ASSERTS. Apparatus is not assertion:
 *   - a footnote marker is a pointer,   - a URL is an address,
 *   - a verse or law reference is a citation,
 *   - a footnote definition is the source apparatus (page numbers, editions) and its
 *     digits are not claims the essay makes about the world,
 *   - a fenced block is machine text, not prose.
 */
const MASKED: RegExp[] = [
	/```[\s\S]*?```/g, // fenced blocks
	/^\[\^[^\]]+\]:.*$/gm, // footnote definitions, whole line
	/\[\^[^\]]*\]/g, // footnote markers
	/<[^>\s]+:\/\/[^>]*>/g, // autolinks
	/https?:\/\/\S+/g, // bare URLs
	/\]\([^)]*\)/g, // markdown link targets
	/`[^`]*`/g, // inline code
	/\d+:\d+/g, // Quran (9:103) and Swedish law (2010:800) references
];

export function parseSwedishNumber(raw: string): number | null {
	const text = raw.trim();
	if (text === "" || text === "-" || text === "–") return null;
	const cleaned = text
		.replace(/[\s\u00A0\u202F]/g, "")
		.replace(/%$/, "")
		.replace(",", ".");
	if (cleaned === "" || !/^-?\d*\.?\d+$/.test(cleaned)) return null;
	const value = Number(cleaned);
	return Number.isFinite(value) ? value : null;
}

/** Every quantity the prose actually asserts. See MASKED for what is excluded, and why. */
export function numbersInText(text: string): Set<number> {
	let masked = text;
	for (const pattern of MASKED) masked = masked.replace(pattern, " ");
	const out = new Set<number>();
	for (const m of masked.matchAll(NUMBER)) {
		const value = parseSwedishNumber(m[0]);
		if (value !== null) out.add(value);
	}
	return out;
}

/**
 * The numeric CELLS of a fence body — never the labels.
 *
 * A row label of `1258` is a year, and a label of `2024` is a column of a time series;
 * demanding provenance for those fails on the wrong axis. Only values are claims about
 * quantity. Scalars (`max:`, an axis bound) are an authoring choice, not a datum.
 */
export function figureNumbers(spec: string): number[] {
	const out: number[] = [];
	let inData = false;
	for (const line of spec.split("\n")) {
		const trimmed = line.trim();
		if (trimmed === "" || trimmed.startsWith("#")) continue;
		if (!/^\s/.test(line) && trimmed === "data:") {
			inData = true;
			continue;
		}
		if (!(inData && /^\s/.test(line))) continue;
		const colon = trimmed.indexOf(":");
		if (colon === -1) continue;
		for (const cell of trimmed.slice(colon + 1).split("|")) {
			const value = parseSwedishNumber(cell);
			if (value !== null) out.push(value);
		}
	}
	return out;
}

/** Every number the verified datasets contain, labels included — a dataset row label may
 *  legitimately be a value the figure charts. */
export function numbersInDatasets(datasets: GuardDataset[]): Set<number> {
	const out = new Set<number>();
	for (const d of datasets) {
		for (const row of d.rows) {
			for (const raw of [row.label, ...row.values]) {
				const value = parseSwedishNumber(raw);
				if (value !== null) out.add(value);
			}
		}
	}
	return out;
}

export interface ProvenanceInput {
	spec: string;
	/** The article body as it stood BEFORE this stage — the text that passed fact-check. */
	proseBefore: string;
	/** Only datasets the fact-checker marked "verified". */
	datasets: GuardDataset[];
}

/**
 * Every numeric cell must already exist in vetted material.
 *
 * Values are compared as NUMBERS, not as strings: the prose writes »196 000« and a spec
 * writes `196000`, and those are the same claim. A string comparison would reject it and
 * teach the stage to paste spaced numerals into `data:`, which parses but reads worse in
 * a diff. Equality is exact — a chart is not an estimate, and a rounded value is a value
 * the source did not publish.
 */
export function checkNumberProvenance(input: ProvenanceInput): string[] {
	const allowed = numbersInText(input.proseBefore);
	for (const n of numbersInDatasets(input.datasets)) allowed.add(n);

	const unsupported = [...new Set(figureNumbers(input.spec))].filter((n) => !allowed.has(n));
	if (unsupported.length === 0) return [];
	return [
		`${unsupported.length} tal i figuren finns varken i den granskade texten eller i ett ` +
			`godkänt dataset: ${unsupported.slice(0, 6).join(", ")}. Ett härlett, avrundat eller ` +
			"påhittat värde är inte i källan.",
	];
}

/** A footnote marker inside a fence is silent corruption — see the note in verifyFigure. */
export function checkNoFootnoteMarker(spec: string): string[] {
	return /\[\^/.test(spec)
		? [
				"figuren innehåller en fotnotsmarkör. Den renderas som literal text inne i blocket, " +
					"men normalizeFootnotes() räknar och numrerar om den ändå — fel åt båda hållen.",
			]
		: [];
}

/**
 * The anchor must be the end of a paragraph.
 *
 * This is the whole reason scripts/add-chart.py exists. Inserting after a sentence whose
 * paragraph continues leaves prose welded to the closing fence — »``` Europeiska
 * fatwarådet har mött problemet…« — and markdown does not close a fence like that, so the
 * READER is shown the raw spec. Measured on ramadan.md.
 */
export function checkAnchor(prose: string, anchorText: string): string[] {
	const anchor = anchorText.trim();
	if (!anchor) return ["ingen ankartext angavs"];
	const first = prose.indexOf(anchor);
	if (first === -1) return [`ankartexten finns inte i essän: »${anchor.slice(0, 60)}…«`];
	if (prose.indexOf(anchor, first + 1) !== -1) {
		return [`ankartexten förekommer mer än en gång: »${anchor.slice(0, 60)}…«`];
	}
	const rest = prose.slice(first + anchor.length);
	// End of paragraph = a blank line (or end of document) before any further prose.
	if (!/^[ \t]*(\n[ \t]*\n|\n?$)/.test(rest)) {
		return [
			"ankaret ligger mitt i ett stycke — en figur som fogas in där svetsas fast i prosan " +
				"och läsaren får se specen.",
		];
	}
	return [];
}

/**
 * Run the gates the BUILD runs, against the article with the figure spliced in.
 *
 * Returns null when the tooling is unavailable (no python3, no tsx, script missing), which
 * the caller must treat as "could not verify" — never as "verified". The pipeline degrades
 * to no figure, not to an unchecked one.
 */
export function runBuildGates(markdown: string, repoRoot: string): string[] | null {
	const dir = mkdtempSync(join(tmpdir(), "figures-"));
	const file = join(dir, "kandidat.md");
	try {
		writeFileSync(file, markdown, "utf-8");
		const opts = { encoding: "utf-8" as const, maxBuffer: 16 * 1024 * 1024, cwd: repoRoot };
		const reasons: string[] = [];

		let ranSomething = false;
		for (const python of ["python3", "python"]) {
			const run = spawnSync(
				python,
				[join(repoRoot, "scripts", "check-chart-sources.py"), "--offline", file],
				opts,
			);
			if (run.error) continue;
			ranSomething = true;
			if (run.status !== 0) reasons.push(`check-chart-sources: ${run.stdout.trim().slice(-600)}`);
			break;
		}
		if (!ranSomething) return null;

		// The grammar + renderer gate. `npx tsx` because the script is TypeScript and the
		// orchestrator runs compiled JS; a failure to launch is "could not verify", not "ok".
		const check = spawnSync(
			"npx",
			["tsx", join(repoRoot, "apps", "web", "scripts", "chart-check.ts"), file],
			opts,
		);
		if (check.error) return null;
		if (check.status !== 0) reasons.push(`chart-check: ${check.stdout.trim().slice(-600)}`);

		return reasons;
	} catch {
		return null;
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

export interface FigureCandidates {
	chart: unknown[];
	table: unknown[];
}

/**
 * The deterministic pre-filter that decides whether the model is called at all.
 *
 * ⚠️ THIS IS THE COST STORY. Measured over the corpus, `find-chart-candidates.py` returns a
 * candidate for exactly ONE of 57 essays at any threshold down to 0.1 — literary essays
 * simply do not carry comparable quantities. Handing the whole essay to a model on every
 * run to rediscover that would be pure waste, and worse, it would remove the ability to
 * decline structurally rather than by instruction.
 *
 * Passages that trip the category trap are REMOVED before the model sees them. A model
 * told »shia may not be a label« will occasionally produce one anyway; a candidate list
 * that cannot contain such a passage cannot.
 *
 * Returns empty lists when the scripts or Python are unavailable — the caller then skips
 * the stage, which is the safe degradation: no figure rather than an unvetted one.
 */
export function findFigureCandidates(articleBody: string, repoRoot: string): FigureCandidates {
	const dir = mkdtempSync(join(tmpdir(), "figcand-"));
	const file = join(dir, "essa.md");
	try {
		// The scripts read files and expect frontmatter; strip_frontmatter tolerates its
		// absence but the eval-input precedent wraps anyway, so the shape is familiar.
		writeFileSync(file, `---\ntitle: "kandidat"\n---\n\n${articleBody}`, "utf-8");
		const run = (script: string): unknown[] => {
			for (const python of ["python3", "python"]) {
				const out = spawnSync(python, [join(repoRoot, "scripts", script), "--json", file], {
					encoding: "utf-8",
					maxBuffer: 16 * 1024 * 1024,
					cwd: repoRoot,
				});
				if (out.error) continue;
				if (out.status !== 0) return [];
				try {
					const rows = JSON.parse(out.stdout) as Array<{
						passages?: Array<{ trap?: boolean }>;
					}>;
					return rows.flatMap((r) => (r.passages ?? []).filter((p) => !p.trap));
				} catch {
					return [];
				}
			}
			return [];
		};
		return {
			chart: run("find-chart-candidates.py"),
			table: run("find-table-candidates.py"),
		};
	} catch {
		return { chart: [], table: [] };
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

export interface ApplyInput {
	body: string;
	kind: FigureKind;
	spec: string;
	anchorText: string;
	datasets: GuardDataset[];
	repoRoot: string;
}

export interface ApplyResult {
	/** The body with the figure spliced in — only when ok. */
	body: string | null;
	verdict: GuardVerdict;
}

/**
 * Check a proposed figure against everything, then splice it in.
 *
 * Order matters: the cheap in-process checks run first so a hopeless candidate never pays
 * for a subprocess. The build gates run last, against the FULL article with the fence in
 * place, because that is the only way to test what actually ships.
 */
export function applyFigure(input: ApplyInput): ApplyResult {
	const reasons: string[] = [
		...checkNoFootnoteMarker(input.spec),
		...checkNumberProvenance({
			spec: input.spec,
			proseBefore: input.body,
			datasets: input.datasets,
		}),
		...checkAnchor(input.body, input.anchorText),
	];
	if (reasons.length > 0) return { body: null, verdict: { ok: false, reasons } };

	const fence = `\n\n\`\`\`${input.kind}\n${input.spec.trim()}\n\`\`\``;
	const at = input.body.indexOf(input.anchorText.trim()) + input.anchorText.trim().length;
	const patched = input.body.slice(0, at) + fence + input.body.slice(at);

	const gateReasons = runBuildGates(patched, input.repoRoot);
	if (gateReasons === null) {
		return {
			body: null,
			verdict: {
				ok: false,
				// Could not verify is not the same as verified. The pipeline degrades to no
				// figure rather than to an unchecked one.
				reasons: ["kunde inte köra grindarna (python3/tsx saknas?) — figuren släpps inte in"],
			},
		};
	}
	if (gateReasons.length > 0) return { body: null, verdict: { ok: false, reasons: gateReasons } };

	return { body: patched, verdict: { ok: true, reasons: [] } };
}
