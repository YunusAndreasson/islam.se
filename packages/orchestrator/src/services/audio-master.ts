// The last step on an episode's MP3: one encode that sets its loudness and keeps it
// under the Pages upload limit.
//
// ElevenLabs returns narration at whatever level the voice lands on. Measured on
// 2026-11-21, the 13 published episodes sat at −18.6 to −21.1 LUFS with true peaks of
// −0.5 to −1.1 dBFS. Apple's spec for podcasts is −16 LUFS (±1) with peaks at or under
// −1 dBTP, so ours played 3–5 LU under the show before them, varied by 2.5 LU among
// themselves, and left Spotify's normaliser no headroom to raise them.

import { execFileSync, spawnSync } from "node:child_process";
import { renameSync, statSync } from "node:fs";

/** Apple Podcasts' published target, with half a dB of extra peak headroom for the MP3
 *  encoder, whose reconstruction overshoots the pre-encode true peak. */
export const LOUDNESS_TARGET = { integrated: -16, truePeak: -1.5, range: 11 } as const;

/** What ffmpeg's loudnorm reports after a measuring pass (print_format=json). */
export interface LoudnormStats {
	input_i: string;
	input_tp: string;
	input_lra: string;
	input_thresh: string;
	target_offset: string;
}

/** The loudnorm JSON block at the end of ffmpeg's stderr after a measuring pass. */
export function parseLoudnormStats(stderr: string): LoudnormStats {
	const start = stderr.lastIndexOf("{");
	const end = stderr.lastIndexOf("}");
	if (start < 0 || end < start) throw new Error("ffmpeg printed no loudnorm measurement");
	const stats = JSON.parse(stderr.slice(start, end + 1)) as Partial<LoudnormStats>;
	for (const key of [
		"input_i",
		"input_tp",
		"input_lra",
		"input_thresh",
		"target_offset",
	] as const) {
		if (typeof stats[key] !== "string") throw new Error(`loudnorm measurement lacks ${key}`);
	}
	return stats as LoudnormStats;
}

/** The second, applying pass: the target plus the first pass's measurements, which is
 *  what lets loudnorm hit the target in one go instead of guessing as it streams. */
export function loudnormFilter(stats: LoudnormStats): string {
	const { integrated, truePeak, range } = LOUDNESS_TARGET;
	return [
		`loudnorm=I=${integrated}:TP=${truePeak}:LRA=${range}`,
		`measured_I=${stats.input_i}`,
		`measured_TP=${stats.input_tp}`,
		`measured_LRA=${stats.input_lra}`,
		`measured_thresh=${stats.input_thresh}`,
		`offset=${stats.target_offset}`,
		"linear=true",
		"print_format=summary",
	].join(":");
}

/** The constant bitrates an MP3 at 44.1 kHz can carry, from 96 up. LAME rounds any
 *  other request UP to the next of these: asked for 180 it wrote 192 kbps, and
 *  »Resenären som sitter still« (17:45) came out over the upload limit (2026-11-21). */
export const MP3_BITRATES = [96, 112, 128, 160, 192] as const;

/** The bitrate to encode at: the source's own, unless that would cross `maxBytes`, in
 *  which case the highest MP3 rate that lands under it with headroom (never below 96
 *  kbps, which is still clean for one voice). */
export function encodeKbps(seconds: number, sourceKbps: number, maxBytes: number): number {
	const fitting = Math.floor((maxBytes * 8) / seconds / 1000) - 8;
	const ceiling = Math.min(sourceKbps, fitting);
	return [...MP3_BITRATES].reverse().find((rate) => rate <= ceiling) ?? MP3_BITRATES[0];
}

function probe(audioPath: string, entry: string): number {
	const out = execFileSync(
		"ffprobe",
		["-v", "quiet", "-show_entries", entry, "-of", "csv=p=0", audioPath],
		{
			encoding: "utf-8",
		},
	);
	return Number.parseFloat(out.trim());
}

/** Measure the episode, then re-encode it once at the loudness target and a bitrate
 *  that fits `maxBytes`. Replaces the file in place and returns what it measured. */
export function masterEpisode(
	audioPath: string,
	maxBytes: number,
): { before: LoudnormStats; kbps: number } {
	const { integrated, truePeak, range } = LOUDNESS_TARGET;
	// ffmpeg prints the measurement on stderr, which execFileSync does not return.
	const measuring = spawnSync(
		"ffmpeg",
		[
			"-hide_banner",
			"-nostats",
			"-i",
			audioPath,
			"-af",
			`loudnorm=I=${integrated}:TP=${truePeak}:LRA=${range}:print_format=json`,
			"-f",
			"null",
			"-",
		],
		{ encoding: "utf-8" },
	);
	if (measuring.status !== 0)
		throw new Error(`ffmpeg could not measure ${audioPath}: ${measuring.stderr}`);
	const before = parseLoudnormStats(measuring.stderr);

	const seconds = probe(audioPath, "format=duration");
	const sourceKbps = Math.round(probe(audioPath, "format=bit_rate") / 1000);
	const kbps = encodeKbps(seconds, sourceKbps, maxBytes);

	const mastered = `${audioPath}.mastered.mp3`;
	execFileSync("ffmpeg", [
		"-hide_banner",
		"-nostats",
		"-y",
		"-i",
		audioPath,
		"-af",
		loudnormFilter(before),
		"-codec:a",
		"libmp3lame",
		"-b:a",
		`${kbps}k`,
		"-ac",
		"1",
		// loudnorm upsamples to 192 kHz internally; the episode stays at 44.1.
		"-ar",
		"44100",
		mastered,
	]);
	if (statSync(mastered).size > maxBytes) {
		throw new Error(`${mastered} is still over ${maxBytes} bytes at ${kbps} kbps`);
	}
	renameSync(mastered, audioPath);
	return { before, kbps };
}
