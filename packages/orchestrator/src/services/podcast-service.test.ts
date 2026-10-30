import { writeFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The ffmpeg concat step is not under test: write a stand-in for its output file.
vi.mock("node:child_process", () => ({
	execFileSync: vi.fn((_cmd: string, args: string[]) => {
		writeFileSync(args[args.length - 1] as string, "combined");
		return Buffer.from("");
	}),
}));

const { PodcastService } = await import("./podcast-service.js");

/** Paragraphs long enough that a 20-character chunk limit puts each in its own request. */
function script(paragraphs: number): string {
	return Array.from({ length: paragraphs }, (_, i) => `Stycke nummer ${i + 1} här.`).join("\n\n");
}

describe("PodcastService.generateAudio", () => {
	let bodies: Record<string, unknown>[];

	beforeEach(() => {
		bodies = [];
		vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_url: string, init: RequestInit) => {
				bodies.push(JSON.parse(init.body as string));
				return new Response("mp3", { headers: { "request-id": `req-${bodies.length}` } });
			}),
		);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	// Regression: on eleven_v3 every chunk was rendered blind to the one before it,
	// so each seam reset the voice's pacing and pitch mid-episode. A chunk after the
	// first must carry the request ids of the chunks that preceded it.
	it("stitches each chunk to the request ids of the chunks before it", async () => {
		const result = await new PodcastService().generateAudio(script(3), { chunkChars: 20 });

		expect(result.success, result.error).toBe(true);
		expect(bodies.map((b) => b.previous_request_ids)).toEqual([
			undefined,
			["req-1"],
			["req-1", "req-2"],
		]);
	});

	it("sends at most the three most recent request ids, the API's limit", async () => {
		await new PodcastService().generateAudio(script(5), { chunkChars: 20 });

		expect(
			bodies[4]?.previous_request_ids,
			"ElevenLabs rejects more than three previous_request_ids; send the nearest ones",
		).toEqual(["req-2", "req-3", "req-4"]);
	});

	it("pins the narration language to Swedish on every request", async () => {
		await new PodcastService().generateAudio(script(2), { chunkChars: 20 });

		expect(
			bodies.map((b) => b.language_code),
			"without language_code the model may normalise numbers and dates in another language",
		).toEqual(["sv", "sv"]);
	});
});
