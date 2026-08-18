import { beforeEach, describe, expect, it, vi } from "vitest";

// Counts how many times the model is actually constructed, and resolves on a later tick so
// concurrent callers genuinely overlap — the bug only exists in the gap between the null
// check and the await, so a synchronously-resolving stub cannot reproduce it.
const pipelineCalls = vi.fn();

vi.mock("@huggingface/transformers", () => ({
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
