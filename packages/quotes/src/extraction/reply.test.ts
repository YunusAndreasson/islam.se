import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { ExtractionRefusedError, replyText } from "./reply.js";

function reply(
	content: unknown[],
	stop_reason: Anthropic.StopReason = "end_turn",
	category?: string,
): Anthropic.Message {
	return {
		id: "msg_test",
		type: "message",
		role: "assistant",
		model: "claude-haiku-5-5",
		content,
		stop_reason,
		stop_details: category === undefined ? null : { type: "refusal", category, explanation: null },
		stop_sequence: null,
		usage: { input_tokens: 1, output_tokens: 1 },
	} as Anthropic.Message;
}

const json = '{"quotes":[{"text":"…"}]}';

describe("replyText", () => {
	// Regression: the extractors read response.content[0] as the answer. Haiku 5.5 thinks
	// by default and its replies open with a thinking block (empty text, a signature), so
	// every chunk threw »Unexpected response type« after the model bump.
	it("skips the thinking blocks a Haiku 5.5 reply opens with", () => {
		const message = reply([
			{ type: "thinking", thinking: "", signature: "sig" },
			{ type: "text", text: json, citations: null },
		]);
		expect(replyText(message), "the answer is the text block, wherever it sits").toBe(json);
	});

	it("joins the answer when it comes in several text blocks", () => {
		const message = reply([
			{ type: "text", text: '{"quotes":', citations: null },
			{ type: "text", text: "[]}", citations: null },
		]);
		expect(replyText(message), "a split answer must reach the JSON parser whole").toBe(
			'{"quotes":[]}',
		);
	});

	it("names a refusal and its category instead of parsing an empty answer", () => {
		const message = reply([], "refusal", "general_harms");
		expect(() => replyText(message), "a declined chunk has no quotes; say why").toThrow(
			ExtractionRefusedError,
		);
		expect(() => replyText(message)).toThrow(/general_harms/);
	});

	it("refuses an answer cut off at max_tokens", () => {
		const message = reply(
			[{ type: "text", text: '{"quotes":[{"text":"half', citations: null }],
			"max_tokens",
		);
		expect(
			() => replyText(message),
			"half a JSON array would parse to a silently short list of quotes",
		).toThrow(/max_tokens/);
	});

	it("throws when the reply is only thinking", () => {
		const message = reply([{ type: "thinking", thinking: "", signature: "sig" }]);
		expect(
			() => replyText(message),
			"no text block means no answer, not an empty quote list",
		).toThrow(/no answer text/);
	});
});
