import { beforeEach, describe, expect, it, vi } from "vitest";

// Counts how many times the model is actually constructed, and resolves on a later tick so
// concurrent callers genuinely overlap — the bug only exists in the gap between the null
// check and the await, so a synchronously-resolving stub cannot reproduce it.
const pipelineCalls = vi.fn();
/** Stands in for the library's `env`; the module under test sets `cacheDir` on it. */
const libraryEnv: { cacheDir?: string } = {};

vi.mock("@huggingface/transformers", () => ({
	env: libraryEnv,
	pipeline: vi.fn(async (..._args: unknown[]) => {
		pipelineCalls();
		await new Promise((r) => setTimeout(r, 10));
		return Object.assign(
			async () => ({ data: new Float32Array(384).fill(0.1) }),
			{} as Record<string, never>,
		);
	}),
}));

describe("generateLocalEmbedding", () => {
	beforeEach(() => {
		pipelineCalls.mockClear();
		vi.resetModules();
	});

	// The fordjupning corpus stage fans its angle searches out through nested Promise.all,
	// so ~24 embedding calls start before any of them finishes. While the module cached the
	// resolved pipeline rather than the promise, every one of those callers saw null and
	// loaded its own ~200MB model: the kalifatet run (2026-08-17) aborted with "Ineffective
	// mark-compacts near heap limit" at 4GB and printed "Local embedding model loaded." 24
	// times. One concurrent load is the invariant; the model is a process-wide singleton.
	it("loads the model once when many callers start concurrently", async () => {
		const { generateLocalEmbedding } = await import("./local.js");

		await Promise.all(Array.from({ length: 24 }, (_, i) => generateLocalEmbedding(`angle ${i}`)));

		expect(pipelineCalls).toHaveBeenCalledTimes(1);
	});

	it("still loads only once when calls are sequential", async () => {
		const { generateLocalEmbedding } = await import("./local.js");

		await generateLocalEmbedding("first");
		await generateLocalEmbedding("second");

		expect(pipelineCalls).toHaveBeenCalledTimes(1);
	});
});

describe("model cache location", () => {
	// The library's default cache is inside its own folder under node_modules/.pnpm, whose
	// name includes the versions of its peers. A dependency update renamed that folder and
	// the 465 MB model had to be downloaded again, in the middle of a pipeline run.
	it("keeps the model outside node_modules", async () => {
		vi.resetModules();
		libraryEnv.cacheDir = undefined;
		await import("./local.js");
		expect(libraryEnv.cacheDir, "the cache folder must be set when the module loads").toBeTruthy();
		expect(
			libraryEnv.cacheDir,
			"a cache under node_modules is lost whenever pnpm renames the package folder",
		).not.toContain("node_modules");
	});
});
