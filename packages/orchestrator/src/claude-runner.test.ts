import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ClaudeRunner } from "./claude-runner.js";

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

	describe("buildArgs (via run options)", () => {
		// We can't directly test buildArgs since it's private, but we can
		// verify the logic by testing known behaviors through the public API.
		// For now, let's test the schema that would be passed.

		it("handles json schema stringification", () => {
			const schema = { type: "object", properties: { test: { type: "string" } } };
			const stringified = JSON.stringify(schema);

			// Should be valid JSON
			expect(() => JSON.parse(stringified)).not.toThrow();
			expect(JSON.parse(stringified)).toEqual(schema);
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
	});
});
