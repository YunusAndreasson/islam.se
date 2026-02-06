import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import type { z } from "zod";

export interface ClaudeStreamChunk {
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
	/** Output format (currently only 'json' supported) */
	outputFormat?: "json" | "text";
	/** JSON schema for built-in output validation (uses --json-schema flag) */
	jsonSchema?: object;
	/** Model to use */
	model: "claude-opus-4-6" | "claude-sonnet-4-5-20250929";
	/** Effort level for adaptive thinking (Opus 4.6 only) */
	effort?: "low" | "medium" | "high" | "max";
	/** Maximum tokens for output */
	maxTokens?: number;
	/** Maximum budget in USD for this stage (uses --max-budget-usd flag) */
	maxBudgetUsd?: number;
	/** Maximum agentic turns before stopping (uses --max-turns flag) */
	maxTurns?: number;
	/** Fallback model if primary is unavailable (uses --fallback-model flag) */
	fallbackModel?: string;
	/** Disable session persistence for stateless runs (uses --no-session-persistence flag) */
	noSessionPersistence?: boolean;
	/** MCP config file path (uses --mcp-config flag) */
	mcpConfig?: string;
	/** Skip all permission checks for trusted pipeline runs (uses --dangerously-skip-permissions flag) */
	skipPermissions?: boolean;
}

export interface ClaudeRunResult {
	success: boolean;
	output?: string;
	error?: string;
	exitCode?: number;
}

export class ClaudeRunner extends EventEmitter {
	/**
	 * Execute a headless Claude session
	 */
	public async run(options: ClaudeRunOptions): Promise<ClaudeRunResult> {
		const args = this.buildArgs(options);

		return new Promise((resolve) => {
			const env = options.effort
				? { ...process.env, CLAUDE_CODE_EFFORT_LEVEL: options.effort }
				: process.env;

			const child = spawn("claude", args, {
				stdio: ["ignore", "pipe", "pipe"],
				env,
			});

			let stdout = "";
			let stderr = "";

			child.stdout?.on("data", (data) => {
				stdout += data.toString();
			});

			child.stderr?.on("data", (data) => {
				stderr += data.toString();
			});

			child.on("close", (code) => {
				if (code === 0) {
					resolve({
						success: true,
						output: stdout.trim(),
						exitCode: code ?? undefined,
					});
				} else {
					resolve({
						success: false,
						error: stderr || `Process exited with code ${code}`,
						exitCode: code ?? undefined,
					});
				}
			});

			child.on("error", (err) => {
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
		const args = this.buildStreamingArgs(options);

		return new Promise((resolve) => {
			const env = options.effort
				? { ...process.env, CLAUDE_CODE_EFFORT_LEVEL: options.effort }
				: process.env;

			const child = spawn("claude", args, {
				stdio: ["ignore", "pipe", "pipe"],
				env,
			});

			let fullOutput = "";
			let stderr = "";
			let lineBuffer = "";

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

						// Accumulate result content from assistant messages
						if (event.type === "assistant" && event.message?.content) {
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
							} else if (event.result) {
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

			child.on("close", (code) => {
				// Process any remaining buffer
				if (lineBuffer.trim()) {
					try {
						const event = JSON.parse(lineBuffer);
						if (event.type === "result") {
							if (event.structured_output !== undefined) {
								fullOutput = JSON.stringify(event.structured_output);
							} else if (event.result) {
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

				if (code === 0 && !stderr) {
					resolve({
						success: true,
						output: fullOutput.trim(),
						exitCode: code ?? undefined,
					});
				} else {
					resolve({
						success: false,
						error: stderr || `Process exited with code ${code}`,
						output: fullOutput.trim(), // Include output even on failure for debugging
						exitCode: code ?? undefined,
					});
				}
			});

			child.on("error", (err) => {
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
		if (formatIdx !== -1) {
			args[formatIdx + 1] = "stream-json";
		} else {
			args.push("--output-format", "stream-json");
		}
		// Add --verbose flag required for stream-json with --print
		if (!args.includes("--verbose")) {
			args.push("--verbose");
		}
		return args;
	}

	/**
	 * Build command-line arguments for claude CLI
	 */
	private buildArgs(options: ClaudeRunOptions): string[] {
		const args: string[] = [];

		// Enable print mode (non-interactive)
		args.push("--print");

		// Model
		args.push("--model", options.model);

		// MCP config for quote tools and other MCP servers
		if (options.mcpConfig) {
			args.push("--mcp-config", options.mcpConfig);
		}

		// System prompt
		if (options.systemPrompt) {
			args.push("--append-system-prompt", options.systemPrompt);
		}

		// Allowed tools
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
		if (options.maxTokens) {
			args.push("--max-tokens", options.maxTokens.toString());
		}

		// Cost control
		if (options.maxBudgetUsd) {
			args.push("--max-budget-usd", options.maxBudgetUsd.toString());
		}

		// Turn limit for agentic loops
		if (options.maxTurns) {
			args.push("--max-turns", options.maxTurns.toString());
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

		// Prompt is the last positional argument
		// If it's a file path, read its content
		let promptContent = options.prompt;
		if (options.prompt.endsWith(".md") || options.prompt.endsWith(".txt")) {
			try {
				promptContent = readFileSync(options.prompt, "utf-8");
			} catch {
				// Silently fall back to using prompt as content
			}
		}
		args.push(promptContent);

		return args;
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
