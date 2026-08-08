import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import type { ModelId } from "@islam-se/quotes";
import type { z } from "zod";

interface ClaudeStreamChunk {
	type: "text" | "tool_use" | "tool_result";
	content: string;
}

export interface ClaudeRunOptions {
	/** Path to prompt file or prompt content */
	prompt: string;
	/** Optional system prompt to append */
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
	/** Only use MCP servers from --mcp-config, ignore all other MCP configurations */
	strictMcpConfig?: boolean;
	/** Timeout in milliseconds for the subprocess (default: 900000 = 15 min) */
	timeout?: number;
	/** Content appended to the user prompt (e.g., article body). Kept out of
	 *  --append-system-prompt to prevent Claude from echoing prefix text. */
	userContent?: string;
}

interface ClaudeRunResult {
	success: boolean;
	output?: string;
	error?: string;
	exitCode?: number;
}

/** Strips ANTHROPIC_API_KEY so the CLI authenticates with the logged-in Claude Code
 *  subscription rather than billed per-token API calls. */
function subscriptionEnv(): NodeJS.ProcessEnv {
	const { ANTHROPIC_API_KEY: _omitApiKey, ...rest } = process.env;
	return rest;
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

export class ClaudeRunner extends EventEmitter {
	/**
	 * Execute a headless Claude session.
	 * Sends prompt and system prompt via stdin to avoid CLI argument size/encoding
	 * issues with non-ASCII text (Arabic quotes cause silent exit code 1 as args).
	 */
	public async run(options: ClaudeRunOptions): Promise<ClaudeRunResult> {
		let args: string[];
		let stdinContent: string;
		try {
			args = this.buildArgs(options);
			stdinContent = this.buildStdinContent(options);
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
				child.kill("SIGTERM");
			}, timeoutMs);

			child.stdout?.on("data", (data) => {
				stdout += data.toString();
			});

			child.stderr?.on("data", (data) => {
				stderr += data.toString();
			});

			child.on("close", (code) => {
				clearTimeout(timer);
				if (code === 0) {
					resolve({
						success: true,
						output: stdout.trim(),
						exitCode: code ?? undefined,
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
		try {
			args = this.buildStreamingArgs(options);
			stdinContent = this.buildStdinContent(options);
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
				child.kill("SIGTERM");
			}, timeoutMs);

			let fullOutput = "";
			let stderr = "";
			let lineBuffer = "";

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
							// Structured output from --json-schema
							if (event.structured_output !== undefined) {
								fullOutput = JSON.stringify(event.structured_output);
							} else if (!options.jsonSchema && event.result) {
								// Only use prose result when no schema expected
								fullOutput = event.result;
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
				// Process any remaining buffer
				if (lineBuffer.trim()) {
					try {
						const event = JSON.parse(lineBuffer);
						if (event.type === "result") {
							if (event.structured_output !== undefined) {
								fullOutput = JSON.stringify(event.structured_output);
							} else if (!options.jsonSchema && event.result) {
								fullOutput = event.result;
							}
						}
						if (event.type === "error" && event.error) {
							stderr += typeof event.error === "string" ? event.error : JSON.stringify(event.error);
						}
					} catch {
						fullOutput += lineBuffer;
					}
				}

				if (code === 0) {
					resolve({
						success: true,
						output: fullOutput.trim(),
						exitCode: code ?? undefined,
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
					});
				}
			});

			child.on("error", (err) => {
				clearTimeout(timer);
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
	private buildStreamingArgs(options: ClaudeRunOptions): string[] {
		const args = this.buildArgs(options);
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
	 * Build command-line arguments for claude CLI.
	 * System prompt and prompt content are sent via stdin (see buildStdinContent)
	 * to avoid argument size/encoding issues with non-ASCII text.
	 */
	private buildArgs(options: ClaudeRunOptions): string[] {
		const args: string[] = [];

		// Enable print mode (non-interactive)
		args.push("--print");

		// Moves cwd/env/git-status out of the system prompt so the cached prefix is
		// identical across runs. Silently ignored if --system-prompt is ever used here.
		args.push("--exclude-dynamic-system-prompt-sections");

		// Model
		args.push("--model", options.model);

		// MCP config for quote tools and other MCP servers
		if (options.mcpConfig) {
			args.push("--mcp-config", options.mcpConfig);
			// Only use MCP servers from explicit config, not user/project config
			if (options.strictMcpConfig) {
				args.push("--strict-mcp-config");
			}
		}

		// System prompt as --append-system-prompt flag (named args handle Unicode fine;
		// the Arabic exit-code-1 bug only affects the positional prompt argument).
		if (options.systemPrompt) {
			args.push("--append-system-prompt", options.systemPrompt);
		}

		// User prompt is sent via stdin (see buildStdinContent) to avoid the
		// positional-argument encoding bug with non-ASCII text.

		// Limit which built-in tools are loaded (--tools flag).
		// Empty array = no tools (saves prompt tokens for editorial stages).
		if (options.builtinTools !== undefined) {
			args.push("--tools", options.builtinTools.join(",") || '""');
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

		// Max tokens
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

	/**
	 * Build stdin content with the user prompt only.
	 * System prompt is passed via --append-system-prompt flag (see buildArgs).
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
