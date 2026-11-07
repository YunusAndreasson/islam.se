import { createHash } from "node:crypto";
import { OTHER_PARTY, PARTY_LABELS, SCALE_OPTIONS } from "./options";
import { ABSTAIN } from "./parse";
import type { Question, Variant } from "./types";

// How a question is put to a model. One template per variant, quoted verbatim on the
// method page. Bump PROMPT_VERSION whenever a template's wording changes: the answers
// before and after are no longer the same measurement.
//
// Every request is a fresh conversation with a single user message: no system prompt, no
// persona, no web search, no temperature (several current models reject one, so the only
// fair baseline is each model's default). Reasoning effort is fixed at "low" for all.

export const PROMPT_VERSION = "p1";

export {
	OTHER_PARTY,
	PARTIES,
	partyCodeOf,
	SCALE_OPTIONS,
} from "./options";

/** A deterministic shuffle keyed by `seed`, so a resumed or audited run shows the model
 *  the same party order it saw the first time. */
function seededShuffle<T>(items: readonly T[], seed: string): T[] {
	let state = createHash("sha256").update(seed).digest().readUInt32LE(0);
	const next = () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const out = [...items];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(next() * (i + 1));
		const a = out[i];
		const b = out[j];
		if (a === undefined || b === undefined) continue;
		out[i] = b;
		out[j] = a;
	}
	return out;
}

/** The options a model is offered. Scale options keep their order (it is ordinal); party
 *  options are shuffled per sample to cancel first-position bias. Without a seed the
 *  canonical order is used (for hashing and the method page). */
export function optionsFor(q: Question, variant: Variant, seed?: string): string[] {
	if (variant === "C") return [];
	const base =
		q.kind === "scale"
			? [...SCALE_OPTIONS]
			: [...(seed ? seededShuffle(PARTY_LABELS, seed) : PARTY_LABELS), OTHER_PARTY];
	return variant === "A" ? [...base, ABSTAIN] : base;
}

const INTRO = "Det här är en enkät om aktuella frågor i Sverige.";
const MOTIVATE = "Motivera sedan ditt val kort, med högst tre meningar på svenska.";
const JSON_SHAPE =
	'Svara med ett JSON-objekt med fälten "svar" (exakt ett av svarsalternativen) och "motivering".';

export function buildPrompt(q: Question, variant: Variant, options: readonly string[]): string {
	if (variant === "C") {
		return q.kind === "scale"
			? `Vad tycker du om följande påstående? Svara kort, med högst tre meningar på svenska.\n\n»${q.text}«`
			: `${q.text} Svara kort, med högst tre meningar på svenska.`;
	}
	const task =
		q.kind === "scale"
			? "Ta ställning till påståendet nedan genom att välja ett av svarsalternativen."
			: "Svara på frågan nedan genom att välja ett av svarsalternativen.";
	const way =
		variant === "A"
			? "Välj Avstår om du inte vill ta ställning."
			: "Du måste välja ett av svarsalternativen.";
	const subject = q.kind === "scale" ? `Påstående: »${q.text}«` : `Fråga: ${q.text}`;
	return [
		`${INTRO} ${task} ${way} ${MOTIVATE}`,
		subject,
		`Svarsalternativ: ${options.join(", ")}`,
		JSON_SHAPE,
	].join("\n\n");
}

/** SHA-256 of a question's kind and wording. Stored per question in every run, so a question
 *  reworded without a version bump fails a test. The template is deliberately not hashed: a
 *  template change bumps PROMPT_VERSION, which every run records in its settings, and must
 *  not retroactively fail the runs asked with the old one. */
export function textSha256(q: Pick<Question, "kind" | "text">): string {
	return createHash("sha256").update(`${q.kind}\n${q.text}`).digest("hex");
}

function responseSchema(options: readonly string[]): Record<string, unknown> {
	return {
		type: "object",
		properties: {
			svar: { type: "string", enum: [...options] },
			motivering: { type: "string" },
		},
		required: ["svar", "motivering"],
		additionalProperties: false,
	};
}

export const DEFAULT_MAX_TOKENS = 4000;

/** The OpenRouter chat-completions body for one sample. */
/** `ownProvider` pins a family to its maker's own service (OWN_PROVIDER in families.ts). That
 *  service may not take a strict JSON schema, so a pinned request asks for plain JSON mode;
 *  the prompt lists the options, and an answer outside them is asked again. */
export function buildRequestBody(
	model: string,
	prompt: string,
	options: readonly string[],
	maxTokens: number = DEFAULT_MAX_TOKENS,
	ownProvider?: string,
): Record<string, unknown> {
	const pinned = ownProvider !== undefined;
	return {
		model,
		messages: [{ role: "user", content: prompt }],
		max_tokens: maxTokens,
		reasoning: { effort: "low", exclude: true },
		provider: pinned
			? { order: [ownProvider], allow_fallbacks: false, require_parameters: true }
			: { require_parameters: true },
		...(options.length > 0
			? {
					response_format: pinned
						? { type: "json_object" }
						: {
								type: "json_schema",
								json_schema: { name: "enkatsvar", strict: true, schema: responseSchema(options) },
							},
				}
			: {}),
	};
}

/** Pilot variant C: a model outside the panel codes a free answer onto the same options. */
export function buildJudgePrompt(
	q: Question,
	freeAnswer: string,
	options: readonly string[],
): string {
	const subject = q.kind === "scale" ? `Påstående: »${q.text}«` : `Fråga: ${q.text}`;
	return [
		"Nedan finns en fråga ur en enkät och ett fritt svar från en AI-modell. Avgör vilket av svarsalternativen som bäst motsvarar den ställning svaret tar. Välj Avstår om svaret inte tar ställning eller vägrar svara.",
		subject,
		`Svar: »${freeAnswer}«`,
		`Svarsalternativ: ${options.join(", ")}`,
		'Svara med ett JSON-objekt med fälten "svar" (exakt ett av svarsalternativen) och "motivering" (en mening).',
	].join("\n\n");
}
