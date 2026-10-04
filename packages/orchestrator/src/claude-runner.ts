import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ModelId } from "@islam-se/quotes";
import type { z } from "zod";

interface ClaudeStreamChunk {
	type: "text" | "tool_use" | "tool_result";
	content: string;
}

export interface ClaudeRunOptions {
	/** Path to prompt file or prompt content */
	prompt: string;
	/** Optional system prompt to append. Travels in a temp file, never in argv. */
	systemPrompt?: string;
	/** Tools to allow (e.g., ['WebSearch', 'Read']) */
	allowedTools?: string[];
	/** Built-in tools to load (--tools flag). Empty array = no tools. Undefined = all tools. */
	builtinTools?: string[];
	/** Output format (currently only 'json' supported) */
	outputFormat?: "json" | "text";
	/** JSON schema for built-in output validation (uses --json-schema flag) */
	jsonSchema?: object;
	/** Model to use. Resolve a tier through `getModelId` rather than hardcoding. */
	model: ModelId;
	/** Effort level for adaptive thinking */
	effort?: "low" | "medium" | "high" | "xhigh" | "max";
	/** Maximum budget in USD for this stage (uses --max-budget-usd flag) */
	maxBudgetUsd?: number;
	/** Fallback model if primary is unavailable (uses --fallback-model flag) */
	fallbackModel?: string;
	/** Disable session persistence for stateless runs (uses --no-session-persistence flag) */
	noSessionPersistence?: boolean;
	/** MCP config file path (uses --mcp-config flag) */
	mcpConfig?: string;
	/** Skip all permission checks for trusted pipeline runs (uses --dangerously-skip-permissions flag) */
	skipPermissions?: boolean;
	/** Timeout in milliseconds for the subprocess (default: 900000 = 15 min) */
	timeout?: number;
	/** Content appended to the user prompt (e.g., article body). Kept out of
	 *  --append-system-prompt to prevent Claude from echoing prefix text. */
	userContent?: string;
}

/** What the CLI reports about a finished run: which model(s) answered, and the cost. */
export interface ClaudeRunMeta {
	/** Every model that produced tokens. More than one means --fallback-model fired. */
	models: string[];
	costUsd?: number;
	turns?: number;
	/** Tokens summed over every model that answered and every turn of the run. */
	tokens?: ClaudeRunTokens;
	/** Why the last turn ended: `end_turn`, `max_tokens`, `refusal`, … */
	stopReason?: string;
}

interface ClaudeRunTokens {
	input: number;
	cacheRead: number;
	cacheWrite: number;
	output: number;
}

interface ClaudeRunResult {
	success: boolean;
	output?: string;
	error?: string;
	exitCode?: number;
	meta?: ClaudeRunMeta;
}

/**
 * Choose the prose output of a streamed run: the stream's accumulated assistant text, or
 * the `result` event's text.
 *
 * ⚠️ `result` carries only the LAST assistant text block. When a long answer is split
 * across messages (an output-token continuation, or a tool call mid-answer), `result`
 * starts mid-body and the frontmatter fence is gone. That failed the fördjupning review on
 * »Artificiell intelligens« (2026-09-25) twice in a row: "no --- fenced block found",
 * 35 812 and 24 340 chars, both starting mid-sentence, while the full text had streamed
 * past as assistant events. Prefer the accumulation only in exactly that shape, so every
 * answer that parsed before parses identically.
 */
export function pickProseOutput(accumulated: string, finalResult: string | undefined): string {
	if (!finalResult) return accumulated;
	const fence = /^---[ \t]*$/m;
	if (
		!fence.test(finalResult) &&
		fence.test(accumulated) &&
		accumulated.includes(finalResult.trim().slice(-200))
	) {
		return accumulated;
	}
	return finalResult;
}

/** Read model usage from a CLI `result` object (--output-format json, or the stream's last event). */
function runMetaFrom(result: unknown): ClaudeRunMeta | undefined {
	if (!(result && typeof result === "object")) return undefined;
	const r = result as {
		modelUsage?: Record<string, unknown>;
		total_cost_usd?: number;
		num_turns?: number;
		stop_reason?: unknown;
	};
	if (!r.modelUsage || typeof r.modelUsage !== "object") return undefined;
	return {
		models: Object.keys(r.modelUsage),
		costUsd: typeof r.total_cost_usd === "number" ? r.total_cost_usd : undefined,
		turns: typeof r.num_turns === "number" ? r.num_turns : undefined,
		tokens: sumTokens(r.modelUsage),
		stopReason: typeof r.stop_reason === "string" ? r.stop_reason : undefined,
	};
}

function sumTokens(modelUsage: Record<string, unknown>): ClaudeRunTokens {
	const total: ClaudeRunTokens = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
	const add = (key: keyof ClaudeRunTokens, value: unknown) => {
		if (typeof value === "number") total[key] += value;
	};
	for (const usage of Object.values(modelUsage)) {
		if (!(usage && typeof usage === "object")) continue;
		const u = usage as Record<string, unknown>;
		add("input", u.inputTokens);
		add("cacheRead", u.cacheReadInputTokens);
		add("cacheWrite", u.cacheCreationInputTokens);
		add("output", u.outputTokens);
	}
	return total;
}

/** The `result` envelope of --output-format json, when stdout is one. */
function resultEnvelope(stdout: string): Record<string, unknown> | undefined {
	const trimmed = stdout.trim();
	if (!trimmed.startsWith("{")) return undefined;
	try {
		const parsed: unknown = JSON.parse(trimmed);
		if (!(parsed && typeof parsed === "object")) return undefined;
		const envelope = parsed as Record<string, unknown>;
		return envelope.type === "result" ? envelope : undefined;
	} catch {
		return undefined;
	}
}

/** The CLI can exit 0 and still report failure (budget exceeded, refusal, API error). */
function cliErrorFrom(event: {
	is_error?: unknown;
	result?: unknown;
	subtype?: unknown;
}): string | undefined {
	if (!event.is_error) return undefined;
	return typeof event.result === "string" && event.result
		? event.result
		: `CLI error: ${typeof event.subtype === "string" ? event.subtype : "unknown"}`;
}

/**
 * The system prompt goes to the CLI as a file. As an argv string it is capped by the
 * kernel at 131 072 bytes per argument, and the review and authoring prompts carry the
 * whole research (75 KB on »Guds vägar«); past the cap the spawn dies with E2BIG after the
 * research and fact-check have already been paid for.
 */
function writeSystemPromptFile(
	systemPrompt: string | undefined,
): { path: string; remove: () => void } | undefined {
	if (!systemPrompt) return undefined;
	const dir = mkdtempSync(join(tmpdir(), "islamse-claude-"));
	const path = join(dir, "system-prompt.md");
	writeFileSync(path, systemPrompt, "utf-8");
	return { path, remove: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Strips ANTHROPIC_API_KEY so the CLI authenticates with the logged-in Claude Code
 *  subscription rather than billed per-token API calls. */
function subscriptionEnv(): NodeJS.ProcessEnv {
	const { ANTHROPIC_API_KEY: _omitApiKey, ...rest } = process.env;
	return rest;
}

/**
 * Stop a child that ran past its timeout: SIGTERM, then SIGKILL if it is still alive ten
 * seconds later. With SIGTERM alone, a CLI that ignored the signal never closed, the
 * promise never settled, and the run would hang with no error.
 */
export function terminate(child: ReturnType<typeof spawn>, graceMs = 10_000): void {
	child.kill("SIGTERM");
	const force = setTimeout(() => {
		if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
	}, graceMs);
	force.unref();
	child.once("close", () => clearTimeout(force));
}

/** Writes the prompt to stdin. The child can exit before stdin drains (bad flag,
 *  auth failure); an unhandled EPIPE on the stream would crash the whole run. */
function writeStdin(child: ReturnType<typeof spawn>, content: string): void {
	child.stdin?.on("error", () => {
		// Swallowed: the close handler reports the real failure.
	});
	child.stdin?.write(content);
	child.stdin?.end();
}

/**
 * Build the argv for a headless `claude` run. The user prompt is not here (stdin), and the
 * system prompt is named by file.
 */
export function buildClaudeArgs(options: ClaudeRunOptions, systemPromptFile?: string): string[] {
	const args: string[] = [];

	// Enable print mode (non-interactive)
	args.push("--print");

	// Moves cwd/env/git-status out of the system prompt so the cached prefix is
	// identical across runs. Silently ignored if --system-prompt is ever used here.
	args.push("--exclude-dynamic-system-prompt-sections");

	// Isolation from the operator's own Claude Code setup. Without these three flags a
	// stage inherits every user-scope MCP server, plugin and skill: measured 2026-10-04,
	// an editorial stage with `--tools ""` still loaded 204 MCP tools from 12 servers
	// (Gmail, Notion, Supabase, …) and 59 skills, a 164 600-token prefix against 6 700 with
	// the flags. The author of »Kaffet inför rätta« spent part of its answer reporting which
	// of those servers needed authorising. --strict-mcp-config works without --mcp-config
	// (zero servers); --bare would do all of this but refuses the subscription login.
	args.push("--strict-mcp-config", "--disable-slash-commands", "--setting-sources", "");

	// Model
	args.push("--model", options.model);

	// MCP config for quote tools and other MCP servers
	if (options.mcpConfig) {
		args.push("--mcp-config", options.mcpConfig);
	}

	if (systemPromptFile) {
		args.push("--append-system-prompt-file", systemPromptFile);
	}

	// Limit which built-in tools are loaded (--tools flag).
	// Empty array = no tools (saves prompt tokens for editorial stages).
	if (options.builtinTools !== undefined) {
		args.push("--tools", options.builtinTools.join(","));
	}

	// Allowed tools (controls which tools execute without permission prompts)
	if (options.allowedTools && options.allowedTools.length > 0) {
		args.push("--allowedTools", options.allowedTools.join(","));
	}

	// JSON schema for built-in validation (implies json output format)
	if (options.jsonSchema) {
		args.push("--json-schema", JSON.stringify(options.jsonSchema));
		args.push("--output-format", "json");
	} else if (options.outputFormat === "json") {
		// Only add output format if no schema (schema implies json)
		args.push("--output-format", "json");
	}

	// Cost control
	if (options.maxBudgetUsd) {
		args.push("--max-budget-usd", options.maxBudgetUsd.toString());
	}

	// Model fallback for resilience
	if (options.fallbackModel) {
		args.push("--fallback-model", options.fallbackModel);
	}

	// Stateless sessions for pipeline runs
	if (options.noSessionPersistence) {
		args.push("--no-session-persistence");
	}

	// Skip permission checks for trusted pipeline runs
	if (options.skipPermissions) {
		args.push("--dangerously-skip-permissions");
	}

	// Effort level for adaptive thinking
	if (options.effort) {
		args.push("--effort", options.effort);
	}

	return args;
}

export class ClaudeRunner extends EventEmitter {
	/**
	 * Execute a headless Claude session.
	 * The user prompt goes via stdin and the system prompt via a temp file: as a positional
	 * argument, non-ASCII text (Arabic quotes) made the CLI exit 1 silently, and any argv
	 * string is capped in size.
	 */
	public async run(options: ClaudeRunOptions): Promise<ClaudeRunResult> {
		let args: string[];
		let stdinContent: string;
		let systemPromptFile: ReturnType<typeof writeSystemPromptFile>;
		try {
			stdinContent = this.buildStdinContent(options);
			systemPromptFile = writeSystemPromptFile(options.systemPrompt);
			args = buildClaudeArgs(options, systemPromptFile?.path);
		} catch (err) {
			return {
				success: false,
				error: `Setup failed: ${err instanceof Error ? err.message : String(err)}`,
			};
		}

		const timeoutMs = options.timeout ?? 900000; // 15 min default

		return new Promise((resolve) => {
			const child = spawn("claude", args, {
				stdio: ["pipe", "pipe", "pipe"],
				env: subscriptionEnv(),
				cwd: tmpdir(),
			});

			let stdout = "";
			let stderr = "";
			let timedOut = false;

			// Write prompt via stdin (handles Arabic/non-ASCII safely)
			writeStdin(child, stdinContent);

			// Subprocess timeout
			const timer = setTimeout(() => {
				timedOut = true;
				terminate(child);
			}, timeoutMs);

			child.stdout?.on("data", (data) => {
				stdout += data.toString();
			});

			child.stderr?.on("data", (data) => {
				stderr += data.toString();
			});

			child.on("close", (code) => {
				clearTimeout(timer);
				systemPromptFile?.remove();
				const envelope = resultEnvelope(stdout);
				const meta = runMetaFrom(envelope);
				const cliError = envelope ? cliErrorFrom(envelope) : undefined;
				if (code === 0 && cliError) {
					resolve({ success: false, error: cliError, exitCode: code, meta });
				} else if (code === 0) {
					resolve({
						success: true,
						output: stdout.trim(),
						exitCode: code ?? undefined,
						meta,
					});
				} else {
					const error = timedOut
						? `Subprocess timed out after ${timeoutMs / 1000}s`
						: stderr || `Process exited with code ${code}`;
					resolve({
						success: false,
						error,
						exitCode: code ?? undefined,
					});
				}
			});

			child.on("error", (err) => {
				clearTimeout(timer);
				systemPromptFile?.remove();
				resolve({
					success: false,
					error: err.message,
				});
			});
		});
	}

	/**
	 * Execute with streaming - emits 'chunk' events with text fragments
	 */
	public async runWithStreaming(
		options: ClaudeRunOptions,
		onChunk?: (chunk: ClaudeStreamChunk) => void,
	): Promise<ClaudeRunResult> {
		let args: string[];
		let stdinContent: string;
		let systemPromptFile: ReturnType<typeof writeSystemPromptFile>;
		try {
			stdinContent = this.buildStdinContent(options);
			systemPromptFile = writeSystemPromptFile(options.systemPrompt);
			args = this.buildStreamingArgs(options, systemPromptFile?.path);
		} catch (err) {
			return {
				success: false,
				error: `Setup failed: ${err instanceof Error ? err.message : String(err)}`,
			};
		}

		const timeoutMs = options.timeout ?? 900000; // 15 min default

		return new Promise((resolve) => {
			const child = spawn("claude", args, {
				stdio: ["pipe", "pipe", "pipe"],
				env: subscriptionEnv(),
				cwd: tmpdir(),
			});

			let timedOut = false;

			// Write prompt via stdin
			writeStdin(child, stdinContent);

			// Subprocess timeout
			const timer = setTimeout(() => {
				timedOut = true;
				terminate(child);
			}, timeoutMs);

			let fullOutput = "";
			let stderr = "";
			let lineBuffer = "";
			let meta: ClaudeRunMeta | undefined;
			let cliError: string | undefined;

			// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: streaming event parser with multiple format branches
			child.stdout?.on("data", (data) => {
				const text = data.toString();
				lineBuffer += text;

				// Process complete lines (stream-json outputs one JSON object per line)
				const lines = lineBuffer.split("\n");
				lineBuffer = lines.pop() || ""; // Keep incomplete line in buffer

				for (const line of lines) {
					if (!line.trim()) continue;
					try {
						const event = JSON.parse(line);
						this.processStreamEvent(event, onChunk);

						// Accumulate result content from assistant messages.
						// Skip when jsonSchema is set — the only valid output is
						// structured_output from the result event. Accumulating prose
						// ("I'll research this topic...") causes parse failures.
						if (!options.jsonSchema && event.type === "assistant" && event.message?.content) {
							for (const block of event.message.content) {
								if (block.type === "text") {
									fullOutput += block.text;
								}
							}
						}

						// Capture final result - could be in different formats
						if (event.type === "result") {
							meta = runMetaFrom(event) ?? meta;
							cliError = cliErrorFrom(event) ?? cliError;
							// Structured output from --json-schema
							if (event.structured_output !== undefined) {
								fullOutput = JSON.stringify(event.structured_output);
							} else if (!options.jsonSchema && event.result) {
								// Only use prose result when no schema expected
								fullOutput = pickProseOutput(fullOutput, event.result);
							}
						}

						// Capture errors
						if (event.type === "error" && event.error) {
							stderr += typeof event.error === "string" ? event.error : JSON.stringify(event.error);
						}
					} catch {
						// Not JSON, might be raw output - accumulate it
						fullOutput += line;
					}
				}
			});

			child.stderr?.on("data", (data) => {
				stderr += data.toString();
			});

			// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: exit handler with multiple output format paths
			child.on("close", (code) => {
				clearTimeout(timer);
				systemPromptFile?.remove();
				// Process any remaining buffer
				if (lineBuffer.trim()) {
					try {
						const event = JSON.parse(lineBuffer);
						if (event.type === "result") {
							meta = runMetaFrom(event) ?? meta;
							cliError = cliErrorFrom(event) ?? cliError;
							if (event.structured_output !== undefined) {
								fullOutput = JSON.stringify(event.structured_output);
							} else if (!options.jsonSchema && event.result) {
								fullOutput = pickProseOutput(fullOutput, event.result);
							}
						}
						if (event.type === "error" && event.error) {
							stderr += typeof event.error === "string" ? event.error : JSON.stringify(event.error);
						}
					} catch {
						fullOutput += lineBuffer;
					}
				}

				if (code === 0 && cliError) {
					resolve({ success: false, error: cliError, exitCode: code, meta });
				} else if (code === 0) {
					resolve({
						success: true,
						output: fullOutput.trim(),
						exitCode: code ?? undefined,
						meta,
					});
				} else {
					const error = timedOut
						? `Subprocess timed out after ${timeoutMs / 1000}s`
						: stderr || `Process exited with code ${code}`;
					resolve({
						success: false,
						error,
						output: fullOutput.trim(), // Include output even on failure for debugging
						exitCode: code ?? undefined,
						meta,
					});
				}
			});

			child.on("error", (err) => {
				clearTimeout(timer);
				systemPromptFile?.remove();
				resolve({
					success: false,
					error: err.message,
				});
			});
		});
	}

	/**
	 * Process streaming events and extract interesting content
	 * Focus on actual output (quotes, text) rather than tool requests
	 */
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: event type dispatcher with many branches
	private processStreamEvent(
		event: Record<string, unknown>,
		onChunk?: (chunk: ClaudeStreamChunk) => void,
	): void {
		if (!onChunk) return;

		// Handle assistant text output (Claude's writing)
		if (event.type === "assistant" && event.message) {
			const message = event.message as {
				content?: Array<{ type: string; text?: string; name?: string }>;
			};
			if (message.content) {
				for (const block of message.content) {
					if (block.type === "text" && block.text) {
						// Extract all interesting snippets from the text
						const snippets = this.extractAllSnippets(block.text);
						for (const snippet of snippets) {
							onChunk({ type: "text", content: snippet });
						}
					}
					// Skip tool_use - we want results, not requests
				}
			}
		}

		// Handle tool results - this is where the good content is!
		if (event.type === "user" && event.message) {
			const message = event.message as { content?: Array<{ type: string; content?: string }> };
			if (message.content) {
				for (const block of message.content) {
					if (block.type === "tool_result" && block.content) {
						const snippets = this.extractToolResultSnippets(block.content);
						for (const snippet of snippets) {
							onChunk({ type: "tool_result", content: snippet });
						}
					}
				}
			}
		}
	}

	/**
	 * Extract multiple interesting snippets from text
	 */
	private extractAllSnippets(text: string): string[] {
		const snippets: string[] = [];

		// Look for all quoted text - full length
		const quoteMatches = text.matchAll(/"([^"]{30,})"/g);
		for (const match of quoteMatches) {
			if (match[1]) {
				snippets.push(`"${match[1]}"`);
			}
		}

		// Look for Arabic text (often quotes) - full length
		const arabicMatch = text.match(/[\u0600-\u06FF]{20,}/);
		if (arabicMatch) {
			snippets.push(arabicMatch[0]);
		}

		// Look for findings/conclusions
		const keyTerms = /(?:found|discovered|reveals|shows|argues|claims|concludes|demonstrates)/i;
		const sentences = text.split(/[.!?]+/);
		for (const sentence of sentences) {
			const trimmed = sentence.trim();
			if (keyTerms.test(trimmed) && trimmed.length > 40) {
				snippets.push(trimmed);
				break; // Just one finding per chunk
			}
		}

		return snippets.slice(0, 3); // Max 3 per event
	}

	/**
	 * Extract multiple snippets from tool results (quotes, passages, etc.)
	 */
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: multi-format content extraction
	private extractToolResultSnippets(content: string): string[] {
		const snippets: string[] = [];

		try {
			const data = JSON.parse(content);

			// Quote search results - extract full quotes
			if (Array.isArray(data)) {
				for (const item of data.slice(0, 3)) {
					if (item?.text && item?.author) {
						snippets.push(`"${item.text}" — ${item.author}`);
					} else if (item?.passage || item?.content) {
						snippets.push(item.passage || item.content);
					}
				}
			}

			// Single result object
			if (data && typeof data === "object" && !Array.isArray(data)) {
				if (data.text && data.author) {
					snippets.push(`"${data.text}" — ${data.author}`);
				}
				if (data.summary) {
					snippets.push(data.summary);
				}
				if (data.content && typeof data.content === "string") {
					snippets.push(data.content);
				}
			}
		} catch {
			// Not JSON - might be plain text result
			if (content.length > 50) {
				// Look for quote-like patterns
				const quoteMatch = content.match(/"([^"]{30,})"/);
				if (quoteMatch?.[1]) {
					snippets.push(`"${quoteMatch[1]}"`);
				} else {
					snippets.push(content);
				}
			}
		}

		return snippets;
	}

	/**
	 * Build args for streaming mode
	 */
	private buildStreamingArgs(options: ClaudeRunOptions, systemPromptFile?: string): string[] {
		const args = buildClaudeArgs(options, systemPromptFile);
		// Replace output format with stream-json (requires --verbose with --print)
		const formatIdx = args.indexOf("--output-format");
		if (formatIdx === -1) {
			args.push("--output-format", "stream-json");
		} else {
			args[formatIdx + 1] = "stream-json";
		}
		// Add --verbose flag required for stream-json with --print
		if (!args.includes("--verbose")) {
			args.push("--verbose");
		}
		return args;
	}

	/**
	 * Build stdin content with the user prompt only.
	 * The system prompt travels separately, in a temp file (see buildClaudeArgs).
	 * Throws on missing prompt files (instead of silently falling back to the path string).
	 */
	private buildStdinContent(options: ClaudeRunOptions): string {
		let promptContent = options.prompt;
		if (options.prompt.endsWith(".md") || options.prompt.endsWith(".txt")) {
			// Let readFileSync throw on missing files — caller gets a clear error
			promptContent = readFileSync(options.prompt, "utf-8");
		}
		if (options.userContent) {
			promptContent += `\n\n${options.userContent}`;
		}
		return promptContent;
	}

	/**
	 * Run for free text (the markdown stages). Streams rather than asking for the JSON
	 * envelope: the envelope's `result` holds only the LAST assistant text block, so a long
	 * answer split across messages came back as its tail with the frontmatter gone (see
	 * pickProseOutput). The stream sees every block, and its result event still carries the
	 * model record and `is_error`.
	 */
	public async runText(options: ClaudeRunOptions): Promise<ClaudeRunResult> {
		return this.runWithStreaming(options);
	}

	/**
	 * Parse output in frontmatter + markdown body format.
	 * Expected format:
	 *   ---
	 *   { "title": "...", "reflection": "..." }
	 *   ---
	 *
	 *   # Article body in markdown...
	 *
	 * The frontmatter between --- markers is JSON metadata.
	 * Everything after the closing --- is the markdown body.
	 * Any preamble text before the first --- is ignored (Claude thinking).
	 */
	public parseMarkdownWithMeta(output: string): { meta: unknown; body: string } | null {
		return this.parseMarkdownWithMetaDetailed(output).parsed;
	}

	/**
	 * As parseMarkdownWithMeta, but reports which step failed. Callers that discard a
	 * long stage output on failure should log `reason` — "no frontmatter block found"
	 * is wrong in two of the three failure modes.
	 */
	public parseMarkdownWithMetaDetailed(output: string): {
		parsed: { meta: unknown; body: string } | null;
		reason?: string;
	} {
		const candidates = this.frontmatterCandidates(output);
		if (candidates.length === 0) return { parsed: null, reason: "no --- fenced block found" };

		let lastError = "";
		for (const cand of candidates) {
			const meta = this.parseMetaBlock(cand.raw);
			if (meta.ok) {
				return { parsed: { meta: meta.value, body: output.slice(cand.bodyStart).trim() } };
			}
			lastError = meta.error;
		}
		return {
			parsed: null,
			reason: `--- block found but its metadata would not parse (${lastError})`,
		};
	}

	/**
	 * Frontmatter regions to try, in order. The lazy-regex candidate is first so that
	 * output which parses today keeps parsing identically; the brace-balanced candidate
	 * only rescues cases the regex truncates.
	 */
	private frontmatterCandidates(output: string): { raw: string; bodyStart: number }[] {
		const out: { raw: string; bodyStart: number }[] = [];

		const fmMatch = output.match(/---[ \t]*\n([\s\S]*?)\n---/);
		if (fmMatch?.[1]) {
			out.push({
				raw: fmMatch[1].trim(),
				bodyStart: output.indexOf(fmMatch[0]) + fmMatch[0].length,
			});
		}

		// ⚠️ A `---` line inside the JSON (a reviewer quoting the body's footnote rule, say)
		// truncates the lazy regex mid-object. Balance braces instead, then treat the next
		// `---` line as the closing fence.
		const openIdx = output.search(/---[ \t]*\n/);
		if (openIdx !== -1) {
			const braceIdx = output.indexOf("{", openIdx);
			if (braceIdx !== -1) {
				const balanced = this.extractJSON(output.slice(braceIdx));
				if (balanced) {
					const afterJson = braceIdx + balanced.length;
					const fence = output.slice(afterJson).search(/\n[ \t]*---[ \t]*(\n|$)/);
					const bodyStart =
						fence === -1
							? afterJson
							: afterJson + fence + output.slice(afterJson + fence).indexOf("---") + 3;
					out.push({ raw: balanced, bodyStart });
				}
			}
		}
		return out;
	}

	private parseMetaBlock(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
		const attempts = [raw, this.extractJSON(raw), this.repairJSONStrings(raw)];
		let error = "not valid JSON";
		for (const text of attempts) {
			if (!text) continue;
			try {
				return { ok: true, value: JSON.parse(text) };
			} catch (e) {
				error = e instanceof Error ? e.message : String(e);
			}
		}
		return { ok: false, error };
	}

	/**
	 * Escape raw control characters that models leave unescaped inside JSON strings.
	 * Only touches characters inside string literals, so structure is never altered.
	 */
	private repairJSONStrings(text: string): string {
		const ESCAPES: Record<string, string> = { "\n": "\\n", "\r": "\\r", "\t": "\\t" };
		let out = "";
		let inString = false;
		let escapeNext = false;
		for (const char of text) {
			if (escapeNext) {
				out += char;
				escapeNext = false;
				continue;
			}
			if (char === "\\") {
				out += char;
				escapeNext = true;
				continue;
			}
			if (char === '"') {
				inString = !inString;
				out += char;
				continue;
			}
			out += inString && ESCAPES[char] ? ESCAPES[char] : char;
		}
		return out;
	}

	/**
	 * Extract JSON from text that may have surrounding content
	 */
	private extractJSON(text: string): string | null {
		// First try markdown code blocks
		const codeBlockMatch = text.match(/```json\s*\n([\s\S]*?)\n```/);
		if (codeBlockMatch?.[1]) {
			return codeBlockMatch[1];
		}

		// Find the first { and try to extract balanced JSON
		const startIdx = text.indexOf("{");
		if (startIdx === -1) return null;

		let braceCount = 0;
		let inString = false;
		let escapeNext = false;

		for (let i = startIdx; i < text.length; i++) {
			const char = text[i];

			if (escapeNext) {
				escapeNext = false;
				continue;
			}

			if (char === "\\") {
				escapeNext = true;
				continue;
			}

			if (char === '"') {
				inString = !inString;
				continue;
			}

			if (!inString) {
				if (char === "{") braceCount++;
				if (char === "}") {
					braceCount--;
					if (braceCount === 0) {
						return text.slice(startIdx, i + 1);
					}
				}
			}
		}

		return null;
	}

	/**
	 * Parse JSON output from Claude CLI
	 */
	public parseJSONOutput<T = unknown>(output: string): T | null {
		try {
			// Claude CLI with --output-format json returns structured output
			const cliOutput = JSON.parse(output);

			// When --json-schema is used, structured_output contains validated JSON directly
			if (
				cliOutput &&
				typeof cliOutput === "object" &&
				"structured_output" in cliOutput &&
				cliOutput.structured_output !== undefined
			) {
				return cliOutput.structured_output as T;
			}

			// Fallback for non-schema responses: extract JSON from result field
			if (cliOutput && typeof cliOutput === "object" && "result" in cliOutput) {
				const resultText = cliOutput.result as string;

				// Extract JSON from the result (may have surrounding text)
				const jsonStr = this.extractJSON(resultText);
				if (jsonStr) {
					return JSON.parse(jsonStr);
				}

				return null;
			}

			// Fallback: direct parsing (for non-CLI usage)
			const jsonStr = this.extractJSON(output);
			if (jsonStr) {
				return JSON.parse(jsonStr);
			}

			return JSON.parse(output);
		} catch {
			return null;
		}
	}

	/**
	 * Validate output against a Zod schema.
	 * Returns the validated data if successful, or null with error logged if failed.
	 */
	public validateOutput<T>(
		output: unknown,
		schema: z.ZodSchema<T>,
	): { success: true; data: T } | { success: false; error: string } {
		const result = schema.safeParse(output);
		if (result.success) {
			return { success: true, data: result.data };
		}
		const errorMessages = result.error.issues
			.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
			.join("; ");
		return { success: false, error: `Validation failed: ${errorMessages}` };
	}

	/**
	 * Run with JSON output and parsing.
	 * Optionally validates output against a Zod schema for improved reliability.
	 */
	public async runJSON<T = unknown>(
		options: ClaudeRunOptions,
		schema?: z.ZodSchema<T>,
	): Promise<ClaudeRunResult & { data?: T }> {
		const result = await this.run({
			...options,
			outputFormat: "json",
		});

		if (result.success && result.output) {
			const parsed = this.parseJSONOutput<unknown>(result.output);
			if (!parsed) {
				return { ...result, data: undefined };
			}

			// Validate against schema if provided
			if (schema) {
				const validation = this.validateOutput(parsed, schema);
				if (!validation.success) {
					return {
						success: false,
						error: validation.error,
						output: result.output,
						exitCode: result.exitCode,
					};
				}
				return { ...result, data: validation.data };
			}

			// No schema provided, return parsed data as-is
			return { ...result, data: parsed as T };
		}

		return result;
	}
}
