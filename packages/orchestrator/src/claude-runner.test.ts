import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { buildClaudeArgs, ClaudeRunner, pickProseOutput, terminate } from "./claude-runner.js";

describe("ClaudeRunner", () => {
	const runner = new ClaudeRunner();

	describe("parseJSONOutput", () => {
		it("extracts structured_output from CLI response", () => {
			const cliOutput = JSON.stringify({
				structured_output: { topic: "patience", summary: "test summary" },
			});

			const result = runner.parseJSONOutput<{ topic: string; summary: string }>(cliOutput);

			expect(result).toEqual({ topic: "patience", summary: "test summary" });
		});

		it("extracts JSON from result field", () => {
			const cliOutput = JSON.stringify({
				result: 'Here is the response: {"key": "value", "number": 42}',
			});

			const result = runner.parseJSONOutput<{ key: string; number: number }>(cliOutput);

			expect(result).toEqual({ key: "value", number: 42 });
		});

		it("handles markdown code blocks in result", () => {
			const cliOutput = JSON.stringify({
				result: 'Here is the JSON:\n```json\n{"extracted": true}\n```\nDone.',
			});

			const result = runner.parseJSONOutput<{ extracted: boolean }>(cliOutput);

			expect(result).toEqual({ extracted: true });
		});

		it("handles nested objects correctly", () => {
			const cliOutput = JSON.stringify({
				structured_output: {
					outer: {
						inner: {
							deep: "value",
						},
					},
					array: [1, 2, 3],
				},
			});

			const result = runner.parseJSONOutput(cliOutput);

			expect(result).toEqual({
				outer: { inner: { deep: "value" } },
				array: [1, 2, 3],
			});
		});

		it("handles escaped quotes in strings", () => {
			const cliOutput = JSON.stringify({
				result: '{"quote": "He said \\"hello\\" to me"}',
			});

			const result = runner.parseJSONOutput<{ quote: string }>(cliOutput);

			expect(result).toEqual({ quote: 'He said "hello" to me' });
		});

		it("returns null for malformed JSON", () => {
			const result = runner.parseJSONOutput("not json at all");

			expect(result).toBeNull();
		});

		it("returns null for empty input", () => {
			const result = runner.parseJSONOutput("");

			expect(result).toBeNull();
		});

		it("handles JSON with no result or structured_output field", () => {
			// Direct JSON parsing fallback
			const result = runner.parseJSONOutput('{"direct": true}');

			expect(result).toEqual({ direct: true });
		});

		it("extracts JSON from text with surrounding content", () => {
			const cliOutput = JSON.stringify({
				result: 'Some text before {"key": "value"} and some text after',
			});

			const result = runner.parseJSONOutput<{ key: string }>(cliOutput);

			expect(result).toEqual({ key: "value" });
		});

		it("PROPERTY: round-trip identity for valid JSON objects", () => {
			const objects = [
				{ simple: "value" },
				{ nested: { deep: { value: 42 } }, arr: [1, 2, 3] },
				{ swedish: "Tålamod", arabic: "الصبر", norse: "Hávamál" },
				{ empty: {}, emptyArr: [], zero: 0, falsy: false, nul: null },
			];
			for (const obj of objects) {
				const cliOutput = JSON.stringify({ structured_output: obj });
				expect(
					runner.parseJSONOutput(cliOutput),
					`Round-trip failed for: ${JSON.stringify(obj).slice(0, 80)}`,
				).toEqual(obj);
			}
		});

		it("handles nested braces in JSON", () => {
			const cliOutput = JSON.stringify({
				result: '{"outer": {"middle": {"inner": "deep"}}}',
			});

			const result = runner.parseJSONOutput(cliOutput);

			expect(result).toEqual({ outer: { middle: { inner: "deep" } } });
		});
	});

	describe("validateOutput", () => {
		const TestSchema = z.object({
			name: z.string(),
			age: z.number().min(0),
			email: z.string().email().optional(),
		});

		it("succeeds with valid data", () => {
			const result = runner.validateOutput({ name: "John", age: 30 }, TestSchema);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toEqual({ name: "John", age: 30 });
			}
		});

		it("succeeds with optional fields present", () => {
			const result = runner.validateOutput(
				{ name: "John", age: 30, email: "john@example.com" },
				TestSchema,
			);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.email).toBe("john@example.com");
			}
		});

		it("fails for missing required field", () => {
			const result = runner.validateOutput({ name: "John" }, TestSchema);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toContain("age");
			}
		});

		it("fails for wrong type", () => {
			const result = runner.validateOutput({ name: "John", age: "thirty" }, TestSchema);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toContain("age");
			}
		});

		it("fails for invalid email format", () => {
			const result = runner.validateOutput(
				{ name: "John", age: 30, email: "not-an-email" },
				TestSchema,
			);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toContain("email");
			}
		});

		it("fails for negative age (min constraint)", () => {
			const result = runner.validateOutput({ name: "John", age: -5 }, TestSchema);

			expect(result.success).toBe(false);
		});

		it("returns detailed error messages with paths", () => {
			const NestedSchema = z.object({
				user: z.object({
					profile: z.object({
						name: z.string(),
					}),
				}),
			});

			const result = runner.validateOutput({ user: { profile: { name: 123 } } }, NestedSchema);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toContain("user.profile.name");
			}
		});
	});

	describe("buildClaudeArgs", () => {
		const model = "claude-opus-5-5";
		/** The value following a flag, or undefined when the flag is absent. */
		const flagValue = (args: string[], flag: string) => {
			const i = args.indexOf(flag);
			return i === -1 ? undefined : args[i + 1];
		};

		// A stage inherited the operator's whole Claude Code setup: with `--tools ""` alone an
		// editorial call still loaded 204 MCP tools from 12 user-scope servers and 59 skills
		// (164 600 prompt tokens against 6 700), and the essay author wrote about them.
		it("isolates every run from user-scope MCP servers, skills and settings", () => {
			for (const mcpConfig of [undefined, "/repo/.mcp.json"]) {
				const args = buildClaudeArgs({ prompt: "p", model, mcpConfig });
				expect(
					args,
					"--strict-mcp-config must be passed with or without --mcp-config; without it the stage loads every MCP server the operator has configured",
				).toContain("--strict-mcp-config");
				expect(args, "skills and plugin commands must not load in a pipeline stage").toContain(
					"--disable-slash-commands",
				);
				expect(
					flagValue(args, "--setting-sources"),
					"--setting-sources must be the empty string so no user/project settings (plugins, effortLevel) leak in",
				).toBe("");
			}
		});

		it("passes an empty --tools value for a stage with no built-in tools", () => {
			const args = buildClaudeArgs({ prompt: "p", model, builtinTools: [] });
			expect(
				flagValue(args, "--tools"),
				"an editorial stage must load zero built-in tools; a missing --tools loads all of them",
			).toBe("");
			expect(buildClaudeArgs({ prompt: "p", model })).not.toContain("--tools");
			expect(
				flagValue(
					buildClaudeArgs({ prompt: "p", model, builtinTools: ["Read", "WebFetch"] }),
					"--tools",
				),
			).toBe("Read,WebFetch");
		});

		// The kernel caps one argv string at 131 072 bytes; the authoring and review system
		// prompts carry the whole research and would kill the spawn with E2BIG past it.
		it("never puts the system prompt text in argv", () => {
			const systemPrompt = "ابن تيمية ".repeat(20_000);
			const args = buildClaudeArgs({ prompt: "p", model, systemPrompt }, "/tmp/x/system-prompt.md");
			expect(flagValue(args, "--append-system-prompt-file")).toBe("/tmp/x/system-prompt.md");
			expect(
				args.some((a) => a.includes("ابن تيمية")),
				"the system prompt must travel by file, not as an argv string",
			).toBe(false);
			expect(args).not.toContain("--append-system-prompt");
		});

		it("asks for the JSON envelope when a schema is given", () => {
			const jsonSchema = { type: "object", properties: { test: { type: "string" } } };
			const args = buildClaudeArgs({ prompt: "p", model, jsonSchema });
			expect(JSON.parse(flagValue(args, "--json-schema") ?? "")).toEqual(jsonSchema);
			expect(flagValue(args, "--output-format")).toBe("json");
		});
	});

	describe("complex parsing scenarios", () => {
		it("handles array output", () => {
			const cliOutput = JSON.stringify({
				structured_output: [
					{ id: 1, name: "first" },
					{ id: 2, name: "second" },
				],
			});

			const result = runner.parseJSONOutput<Array<{ id: number; name: string }>>(cliOutput);

			expect(result).toHaveLength(2);
			expect(result?.[0]).toEqual({ id: 1, name: "first" });
		});

		it("handles unicode content", () => {
			const cliOutput = JSON.stringify({
				structured_output: {
					swedish: "Tålamod är en dygd",
					arabic: "الصبر مفتاح الفرج",
				},
			});

			const result = runner.parseJSONOutput<{ swedish: string; arabic: string }>(cliOutput);

			expect(result?.swedish).toBe("Tålamod är en dygd");
			expect(result?.arabic).toBe("الصبر مفتاح الفرج");
		});

		it("handles newlines in string values", () => {
			const cliOutput = JSON.stringify({
				structured_output: {
					text: "Line 1\nLine 2\nLine 3",
				},
			});

			const result = runner.parseJSONOutput<{ text: string }>(cliOutput);

			expect(result?.text).toBe("Line 1\nLine 2\nLine 3");
		});
	});

	describe("parseMarkdownWithMeta", () => {
		it("extracts frontmatter JSON and markdown body", () => {
			const output = `---\n{"title": "Test Article", "reflection": "It works"}\n---\n\n# Test Article\n\nBody text here.`;
			const result = runner.parseMarkdownWithMeta(output);

			expect(result).not.toBeNull();
			expect(result?.meta).toEqual({ title: "Test Article", reflection: "It works" });
			expect(result?.body).toBe("# Test Article\n\nBody text here.");
		});

		it("ignores preamble text before frontmatter", () => {
			const output = `Let me think about this...\n\nOk here's the article:\n\n---\n{"title": "Test"}\n---\n\nBody.`;
			const result = runner.parseMarkdownWithMeta(output);

			expect(result?.meta).toEqual({ title: "Test" });
			expect(result?.body).toBe("Body.");
		});

		it("handles nested JSON in frontmatter", () => {
			const output = `---\n{"score": 8.5, "issues": ["weak opening", "flat ending"]}\n---\n\nArticle text.`;
			const result = runner.parseMarkdownWithMeta(output);

			expect(result?.meta).toEqual({ score: 8.5, issues: ["weak opening", "flat ending"] });
		});

		it("handles Unicode in both frontmatter and body", () => {
			const output = `---\n{"title": "Tålamodets konst", "reflection": "الصبر"}\n---\n\n# Tålamodets konst\n\nIbn al-Qayyim skrev om الصبر.`;
			const result = runner.parseMarkdownWithMeta(output);

			expect(result?.meta).toEqual({ title: "Tålamodets konst", reflection: "الصبر" });
			expect(result?.body).toContain("الصبر");
		});

		it("returns null for output without frontmatter markers", () => {
			const output = "Just plain text without any markers.";
			expect(runner.parseMarkdownWithMeta(output)).toBeNull();
		});

		it("returns null for invalid JSON in frontmatter", () => {
			const output = "---\nnot valid json\n---\n\nBody.";
			expect(runner.parseMarkdownWithMeta(output)).toBeNull();
		});

		it("handles empty body after frontmatter", () => {
			const output = `---\n{"verdict": "reject", "summary": "Too weak"}\n---\n`;
			const result = runner.parseMarkdownWithMeta(output);

			expect(result?.meta).toEqual({ verdict: "reject", summary: "Too weak" });
			expect(result?.body).toBe("");
		});

		it("handles multiline JSON in frontmatter", () => {
			const output = `---\n{\n  "title": "Test",\n  "score": 9\n}\n---\n\nBody.`;
			const result = runner.parseMarkdownWithMeta(output);

			expect(result?.meta).toEqual({ title: "Test", score: 9 });
		});

		// Regression, 2026-07-30: the /fordjupning/ review stage aborted a 25-minute run
		// on a reviewer verdict that was perfectly good. Two defects, both here.
		//
		// The reviewer quotes the draft, and a pillar page ends its body with a `---` rule
		// before the footnote block. Quoting that put a `---` line INSIDE the JSON, where
		// the lazy `[\s\S]*?` stopped — so the captured "frontmatter" was a truncated
		// object that could not parse. Separately, models leave raw newlines inside long
		// Swedish string values, which JSON.parse rejects outright.
		//
		// If either assertion below fails again, a completed review is being thrown away —
		// do not "simplify" the candidate list or the string repair back out.
		it("survives a raw --- line inside the frontmatter JSON", () => {
			// The newline before --- must be REAL, not JSON-escaped: an escaped \n leaves the
			// lazy regex intact and the case passes without touching the fix.
			const output =
				'---\n{"finalScore": 6.8, "verdict": "revise", "summary": "Slutar med\n---\nnoter"}\n---\n\n## Avsnitt\n\nText.\n\n---\n\n[^1]: Not.';
			const result = runner.parseMarkdownWithMeta(output);

			expect(result?.meta).toEqual({
				finalScore: 6.8,
				verdict: "revise",
				summary: "Slutar med\n---\nnoter",
			});
			expect(result?.body).toContain("[^1]: Not.");
		});

		it("repairs raw newlines left unescaped inside string values", () => {
			const output = `---\n{"verdict": "revise", "summary": "Rad ett\nrad två"}\n---\n\nBody.`;
			const result = runner.parseMarkdownWithMeta(output);

			expect(result?.meta).toEqual({ verdict: "revise", summary: "Rad ett\nrad två" });
			expect(result?.body).toBe("Body.");
		});

		it("names the failing step instead of always blaming a missing block", () => {
			expect(runner.parseMarkdownWithMetaDetailed("no markers here").reason).toContain(
				"no --- fenced block",
			);
			expect(runner.parseMarkdownWithMetaDetailed("---\n{oops\n---\n\nBody.").reason).toContain(
				"would not parse",
			);
		});
	});
});

// Regression: the fördjupning review on »Artificiell intelligens« (2026-09-25) failed twice with
// "no --- fenced block found". The CLI's `result` event holds only the LAST assistant text
// block, so an answer split across messages lost its frontmatter half, and the runner
// overwrote the full streamed text with that tail. A 25-minute review was thrown away each time.
describe("pickProseOutput", () => {
	const head = '---\n{"finalScore": 8.1, "verdict": "publish"}\n---\n\nFörsta halvan av texten.';
	const tail = "Andra halvan av texten.[^1]\n\n[^1]: Koranen 45:13.";

	it("keeps the streamed text when result is only the tail of a split answer", () => {
		const out = pickProseOutput(`${head}\n${tail}`, tail);
		expect(out.startsWith("---"), "the frontmatter half must survive the result event").toBe(true);
		expect(out).toContain(tail);
	});

	it("uses result unchanged whenever result itself carries the fence", () => {
		const whole = `${head}\n${tail}`;
		expect(pickProseOutput(`Preamble ${whole}`, whole)).toBe(whole);
	});

	it("uses result when the accumulation does not contain it (not a split answer)", () => {
		expect(pickProseOutput(head, "helt annan text")).toBe("helt annan text");
	});

	it("falls back to the accumulation when there is no result text", () => {
		expect(pickProseOutput(head, undefined)).toBe(head);
	});
});

describe("terminate", () => {
	/** A stand-in child: records the signals it is sent and closes only when told to. */
	const fakeChild = () => {
		const emitter = new EventEmitter();
		const signals: string[] = [];
		const child = Object.assign(emitter, {
			exitCode: null as number | null,
			signalCode: null as string | null,
			kill: (signal: string) => {
				signals.push(signal);
				return true;
			},
		});
		return { child: child as unknown as Parameters<typeof terminate>[0], emitter, signals };
	};

	// A timed-out stage sent SIGTERM and waited for the child to close. A child that
	// ignores SIGTERM never closed, so the stage's promise never settled and the whole
	// pipeline run hung without an error.
	it("kills a child that is still alive after the grace period", () => {
		vi.useFakeTimers();
		const { child, signals } = fakeChild();
		terminate(child, 50);
		expect(signals).toEqual(["SIGTERM"]);
		vi.advanceTimersByTime(50);
		expect(
			signals,
			"a child that ignores SIGTERM must be killed, or a timed-out stage hangs the run forever",
		).toEqual(["SIGTERM", "SIGKILL"]);
		vi.useRealTimers();
	});

	it("does not send SIGKILL to a child that closed in time", () => {
		vi.useFakeTimers();
		const { child, emitter, signals } = fakeChild();
		terminate(child, 50);
		emitter.emit("close", null, "SIGTERM");
		vi.advanceTimersByTime(500);
		expect(signals).toEqual(["SIGTERM"]);
		vi.useRealTimers();
	});
});
