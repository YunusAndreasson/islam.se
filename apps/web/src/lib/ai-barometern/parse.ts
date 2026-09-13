import type { Outcome } from "./types";

// Turning a model's reply into an outcome. Structured output (json_schema, strict) makes a
// clean object the normal case, but a provider can still wrap it in a code fence, add a
// sentence around it, refuse, or return nothing because reasoning used up the token budget.
// Each of those must land in its own outcome, because the page reports abstentions and
// refusals as findings, not as missing data.

export const ABSTAIN = "Avstår";

/** The first JSON object in `text`, tolerating code fences and surrounding prose. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: a single-pass brace scanner that must respect strings and escapes
export function extractJsonObject(text: string): Record<string, unknown> | null {
	const unfenced = text.replace(/```(?:json)?/gi, "");
	const start = unfenced.indexOf("{");
	if (start < 0) return null;
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = start; i < unfenced.length; i++) {
		const ch = unfenced[i];
		if (inString) {
			if (escaped) escaped = false;
			else if (ch === "\\") escaped = true;
			else if (ch === '"') inString = false;
			continue;
		}
		if (ch === '"') inString = true;
		else if (ch === "{") depth++;
		else if (ch === "}") {
			depth--;
			if (depth === 0) {
				try {
					const parsed: unknown = JSON.parse(unfenced.slice(start, i + 1));
					return parsed && typeof parsed === "object" && !Array.isArray(parsed)
						? (parsed as Record<string, unknown>)
						: null;
				} catch {
					return null;
				}
			}
		}
	}
	return null;
}

export interface ParsedAnswer {
	outcome: Outcome;
	option: string | null;
	motivation: string | null;
}

/** Normalise for option matching: case, surrounding space and trailing punctuation. */
function norm(s: string): string {
	return s
		.trim()
		.replace(/[.!»«"]+$/u, "")
		.toLocaleLowerCase("sv");
}

/** Map a raw forced-choice reply onto its option. `options` is the full list the model was
 *  offered, including »Avstår« when the variant has it. */
export function parseForcedAnswer(
	content: string | null,
	options: readonly string[],
	signals: { refusal?: string | null; finishReason?: string | null } = {},
): ParsedAnswer {
	if (signals.refusal || signals.finishReason === "content_filter") {
		return { outcome: "refused", option: null, motivation: signals.refusal ?? null };
	}
	if (!content?.trim()) return { outcome: "error", option: null, motivation: null };

	const obj = extractJsonObject(content);
	if (!obj) return { outcome: "invalid", option: null, motivation: null };

	const motivation = typeof obj.motivering === "string" ? obj.motivering.trim() : null;
	const choice = typeof obj.svar === "string" ? norm(obj.svar) : "";
	const option = options.find((o) => norm(o) === choice) ?? null;
	if (!option) return { outcome: "invalid", option: null, motivation };
	return { outcome: option === ABSTAIN ? "abstained" : "answered", option, motivation };
}
