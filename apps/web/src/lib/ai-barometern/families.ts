import type { Family, FamilyKey } from "./types";

// The five model families AI-barometern follows, in display order (alphabetical, so the
// order implies no ranking). Which model stands for a family is NOT decided here: that
// is the pinned id in src/data/ai-barometern/models.json, changed only by
// `pnpm ai-barometern adopt`, so every switch is dated and logged.
//
// `exclude` keeps non-chat releases (image, audio, embeddings, batch variants) out of the
// release log. It is deliberately narrow: a release that slips past it merely shows up as
// pending and costs one `ignore`, while a pattern that is too broad would hide exactly
// the new model the barometer exists to notice.

const NON_CHAT = /-(image|audio|tts|embedding|realtime|transcribe|vision|live|imagine|ocr)(-|$)/;

export const FAMILIES: readonly Family[] = [
	{
		key: "chatgpt",
		label: "ChatGPT",
		maker: "OpenAI",
		namespace: "openai/",
		exclude: [NON_CHAT, /-(codex|oss|safeguard|search)/, /^openai\/(dall-e|whisper|sora)/],
	},
	{
		key: "claude",
		label: "Claude",
		maker: "Anthropic",
		namespace: "anthropic/",
		exclude: [NON_CHAT],
	},
	{
		key: "deepseek",
		label: "DeepSeek",
		maker: "DeepSeek",
		namespace: "deepseek/",
		exclude: [NON_CHAT, /-(distill|prover)/],
	},
	{
		key: "gemini",
		label: "Gemini",
		maker: "Google",
		namespace: "google/gemini",
		exclude: [NON_CHAT, /-customtools/],
	},
	{
		key: "grok",
		label: "Grok",
		maker: "xAI",
		namespace: "x-ai/grok",
		exclude: [NON_CHAT],
	},
];

export const FAMILY_KEYS: readonly FamilyKey[] = FAMILIES.map((f) => f.key);

/** The families a finding's sentence singles out: those it names, unless it names every
 *  one. Its comparison table tints their rows and, on a phone, opens them. A sentence
 *  that goes row by row (»ChatGPT tar delvis avstånd; DeepSeek och Grok tar helt avstånd;
 *  Claude och Gemini avstår«) names all five, and tinting all five rows drew the whole
 *  table as one grey block (2026-10-17): an emphasis on everything marks nothing. */
export function familiesSingledOut(text: string): readonly Family[] {
	const named = FAMILIES.filter((family) => text.includes(family.label));
	return named.length < FAMILIES.length ? named : [];
}

export function getFamily(key: FamilyKey): Family {
	const family = FAMILIES.find((f) => f.key === key);
	if (!family) throw new Error(`Unknown model family: ${key}`);
	return family;
}

/** The family a catalogue id belongs to, or null for aliases, batch variants, non-chat
 *  models and other vendors. */
export function familyOfModel(id: string): FamilyKey | null {
	if (id.startsWith("~") || id.includes(":")) return null;
	const family = FAMILIES.find((f) => id.startsWith(f.namespace));
	if (!family) return null;
	return family.exclude.some((re) => re.test(id)) ? null : family.key;
}

/** Families whose answers must come from the maker's own service rather than any host of the
 *  model. Value: OpenRouter's provider slug, e.g. `{ deepseek: "deepseek" }`.
 *
 *  Empty for now. DeepSeek publishes open weights, so unpinned, OpenRouter sends DeepSeek
 *  requests to third-party hosts. They run the model itself, with whatever censorship is
 *  trained into it, but without the output filter DeepSeek's own service adds. A pin to
 *  DeepSeek was tried on 2026-09-13 and came back 404 every time: the OpenRouter key's account
 *  guardrails drop DeepSeek's own endpoint, which may retain or train on prompts. Allow that
 *  endpoint for the key in OpenRouter before setting the pin again, and say so on /metod/. */
export const OWN_PROVIDER: Partial<Record<FamilyKey, string>> = {};
