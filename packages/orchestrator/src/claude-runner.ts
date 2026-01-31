import { spawn } from "node:child_process";

export interface ClaudeRunOptions {
	/** Path to prompt file or prompt content */
	prompt: string;
	/** Optional system prompt to append */
	systemPrompt?: string;
	/** Tools to allow (e.g., ['WebSearch', 'Read']) */
	allowedTools?: string[];
	/** Output format (currently only 'json' supported) */
	outputFormat?: "json";
	/** JSON schema for output validation */
	jsonSchema?: object;
	/** Model to use */
	model: "claude-opus-4-5-20251101" | "claude-sonnet-4-5-20250929";
	/** Maximum tokens for output */
	maxTokens?: number;
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
				env: {
					...process.env,
					// Ensure headless mode
					ANTHROPIC_HEADLESS: "1",
				},
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

		// Prompt (either file path or content)
		if (options.prompt.endsWith(".md") || options.prompt.endsWith(".txt")) {
			// Assume it's a file path
			args.push("-p", options.prompt);
		} else {
			// It's prompt content - need to pass differently
			// For now, assume file paths only
			args.push("-p", options.prompt);
		}

		// Model
		args.push("--model", options.model);

		// System prompt
		if (options.systemPrompt) {
			args.push("--append-system-prompt", options.systemPrompt);
		}

		// Allowed tools
		if (options.allowedTools && options.allowedTools.length > 0) {
			args.push("--allowedTools", options.allowedTools.join(","));
		}

		// Output format
		if (options.outputFormat === "json") {
			args.push("--output-format", "json");
		}

		// Max tokens
		if (options.maxTokens) {
			args.push("--max-tokens", options.maxTokens.toString());
		}

		return args;
	}

	/**
	 * Parse JSON output from Claude
	 */
	public parseJSONOutput<T = unknown>(output: string): T | null {
		try {
			// Claude might wrap JSON in markdown code blocks
			const jsonMatch = output.match(/```json\s*\n([\s\S]*?)\n```/);
			if (jsonMatch?.[1]) {
				return JSON.parse(jsonMatch[1]);
			}

			// Or it might be raw JSON
			return JSON.parse(output);
		} catch {
			return null;
		}
	}

	/**
	 * Validate output against JSON schema
	 */
	public validateOutput(output: unknown, _schema: object): boolean {
		// Simple validation - in production, use a library like Ajv
		// For now, just check that output is an object
		return typeof output === "object" && output !== null;
	}

	/**
	 * Run with JSON output and parsing
	 */
	public async runJSON<T = unknown>(
		options: ClaudeRunOptions,
	): Promise<ClaudeRunResult & { data?: T }> {
		const result = await this.run({
			...options,
			outputFormat: "json",
		});

		if (result.success && result.output) {
			const data = this.parseJSONOutput<T>(result.output);
			return { ...result, data: data || undefined };
		}

		return result;
	}
}
