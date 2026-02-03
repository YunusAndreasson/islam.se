import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import type { z } from "zod";

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
	model: "claude-opus-4-5-20251101" | "claude-sonnet-4-5-20250929";
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
}

export interface ClaudeRunResult {
	success: boolean;
	output?: string;
	error?: string;
	exitCode?: number;
}

export class ClaudeRunner {
	/**
	 * Execute a headless Claude session
	 */
	public async run(options: ClaudeRunOptions): Promise<ClaudeRunResult> {
		const args = this.buildArgs(options);

		return new Promise((resolve) => {
			const child = spawn("claude", args, {
				stdio: ["ignore", "pipe", "pipe"],
				env: process.env,
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

		// Prompt is the last positional argument
		// If it's a file path, read its content
		let promptContent = options.prompt;
		if (options.prompt.endsWith(".md") || options.prompt.endsWith(".txt")) {
			try {
				promptContent = readFileSync(options.prompt, "utf-8");
			} catch (error) {
				console.error(`Failed to read prompt file: ${options.prompt}`, error);
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
