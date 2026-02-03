/**
 * Shared JSON parsing utilities for quote extraction.
 * Handles Claude's sometimes imperfect JSON output.
 */

import type { z } from "zod";

/**
 * Cleans JSON string from Claude's response, removing markdown fences and trailing commas.
 */
export function cleanJsonString(text: string): string {
	let jsonStr = text.trim();
	if (jsonStr.startsWith("```json")) jsonStr = jsonStr.slice(7);
	if (jsonStr.startsWith("```")) jsonStr = jsonStr.slice(3);
	if (jsonStr.endsWith("```")) jsonStr = jsonStr.slice(0, -3);
	return jsonStr.trim().replace(/,\s*([}\]])/g, "$1");
}

/**
 * Extracts the quotes array from a JSON string by finding matching brackets.
 * Used as fallback when standard JSON parsing fails.
 */
export function extractQuotesArray(jsonStr: string): string | null {
	const quotesMatch = jsonStr.match(/"quotes"\s*:\s*\[/);
	if (!quotesMatch) return null;

	const startIdx = jsonStr.indexOf("[", quotesMatch.index);
	let depth = 0;
	let endIdx = startIdx;

	for (let i = startIdx; i < jsonStr.length; i++) {
		if (jsonStr[i] === "[") depth++;
		if (jsonStr[i] === "]") depth--;
		if (depth === 0) {
			endIdx = i + 1;
			break;
		}
	}

	return jsonStr.slice(startIdx, endIdx).replace(/,\s*([}\]])/g, "$1");
}

/**
 * Parses a quotes response using a Zod schema.
 * Tries standard JSON parsing first, then falls back to bracket-depth extraction.
 *
 * @param responseText - Raw response text from Claude
 * @param schema - Zod schema for a single quote (will be wrapped in z.array())
 * @returns Array of parsed quotes
 */
export function parseQuotesResponse<T>(responseText: string, schema: z.ZodType<T>): T[] {
	const jsonStr = cleanJsonString(responseText);
	const arraySchema = schema.array();

	try {
		const parsed = JSON.parse(jsonStr);
		return arraySchema.parse(parsed.quotes);
	} catch {
		const quotesArray = extractQuotesArray(jsonStr);
		if (quotesArray) {
			const quotes = JSON.parse(quotesArray);
			return arraySchema.parse(quotes);
		}
		throw new Error("Failed to parse quotes from response");
	}
}

/**
 * Sleep for a given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
