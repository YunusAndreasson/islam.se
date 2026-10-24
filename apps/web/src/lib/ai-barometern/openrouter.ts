import { SITE_URL } from "../config";
import type { CatalogueModel, Usage } from "./types";

// A minimal OpenRouter client for the AI-barometern runner: plain fetch, no SDK, so
// apps/web gains no dependency. Retries mirror packages/orchestrator's podcast service:
// 429 and 5xx back off 2000 ms × attempt. Failures are returned, never thrown, so one bad
// cell cannot abort a run that has already spent money.

// Overridable so the runner can be exercised end to end against a local mock server.
const BASE = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";

const ATTRIBUTION = {
	"HTTP-Referer": SITE_URL,
	"X-Title": "islam.se AI-barometern",
} as const;

export interface ChatSuccess {
	ok: true;
	content: string | null;
	refusal: string | null;
	finishReason: string | null;
	responseModel: string | null;
	provider: string | null;
	generationId: string | null;
	usage: Usage;
	latencyMs: number;
	attempts: number;
}

export interface ChatFailure {
	ok: false;
	error: string;
	status: number | null;
	latencyMs: number;
	attempts: number;
}

export type ChatResult = ChatSuccess | ChatFailure;

interface ChatResponse {
	id?: string;
	model?: string;
	provider?: string;
	error?: { code?: number | string; message?: string };
	choices?: {
		finish_reason?: string | null;
		message?: {
			content?: string | { type?: string; text?: string }[] | null;
			refusal?: string | null;
		};
	}[];
	usage?: {
		prompt_tokens?: number;
		completion_tokens?: number;
		cost?: number;
		completion_tokens_details?: { reasoning_tokens?: number };
	};
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function contentText(
	content: NonNullable<ChatResponse["choices"]>[number]["message"],
): string | null {
	const c = content?.content;
	if (typeof c === "string") return c;
	if (Array.isArray(c)) return c.map((part) => part.text ?? "").join("");
	return null;
}

function retryable(status: number): boolean {
	return status === 408 || status === 429 || status >= 500;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one retry loop over three failure shapes (HTTP, API error body, network)
export async function chatCompletion(
	apiKey: string,
	body: Record<string, unknown>,
	opts: { maxAttempts?: number; timeoutMs?: number } = {},
): Promise<ChatResult> {
	const maxAttempts = opts.maxAttempts ?? 4;
	const timeoutMs = opts.timeoutMs ?? 180_000;
	const started = Date.now();
	let lastError = "";
	let lastStatus: number | null = null;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			const res = await fetch(`${BASE}/chat/completions`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
					...ATTRIBUTION,
				},
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(timeoutMs),
			});
			lastStatus = res.status;
			const text = await res.text();
			if (!res.ok) {
				lastError = `HTTP ${res.status}: ${text.slice(0, 400)}`;
				if (retryable(res.status) && attempt < maxAttempts) {
					await sleep(2000 * attempt);
					continue;
				}
				return {
					ok: false,
					error: lastError,
					status: res.status,
					latencyMs: Date.now() - started,
					attempts: attempt,
				};
			}
			const json = JSON.parse(text) as ChatResponse;
			if (json.error) {
				const code = Number(json.error.code);
				lastError = `API ${json.error.code ?? "?"}: ${json.error.message ?? "okänt fel"}`;
				if (Number.isFinite(code) && retryable(code) && attempt < maxAttempts) {
					await sleep(2000 * attempt);
					continue;
				}
				return {
					ok: false,
					error: lastError,
					status: Number.isFinite(code) ? code : null,
					latencyMs: Date.now() - started,
					attempts: attempt,
				};
			}
			const choice = json.choices?.[0];
			return {
				ok: true,
				content: contentText(choice?.message),
				refusal: choice?.message?.refusal ?? null,
				finishReason: choice?.finish_reason ?? null,
				responseModel: json.model ?? null,
				provider: json.provider ?? null,
				generationId: json.id ?? null,
				usage: {
					promptTokens: json.usage?.prompt_tokens ?? 0,
					completionTokens: json.usage?.completion_tokens ?? 0,
					reasoningTokens: json.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
					costUsd: json.usage?.cost ?? 0,
				},
				latencyMs: Date.now() - started,
				attempts: attempt,
			};
		} catch (err) {
			lastError = err instanceof Error ? err.message : String(err);
			if (attempt < maxAttempts) {
				await sleep(2000 * attempt);
			}
		}
	}
	return {
		ok: false,
		error: lastError,
		status: lastStatus,
		latencyMs: Date.now() - started,
		attempts: maxAttempts,
	};
}

export async function fetchCatalogue(): Promise<CatalogueModel[]> {
	const res = await fetch(`${BASE}/models`, { headers: { ...ATTRIBUTION } });
	if (!res.ok) throw new Error(`OpenRouter /models: HTTP ${res.status}`);
	const json = (await res.json()) as { data?: CatalogueModel[] };
	if (!Array.isArray(json.data)) throw new Error("OpenRouter /models: oväntat svar");
	return json.data;
}

export interface KeyStatus {
	limit: number | null;
	limitRemaining: number | null;
	usage: number;
}

export async function fetchKeyStatus(apiKey: string): Promise<KeyStatus> {
	const res = await fetch(`${BASE}/key`, { headers: { Authorization: `Bearer ${apiKey}` } });
	if (!res.ok) throw new Error(`OpenRouter /key: HTTP ${res.status}`);
	const json = (await res.json()) as {
		data?: { limit?: number | null; limit_remaining?: number | null; usage?: number };
	};
	return {
		limit: json.data?.limit ?? null,
		limitRemaining: json.data?.limit_remaining ?? null,
		usage: json.data?.usage ?? 0,
	};
}
