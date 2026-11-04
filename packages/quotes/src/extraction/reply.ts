/**
 * What the three quote extractors (swedish, norse, arabic) share about talking to
 * Haiku: the request settings, and how the answer is read out of the reply.
 */

import type Anthropic from "@anthropic-ai/sdk";

/**
 * Request settings for one extraction call.
 *
 * Haiku 5.5 thinks by default, and thinking counts toward `max_tokens`. Its tokenizer
 * also counts the same text as about 30 % more tokens than Haiku 4.5 did. The 8,192
 * cap sized for Haiku 4.5's 30-50 quotes of JSON would cut the answer off, so the cap
 * is the non-streaming ceiling instead. Effort is set explicitly: `medium` is Haiku
 * 5.5's default, written out so that a change of default does not silently change how
 * the quotes are chosen.
 */
export const EXTRACTION_REQUEST = {
	max_tokens: 16_000,
	output_config: { effort: "medium" },
} as const satisfies Pick<
	Anthropic.MessageCreateParamsNonStreaming,
	"max_tokens" | "output_config"
>;

/** Claude's safety classifiers declined the chunk. Haiku has no server-side fallback. */
export class ExtractionRefusedError extends Error {
	override name = "ExtractionRefusedError";
}

/**
 * The answer text of a reply, read by block type.
 *
 * A Haiku 5.5 reply can begin with one or more `thinking` blocks, so the first
 * content block is not the answer. Throws when there is no usable answer: a refusal,
 * or a reply cut off at `max_tokens` (half a JSON array parses to nothing, or to a
 * silently short list of quotes).
 */
export function replyText(message: Anthropic.Message): string {
	if (message.stop_reason === "refusal") {
		const category = message.stop_details?.category ?? "no category given";
		throw new ExtractionRefusedError(
			`Claude declined to extract quotes from this chunk (${category}).`,
		);
	}
	if (message.stop_reason === "max_tokens") {
		throw new Error(
			`The reply stopped at max_tokens (${EXTRACTION_REQUEST.max_tokens}) before the JSON was complete: raise max_tokens or lower effort.`,
		);
	}
	const text = message.content
		.filter((block): block is Anthropic.TextBlock => block.type === "text")
		.map((block) => block.text)
		.join("");
	if (text.trim() === "") {
		throw new Error(`Claude's reply had no answer text (stop_reason: ${message.stop_reason}).`);
	}
	return text;
}
