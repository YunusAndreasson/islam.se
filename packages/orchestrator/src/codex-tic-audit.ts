import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

export type CodexTicPatch = {
	original: string;
	replacement: string;
	category: "anglicism" | "ai-pattern" | "colloquial" | "repetition" | "rhythm" | "word-choice";
	reason: string;
	confidence: "high" | "medium" | "low";
	semanticRisk: boolean;
};

export type CodexTicAudit = {
	verdict: "clean" | "patches";
	summary: string;
	patches: CodexTicPatch[];
};

export type AppliedCodexAudit = {
	body: string;
	applied: CodexTicPatch[];
	rejected: Array<{ patch: CodexTicPatch; reason: string }>;
};

export type CodexTicRunResult =
	| { success: true; data: CodexTicAudit; duration: number }
	| { success: false; error: string; duration: number; output?: string };

function writeStdin(child: ReturnType<typeof spawn>, content: string): void {
	child.stdin?.on("error", () => {
		// A fast CLI failure can close stdin before the prompt has been written.
	});
	child.stdin?.write(content);
	child.stdin?.end();
}

function isCodexTicAudit(value: unknown): value is CodexTicAudit {
	if (!(value && typeof value === "object")) return false;
	const audit = value as Partial<CodexTicAudit>;
	if (!(audit.verdict === "clean" || audit.verdict === "patches")) return false;
	if (
		typeof audit.summary !== "string" ||
		!Array.isArray(audit.patches) ||
		audit.patches.length > 12
	)
		return false;
	const categories = new Set([
		"anglicism",
		"ai-pattern",
		"colloquial",
		"repetition",
		"rhythm",
		"word-choice",
	]);
	return audit.patches.every((patch) => {
		if (!(patch && typeof patch === "object")) return false;
		const p = patch as Partial<CodexTicPatch>;
		return (
			typeof p.original === "string" &&
			p.original.length > 0 &&
			typeof p.replacement === "string" &&
			typeof p.category === "string" &&
			categories.has(p.category) &&
			typeof p.reason === "string" &&
			(p.confidence === "high" || p.confidence === "medium" || p.confidence === "low") &&
			typeof p.semanticRisk === "boolean"
		);
	});
}

export class CodexTicAuditor {
	async run(options: {
		article: string;
		evalReport: string;
		adapterPromptPath: string;
		definitionPaths: string[];
		schemaPath: string;
		repoRoot: string;
		timeout?: number;
	}): Promise<CodexTicRunResult> {
		const started = Date.now();
		const definitions = options.definitionPaths
			.map(
				(path) =>
					`<existing_house_definition source="${path}">\n${readFileSync(path, "utf-8")}\n</existing_house_definition>`,
			)
			.join("\n\n");
		const prompt = `${readFileSync(options.adapterPromptPath, "utf-8")}\n\n${definitions}\n\n<deterministic_report>\n${options.evalReport}\n</deterministic_report>\n\n<article>\n${options.article}\n</article>`;
		const args = [
			"exec",
			"--ephemeral",
			"--ignore-user-config",
			"--ignore-rules",
			"--sandbox",
			"read-only",
			"--cd",
			options.repoRoot,
			"--output-schema",
			options.schemaPath,
		];
		if (process.env.CODEX_TIC_MODEL) args.push("--model", process.env.CODEX_TIC_MODEL);
		args.push("-");

		return new Promise((resolve) => {
			const child = spawn("codex", args, { stdio: ["pipe", "pipe", "pipe"] });
			let stdout = "";
			let stderr = "";
			let timedOut = false;
			const timer = setTimeout(() => {
				timedOut = true;
				child.kill("SIGTERM");
			}, options.timeout ?? 1_200_000);

			writeStdin(child, prompt);
			child.stdout?.on("data", (data) => {
				stdout += data.toString();
			});
			child.stderr?.on("data", (data) => {
				stderr += data.toString();
			});
			child.on("error", (error) => {
				clearTimeout(timer);
				resolve({ success: false, error: error.message, duration: Date.now() - started });
			});
			child.on("close", (code) => {
				clearTimeout(timer);
				if (code !== 0) {
					resolve({
						success: false,
						error: timedOut
							? `Codex timed out after ${(options.timeout ?? 1_200_000) / 1000}s`
							: stderr.trim() || `Codex exited with code ${code}`,
						duration: Date.now() - started,
						output: stdout.trim() || undefined,
					});
					return;
				}
				try {
					const parsed: unknown = JSON.parse(stdout);
					if (!isCodexTicAudit(parsed)) throw new Error("response did not match tic-audit schema");
					resolve({ success: true, data: parsed, duration: Date.now() - started });
				} catch (error) {
					resolve({
						success: false,
						error: `Could not parse Codex tic audit: ${error instanceof Error ? error.message : String(error)}`,
						duration: Date.now() - started,
						output: stdout.trim() || undefined,
					});
				}
			});
		});
	}
}

function exactOccurrences(text: string, needle: string): number {
	if (!needle) return 0;
	let count = 0;
	let from = 0;
	while (true) {
		const at = text.indexOf(needle, from);
		if (at === -1) return count;
		count++;
		from = at + needle.length;
	}
}

function protectedContent(body: string): Record<string, string[]> {
	const collect = (pattern: RegExp): string[] =>
		[...body.matchAll(pattern)].map((match) => match[0]);
	return {
		codeFences: collect(/```[\s\S]*?```/g),
		headings: collect(/^#{1,6}\s.+$/gm),
		blockquotes: collect(/^>.*$/gm),
		footnoteDefinitions: collect(/^\[\^[^\]]+\]:.*$/gm),
		footnoteMarkers: collect(/\[\^[^\]]+\]/g),
		inlineQuotes: collect(/"[^"\n]+"|“[^”\n]+”|»[^«\n]+«/g),
		numbers: collect(/\b\d+(?:[\s.,:%–—-]+\d+)*\b/g),
	};
}

function protectedContentChanged(before: string, after: string): boolean {
	return JSON.stringify(protectedContent(before)) !== JSON.stringify(protectedContent(after));
}

/** Apply only unambiguous, high-confidence patches, then enforce immutable article material. */
export function applyCodexTicAudit(body: string, audit: CodexTicAudit): AppliedCodexAudit {
	let candidate = body;
	const applied: CodexTicPatch[] = [];
	const rejected: AppliedCodexAudit["rejected"] = [];

	for (const patch of audit.patches) {
		let reason: string | undefined;
		if (patch.confidence !== "high") reason = "confidence was not high";
		else if (patch.semanticRisk) reason = "patch carried semantic risk";
		else if (patch.original === patch.replacement) reason = "replacement was unchanged";
		else if (exactOccurrences(candidate, patch.original) !== 1)
			reason = "original was not unique in the current text";

		if (reason) {
			rejected.push({ patch, reason });
			continue;
		}
		candidate = candidate.replace(patch.original, patch.replacement);
		applied.push(patch);
	}

	if (protectedContentChanged(body, candidate)) {
		return {
			body,
			applied: [],
			rejected: [
				...rejected,
				...applied.map((patch) => ({ patch, reason: "combined patch changed protected content" })),
			],
		};
	}

	return { body: candidate, applied, rejected };
}
