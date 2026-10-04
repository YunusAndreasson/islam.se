/**
 * Exact-replacement patches for the stages that run after the review gate.
 *
 * ⚠️ WHY THE POST-REVIEW STAGES NO LONGER RETURN A BODY. Polish, deepen, ground and
 * Swedish voice each used to hand back the whole essay, four full rewrites that no
 * reviewer read. On »Marknaden i raden« (2026-09-18) a deepen addition had to be
 * rewritten by hand after publication, and nothing in the run said which stage had
 * changed which sentence. Each stage now returns the edits it means, as verbatim
 * original → replacement pairs; this module applies them, refuses the ones that touch
 * source material, and returns the lists the orchestrator logs. An edit the model did
 * not list cannot ship.
 */

export interface TextPatch {
	original: string;
	replacement: string;
	reason?: string;
}

export interface PatchRejection {
	patch: TextPatch;
	reason: string;
}

export interface PatchApplication {
	body: string;
	applied: TextPatch[];
	rejected: PatchRejection[];
}

export interface ApplyPatchOptions {
	/** Refuse edits inside `#` headings. Swedish voice may fix a typo there; the others may not. */
	protectHeadings?: boolean;
	/** Apply at most this many; the rest are refused as over the stage's cap. */
	maxApplied?: number;
	/** Stage-specific veto. Return a reason to refuse the patch. */
	vet?: (patch: TextPatch) => string | undefined;
	/**
	 * Lift the source-material guards (block quotes, footnotes, headings, numbers, quoted
	 * words). Only the review and verify stages set this: they are the gate, and restoring
	 * a quotation to its verified wording, correcting a date or striking an unsupported
	 * note is their job. A patch must still match one place in the text, and is still logged.
	 */
	sourceEdits?: boolean;
}

const QUOTE_CHARS = `"“”»«„`;
const DASH_CHARS = "–—-";

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A pattern that matches `original` while forgiving what a model changes when it copies
 * text out of a long input: whitespace runs, quote style and dash style. Words must match.
 */
function tolerantPattern(original: string): RegExp {
	const tokens = original.trim().split(/\s+/).filter(Boolean);
	const source = tokens
		.map((token) =>
			[...token]
				.map((char) => {
					if (QUOTE_CHARS.includes(char)) return `[${QUOTE_CHARS}]`;
					if (DASH_CHARS.includes(char)) return `[${DASH_CHARS}]`;
					return escapeRegExp(char);
				})
				.join(""),
		)
		.join("\\s+");
	return new RegExp(source, "g");
}

/** Where `original` sits in `text`: one exact hit, else one tolerant hit, else a reason. */
export function locatePatch(
	text: string,
	original: string,
): { start: number; end: number } | { error: string } {
	if (!original.trim()) return { error: "original was empty" };

	const exact: number[] = [];
	for (let at = text.indexOf(original); at !== -1; at = text.indexOf(original, at + 1)) {
		exact.push(at);
		if (exact.length > 1) break;
	}
	const [only] = exact;
	if (exact.length === 1 && only !== undefined) return { start: only, end: only + original.length };
	if (exact.length > 1) return { error: "original was not unique in the current text" };

	const matches = [...text.matchAll(tolerantPattern(original))];
	const [match] = matches;
	if (matches.length === 1 && match) {
		const start = match.index ?? 0;
		return { start, end: start + match[0].length };
	}
	if (matches.length > 1) return { error: "original was not unique in the current text" };
	return { error: "original was not found in the text" };
}

/** Character ranges no patch may touch: block quotes, footnote definitions, code fences. */
function protectedRanges(text: string, headings: boolean): Array<[number, number, string]> {
	const ranges: Array<[number, number, string]> = [];
	for (const m of text.matchAll(/```[\s\S]*?```/g)) {
		ranges.push([m.index ?? 0, (m.index ?? 0) + m[0].length, "a code fence"]);
	}
	for (const m of text.matchAll(/^>.*$/gm)) {
		ranges.push([m.index ?? 0, (m.index ?? 0) + m[0].length, "a block quote"]);
	}
	for (const m of text.matchAll(/^\[\^[^\]]+\]:.*$/gm)) {
		ranges.push([m.index ?? 0, (m.index ?? 0) + m[0].length, "a footnote definition"]);
	}
	if (headings) {
		for (const m of text.matchAll(/^#{1,6}\s.*$/gm)) {
			ranges.push([m.index ?? 0, (m.index ?? 0) + m[0].length, "a heading"]);
		}
	}
	return ranges;
}

function normaliseQuotes(text: string): string {
	let out = text;
	for (const char of QUOTE_CHARS) out = out.split(char).join('"');
	return out.replace(/\s+/g, " ").trim();
}

const collect = (text: string, pattern: RegExp): string[] =>
	[...text.matchAll(pattern)].map((m) => m[0]);

/**
 * What a prose edit must carry over unchanged: footnote markers, quoted words and
 * numbers. A replacement that drops `[^4]` orphans a note; one that rewords a quotation
 * misquotes a source; one that changes »1974« is a factual edit made after fact-check.
 */
function carriedMaterial(text: string): string {
	const quotes = collect(normaliseQuotes(text), /"[^"\n]+"/g);
	const markers = collect(text, /\[\^[^\]]+\]/g);
	const numbers = collect(text, /\d+/g);
	return JSON.stringify({ quotes: quotes.sort(), markers, numbers: numbers.sort() });
}

const STRUCTURE: Array<[RegExp, string]> = [
	[/^>/gm, "a block quote"],
	[/^\[\^[^\]]+\]:/gm, "a footnote definition"],
	[/```/g, "a code fence"],
	[/^#{1,6}\s/gm, "a heading"],
];

/** Prose edits may not create source material: a replacement carries no more of it than its original. */
function introducesStructure(original: string, replacement: string): string | undefined {
	for (const [pattern, name] of STRUCTURE) {
		if (collect(replacement, pattern).length > collect(original, pattern).length) {
			return `replacement adds ${name}`;
		}
	}
	return undefined;
}

/**
 * Apply patches in order, each against the text as the previous ones left it.
 * A refused patch never blocks the others; the caller logs both lists.
 */
export function applyTextPatches(
	body: string,
	patches: TextPatch[],
	options: ApplyPatchOptions = {},
): PatchApplication {
	let text = body;
	const applied: TextPatch[] = [];
	const rejected: PatchRejection[] = [];

	for (const patch of patches) {
		const refuse = (reason: string) => rejected.push({ patch, reason });

		if (patch.original === patch.replacement) {
			refuse("replacement was unchanged");
			continue;
		}
		if (options.maxApplied !== undefined && applied.length >= options.maxApplied) {
			refuse(`over the stage's cap of ${options.maxApplied}`);
			continue;
		}
		const veto = options.vet?.(patch);
		if (veto) {
			refuse(veto);
			continue;
		}
		const structural = options.sourceEdits
			? undefined
			: introducesStructure(patch.original, patch.replacement);
		if (structural) {
			refuse(structural);
			continue;
		}

		const located = locatePatch(text, patch.original);
		if ("error" in located) {
			refuse(located.error);
			continue;
		}
		if (!options.sourceEdits) {
			const hit = protectedRanges(text, options.protectHeadings ?? true).find(
				([from, to]) => located.start < to && located.end > from,
			);
			if (hit) {
				refuse(`touches ${hit[2]}`);
				continue;
			}

			const matched = text.slice(located.start, located.end);
			if (carriedMaterial(matched) !== carriedMaterial(patch.replacement)) {
				refuse("changes a footnote marker, a quotation or a number");
				continue;
			}
		}

		text = text.slice(0, located.start) + patch.replacement + text.slice(located.end);
		applied.push(patch);
	}

	return { body: text, applied, rejected };
}

export interface FootnoteRenumbering {
	body: string;
	/** Markers whose number changed. */
	renumbered: number;
	/** Definitions removed because no marker pointed at them any more. */
	dropped: string[];
	/** Markers that have no definition. Left in place for a human. */
	dangling: string[];
}

const FOOTNOTE_DEFINITION = /^\[\^([^\]]+)\]:/;
const FOOTNOTE_MARKER = /\[\^([^\]]+)\]/g;

/**
 * Make footnotes sequential in the order their markers appear, and drop definitions that
 * a cut left without a marker. The review stage used to do this by rewriting the essay;
 * as patches it would take one edit per marker, each ambiguous (`[^7]` occurs twice), so
 * the code does it once the patches are applied.
 */
export function renumberFootnotes(body: string): FootnoteRenumbering {
	const lines = body.split("\n");
	// Which lines belong to a definition (its first line plus indented continuations), and
	// which are inside a code fence, where a `[^n]` is not a marker.
	const definitionOf: Array<string | undefined> = [];
	const fenced: boolean[] = [];
	let inFence = false;
	let current: string | undefined;
	for (const line of lines) {
		const isFenceLine = line.trimStart().startsWith("```");
		fenced.push(inFence || isFenceLine);
		if (isFenceLine) inFence = !inFence;
		const start = fenced[fenced.length - 1] ? null : FOOTNOTE_DEFINITION.exec(line);
		if (start) current = start[1];
		else if (!(current && /^[ \t]+\S/.test(line))) current = undefined;
		definitionOf.push(current);
	}

	const order: string[] = [];
	lines.forEach((line, i) => {
		if (definitionOf[i] !== undefined || fenced[i]) return;
		for (const m of line.matchAll(FOOTNOTE_MARKER)) {
			if (m[1] !== undefined && !order.includes(m[1])) order.push(m[1]);
		}
	});
	const numberOf = new Map(order.map((id, i) => [id, String(i + 1)]));
	const defined = new Set(definitionOf.filter((id): id is string => id !== undefined));
	const dropped = [...defined].filter((id) => !numberOf.has(id));
	const dangling = order.filter((id) => !defined.has(id));
	const renumbered = order.filter((id) => numberOf.get(id) !== id).length;
	if (renumbered === 0 && dropped.length === 0) return { body, renumbered, dropped, dangling };

	// Definitions keep their slots in the text but fill them in the new order.
	const blocks = new Map<string, string[]>();
	const slots: number[] = [];
	lines.forEach((line, i) => {
		const id = definitionOf[i];
		if (id === undefined) return;
		if (!blocks.has(id)) {
			blocks.set(id, []);
			slots.push(i);
		}
		blocks.get(id)?.push(line);
	});
	const kept = [...blocks.keys()]
		.filter((id) => numberOf.has(id))
		.sort((a, b) => Number(numberOf.get(a)) - Number(numberOf.get(b)));

	const out: string[] = [];
	lines.forEach((line, i) => {
		if (fenced[i]) {
			out.push(line);
			return;
		}
		if (definitionOf[i] === undefined) {
			out.push(line.replace(FOOTNOTE_MARKER, (_whole, id) => `[^${numberOf.get(id) ?? id}]`));
			return;
		}
		const slot = slots.indexOf(i);
		if (slot === -1) return; // continuation line, emitted with its block
		const id = kept[slot];
		if (id === undefined) return; // slot freed by a dropped definition
		const [first = "", ...rest] = blocks.get(id) ?? [];
		out.push(first.replace(FOOTNOTE_DEFINITION, `[^${numberOf.get(id)}]:`), ...rest);
	});
	return { body: out.join("\n"), renumbered, dropped, dangling };
}

/** One log line per patch, for the run log and the stage's JSON artifact. */
export function describePatch(patch: TextPatch, width = 140): string {
	const clip = (s: string) => {
		const flat = s.replace(/\s+/g, " ").trim();
		return flat.length > width ? `${flat.slice(0, width)}…` : flat;
	};
	return `»${clip(patch.original)}« → »${clip(patch.replacement)}«`;
}

// ── Measuring how much a rewrite changed ─────────────────────────────────────

function words(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/\[\^[^\]]+\]/g, " ")
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean);
}

/** Length of the longest common subsequence, in two rolling rows (a 3 000-word essay is 9M cells). */
function lcsLength(a: string[], b: string[]): number {
	if (a.length === 0 || b.length === 0) return 0;
	let prev = new Uint32Array(b.length + 1);
	let curr = new Uint32Array(b.length + 1);
	for (let i = 1; i <= a.length; i++) {
		for (let j = 1; j <= b.length; j++) {
			curr[j] =
				a[i - 1] === b[j - 1] ? (prev[j - 1] ?? 0) + 1 : Math.max(prev[j] ?? 0, curr[j - 1] ?? 0);
		}
		[prev, curr] = [curr, prev];
		curr.fill(0);
	}
	return prev[b.length] ?? 0;
}

function shingles(tokens: string[], n = 4): Set<string> {
	const out = new Set<string>();
	for (let i = 0; i + n <= tokens.length; i++) out.add(tokens.slice(i, i + n).join(" "));
	return out;
}

export interface RewriteExtent {
	/** Words removed plus words added, over the length of the text that was reviewed. */
	changedRatio: number;
	changedWords: number;
	/** Paragraphs of 20+ words in the rewrite that are mostly new text. */
	newParagraphs: string[];
}

/**
 * How far a rewrite moved from the text it rewrote.
 *
 * ⚠️ The reviewer's »publish« round used to ship its rewrite unread. On »Sorgen vid Nilen«
 * (2026-09-14) that round added a new argument paragraph; on »Marknaden i raden« the
 * reviewer's rewrites brought in two first-person sentences. reviewer.md already says
 * »publish« means cosmetic edits only; this measures whether that held.
 */
export function measureRewrite(before: string, after: string): RewriteExtent {
	const a = words(before);
	const b = words(after);
	const common = lcsLength(a, b);
	const changedWords = a.length - common + (b.length - common);
	const beforeShingles = shingles(a);
	const newParagraphs = after
		.split(/\n\s*\n/)
		.map((p) => p.trim())
		.filter((p) => p && !p.startsWith(">") && !/^\[\^/.test(p) && !p.startsWith("#"))
		.filter((p) => {
			const tokens = words(p);
			if (tokens.length < 20) return false;
			const own = [...shingles(tokens)];
			const known = own.filter((s) => beforeShingles.has(s)).length;
			return own.length > 0 && known / own.length < 0.5;
		});
	return { changedRatio: a.length ? changedWords / a.length : 0, changedWords, newParagraphs };
}

/** The share of words a »publish« round may change and still count as cosmetic. */
const COSMETIC_REWRITE_RATIO = 0.04;

export function isCosmeticRewrite(extent: RewriteExtent): boolean {
	return extent.changedRatio <= COSMETIC_REWRITE_RATIO && extent.newParagraphs.length === 0;
}
