import { describe, expect, it } from "vitest";
import {
	encodeKbps,
	LOUDNESS_TARGET,
	loudnormFilter,
	MP3_BITRATES,
	parseLoudnormStats,
} from "./audio-master.js";

const MAX = 24 * 1024 * 1024;

// The 13 episodes published before 2026-11-21 sat at −18.6 to −21.1 LUFS with peaks up
// to −0.5 dBFS: 3–5 LU under Apple's −16 and with no headroom for Spotify to raise them.
describe("loudness target", () => {
	it("is Apple's −16 LUFS with peaks under −1 dBTP", () => {
		expect(LOUDNESS_TARGET.integrated).toBe(-16);
		expect(
			LOUDNESS_TARGET.truePeak,
			"Apple asks for true peaks at or below −1 dBTP",
		).toBeLessThanOrEqual(-1);
	});

	it("feeds the measuring pass back into the applying pass", () => {
		const stats = parseLoudnormStats(`[Parsed_loudnorm_0 @ 0x1]
{
	"input_i" : "-18.70",
	"input_tp" : "-0.68",
	"input_lra" : "4.30",
	"input_thresh" : "-28.95",
	"output_i" : "-16.02",
	"output_tp" : "-1.50",
	"output_lra" : "4.10",
	"output_thresh" : "-26.27",
	"normalization_type" : "dynamic",
	"target_offset" : "0.02"
}`);
		const filter = loudnormFilter(stats);
		expect(filter).toContain("I=-16:TP=-1.5");
		expect(filter, "without the measurements loudnorm guesses as it streams").toContain(
			"measured_I=-18.70",
		);
		expect(filter).toContain("measured_thresh=-28.95");
		expect(filter).toContain("offset=0.02");
	});

	it("refuses output that carries no measurement", () => {
		expect(() => parseLoudnormStats("Error opening input")).toThrow(/no loudnorm measurement/);
	});
});

describe("encodeKbps", () => {
	it("keeps the source's bitrate when the episode fits", () => {
		expect(encodeKbps(10 * 60, 192, MAX), "a second lossy pass at a lower rate costs quality").toBe(
			192,
		);
		expect(encodeKbps(10 * 60, 128, MAX)).toBe(128);
	});

	it("lowers it only as far as the 24 MiB upload limit requires", () => {
		const seconds = 23 * 60;
		const kbps = encodeKbps(seconds, 192, MAX);
		expect(kbps).toBeLessThan(192);
		expect((kbps * 1000 * seconds) / 8, "the file must stay under the Pages limit").toBeLessThan(
			MAX,
		);
	});

	// Regression: 180 kbps is no MP3 rate. LAME wrote 192 instead, and a 17:45 episode
	// came out over the upload limit.
	it("picks only bitrates an MP3 can carry", () => {
		const kbps = encodeKbps(1065, 192, MAX);
		expect(MP3_BITRATES, `${kbps} kbps is no MP3 rate; LAME would round it up`).toContain(kbps);
		expect(kbps).toBe(160);
	});

	it("never goes below 96 kbps", () => {
		expect(encodeKbps(3 * 60 * 60, 192, MAX)).toBe(96);
	});
});
