/**
 * Podcast Service - Generates audio narration for published articles.
 * Uses Claude to transform written prose into a spoken-word script,
 * then ElevenLabs v3 to generate the MP3.
 */

import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ClaudeRunner } from "../claude-runner.js";
import { getModelId } from "../utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROMPTS_DIR = join(__dirname, "..", "..", "prompts");

// eleven_v3 rejects previous_text/next_text with HTTP 400 (unsupported_model), and
// previous_request_ids stitching is unavailable on it too — every chunk is generated
// blind to its neighbours, so chunk size trades pronunciation against seam count.
// `seed` is accepted but best-effort: two identical requests still differ byte-wise.
const PODCAST_CONFIG = {
	voiceId: "JhAQDwsLijg4qbxGNQGH",
	modelId: "eleven_v3",
	voiceSettings: {
		stability: 0.5,
		similarity_boost: 0.75,
		speed: 0.95,
	},
	outputFormat: "mp3_44100_192",
	maxChunkChars: 5000,
	seed: 4242,
	// Cloudflare Pages rejects any single file over 25 MiB, and the whole `pnpm ship`
	// fails at upload — after the render has already been paid for. At 192 kbps mono
	// that ceiling arrives around 18 minutes of narration.
	maxFileBytes: 24 * 1024 * 1024,
};

export interface PodcastOptions {
	/** Override PODCAST_CONFIG.maxChunkChars (v3 caps a request at 5000). */
	chunkChars?: number;
	seed?: number;
	/** Reuse the existing {slug}-audio.txt instead of re-running Claude. */
	reuseScript?: boolean;
	/** Render to {slug}--{variant}.mp3 and leave frontmatter and cover art alone. */
	variant?: string;
}

export interface PodcastResult {
	success: boolean;
	audioPath?: string;
	scriptPath?: string;
	error?: string;
	duration?: number;
}

export class PodcastService {
	private runner = new ClaudeRunner();
	private articlesDir: string;
	private audioDir: string;

	constructor(options?: { articlesDir?: string; audioDir?: string }) {
		this.articlesDir =
			options?.articlesDir ?? join(__dirname, "..", "..", "..", "..", "data", "articles");
		this.audioDir =
			options?.audioDir ??
			join(__dirname, "..", "..", "..", "..", "apps", "web", "public", "audio");
	}

	/**
	 * Generate audio script from article markdown using Claude.
	 */
	async generateAudioScript(
		articleContent: string,
	): Promise<{ success: boolean; script?: string; error?: string }> {
		const promptPath = join(PROMPTS_DIR, "audio-script.md");

		const result = await this.runner.run({
			prompt: promptPath,
			userContent: articleContent,
			model: getModelId("opus"),
			effort: "max",
			noSessionPersistence: true,
			skipPermissions: true,
			timeout: 600000, // 10 min
		});

		if (!(result.success && result.output)) {
			return { success: false, error: result.error || "Audio script generation failed" };
		}

		return { success: true, script: result.output };
	}

	/**
	 * Generate MP3 audio from script text using ElevenLabs v3 API.
	 * Handles chunking for texts over 5k characters.
	 */
	async generateAudio(
		script: string,
		options: PodcastOptions = {},
	): Promise<{ success: boolean; audio?: Buffer; error?: string }> {
		const apiKey = process.env.ELEVENLABS_API_KEY;
		if (!apiKey) {
			return { success: false, error: "ELEVENLABS_API_KEY environment variable not set" };
		}

		const seed = options.seed ?? PODCAST_CONFIG.seed;
		const chunks = this.chunkText(script, options.chunkChars ?? PODCAST_CONFIG.maxChunkChars);

		if (chunks.length === 1) {
			const result = await this.callElevenLabs(apiKey, chunks[0] as string, seed);
			if (!(result.success && result.audio)) {
				return { success: false, error: `Audio generation failed: ${result.error}` };
			}
			return { success: true, audio: result.audio };
		}

		// Multiple chunks: generate MP3 per chunk, concatenate with ffmpeg
		const tempDir = join(tmpdir(), `islam-se-audio-${Date.now()}`);
		mkdirSync(tempDir, { recursive: true });

		try {
			const chunkPaths: string[] = [];
			for (let i = 0; i < chunks.length; i++) {
				const chunk = chunks[i] as string;
				const result = await this.callElevenLabs(apiKey, chunk, seed);
				if (!(result.success && result.audio)) {
					return {
						success: false,
						error: `Chunk ${i + 1}/${chunks.length} failed: ${result.error}`,
					};
				}
				const chunkPath = join(tempDir, `chunk-${i}.mp3`);
				writeFileSync(chunkPath, result.audio);
				chunkPaths.push(chunkPath);
			}

			// Build ffmpeg concat list
			const listPath = join(tempDir, "concat.txt");
			writeFileSync(listPath, chunkPaths.map((p) => `file '${p}'`).join("\n"));

			const outputPath = join(tempDir, "combined.mp3");
			execFileSync("ffmpeg", [
				"-f",
				"concat",
				"-safe",
				"0",
				"-i",
				listPath,
				"-c",
				"copy",
				outputPath,
			]);

			const mp3 = readFileSync(outputPath);
			return { success: true, audio: mp3 };
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	}

	/**
	 * Full pipeline: article → script → MP3 → save files → update frontmatter.
	 */
	async produce(slug: string, options: PodcastOptions = {}): Promise<PodcastResult> {
		const articlePath = join(this.articlesDir, `${slug}.md`);
		if (!existsSync(articlePath)) {
			return { success: false, error: `Article not found: ${articlePath}` };
		}

		const startTime = Date.now();
		const scriptPath = join(this.articlesDir, `${slug}-audio.txt`);

		// Step 1: Generate audio script via Claude
		let script: string;
		if (options.reuseScript) {
			if (!existsSync(scriptPath)) {
				return { success: false, error: `No existing audio script: ${scriptPath}` };
			}
			script = readFileSync(scriptPath, "utf-8");
			console.log(`🎙️  Reusing audio script: ${scriptPath}`);
		} else {
			console.log("🎙️  Generating audio script...");
			const scriptResult = await this.generateAudioScript(readFileSync(articlePath, "utf-8"));
			if (!(scriptResult.success && scriptResult.script)) {
				return { success: false, error: scriptResult.error };
			}
			script = scriptResult.script;
			writeFileSync(scriptPath, script, "utf-8");
			console.log(`   ✓ Audio script saved: ${scriptPath}`);
		}

		// Step 2: Generate MP3 via ElevenLabs
		const chunkChars = options.chunkChars ?? PODCAST_CONFIG.maxChunkChars;
		const seed = options.seed ?? PODCAST_CONFIG.seed;
		console.log("🔊 Generating audio via ElevenLabs v3...");
		const chunks = this.chunkText(script, chunkChars).length;
		console.log(
			`   ${script.length} characters, ${chunks} chunk${chunks > 1 ? "s" : ""} @ ${chunkChars}, seed ${seed}`,
		);

		const audioResult = await this.generateAudio(script, { chunkChars, seed });
		if (!(audioResult.success && audioResult.audio)) {
			return { success: false, error: audioResult.error, scriptPath };
		}

		// Save MP3
		if (!existsSync(this.audioDir)) {
			mkdirSync(this.audioDir, { recursive: true });
		}
		const audioFile = options.variant ? `${slug}--${options.variant}.mp3` : `${slug}.mp3`;
		const audioPath = join(this.audioDir, audioFile);
		writeFileSync(audioPath, audioResult.audio);
		console.log(
			`   ✓ MP3 saved: ${audioPath} (${(audioResult.audio.length / 1024 / 1024).toFixed(1)} MB)`,
		);
		this.fitToDeployLimit(audioPath);

		// Step 3: Get audio duration
		const duration_secs = this.getAudioDuration(audioPath);

		if (options.variant) {
			console.log("   ⏭ Variant render — cover art and frontmatter left untouched");
			return { success: true, audioPath, scriptPath, duration: Date.now() - startTime };
		}

		// Step 4: Generate episode cover art (square crop of hero image)
		this.generateEpisodeCover(slug);

		// Step 5: Update article frontmatter
		this.updateFrontmatter(articlePath, audioFile, duration_secs);
		console.log(
			`   ✓ Frontmatter updated: audioFile: "${audioFile}", audioDuration: ${duration_secs}s`,
		);

		const duration = Date.now() - startTime;
		return { success: true, audioPath, scriptPath, duration };
	}

	/**
	 * Call ElevenLabs TTS API for a single text chunk.
	 */
	private async callElevenLabs(
		apiKey: string,
		text: string,
		seed?: number,
	): Promise<{ success: boolean; audio?: Buffer; error?: string }> {
		const outputFormat = PODCAST_CONFIG.outputFormat;
		const url = `https://api.elevenlabs.io/v1/text-to-speech/${PODCAST_CONFIG.voiceId}?output_format=${outputFormat}`;

		const body = {
			text,
			model_id: PODCAST_CONFIG.modelId,
			voice_settings: PODCAST_CONFIG.voiceSettings,
			...(seed === undefined ? {} : { seed }),
		};

		const maxRetries = 3;
		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				const response = await fetch(url, {
					method: "POST",
					headers: {
						"xi-api-key": apiKey,
						"Content-Type": "application/json",
						Accept: outputFormat.startsWith("pcm") ? "application/octet-stream" : "audio/mpeg",
					},
					body: JSON.stringify(body),
				});

				if (!response.ok) {
					const errorText = await response.text();
					if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
						const delay = 2000 * attempt;
						await new Promise((r) => setTimeout(r, delay));
						continue;
					}
					return { success: false, error: `ElevenLabs API ${response.status}: ${errorText}` };
				}

				const arrayBuffer = await response.arrayBuffer();
				return { success: true, audio: Buffer.from(arrayBuffer) };
			} catch (err) {
				if (attempt < maxRetries) {
					const delay = 2000 * attempt;
					await new Promise((r) => setTimeout(r, delay));
					continue;
				}
				return {
					success: false,
					error: `Network error: ${err instanceof Error ? err.message : String(err)}`,
				};
			}
		}

		return { success: false, error: "All retry attempts failed" };
	}

	/**
	 * Split text into chunks at paragraph boundaries, respecting the character limit.
	 */
	private chunkText(text: string, maxChars: number): string[] {
		if (text.length <= maxChars) return [text];

		const paragraphs = text.split(/\n\n+/);
		const chunks: string[] = [];
		let current = "";

		for (const paragraph of paragraphs) {
			if (current.length + paragraph.length + 2 > maxChars && current.length > 0) {
				chunks.push(current.trim());
				current = paragraph;
			} else {
				current += (current ? "\n\n" : "") + paragraph;
			}
		}

		if (current.trim()) {
			chunks.push(current.trim());
		}

		return chunks;
	}

	/**
	 * Generate square episode cover art from the hero image.
	 * Center-crops to square and resizes to 1400x1400 JPEG.
	 */
	private generateEpisodeCover(slug: string): void {
		const imagesDir = join(
			__dirname,
			"..",
			"..",
			"..",
			"..",
			"apps",
			"web",
			"src",
			"assets",
			"images",
		);
		const heroPath = join(imagesDir, `${slug}.webp`);
		if (!existsSync(heroPath)) {
			console.log("   ⚠ No hero image found, skipping episode cover");
			return;
		}

		const coverPath = join(this.audioDir, `${slug}.jpg`);
		try {
			execFileSync("magick", [
				heroPath,
				"-gravity",
				"center",
				"-crop",
				"1024x1024+0+0",
				"+repage",
				"-resize",
				"1400x1400",
				"-quality",
				"90",
				coverPath,
			]);
			console.log(`   ✓ Episode cover: ${coverPath}`);
		} catch (err) {
			console.log(`   ⚠ Episode cover failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	/**
	 * Re-encode the episode at a lower bitrate if it exceeds what Pages will upload.
	 * Speech is mono, so the only lever is bitrate; 128 kbps is transparent for narration
	 * and matches the back catalogue.
	 */
	private fitToDeployLimit(audioPath: string): void {
		const bytes = statSync(audioPath).size;
		if (bytes <= PODCAST_CONFIG.maxFileBytes) return;

		const seconds = this.getAudioDuration(audioPath);
		if (seconds === 0) {
			console.log("   ⚠ Over the 25 MiB Pages limit but duration unknown — not re-encoding");
			return;
		}

		// Land under the cap with headroom, then clamp to a sane spoken-word range.
		const targetKbps = Math.min(
			192,
			Math.max(96, Math.floor((PODCAST_CONFIG.maxFileBytes * 8) / seconds / 1000) - 8),
		);
		const reduced = `${audioPath}.reduced.mp3`;
		execFileSync("ffmpeg", [
			"-hide_banner",
			"-nostats",
			"-y",
			"-i",
			audioPath,
			"-codec:a",
			"libmp3lame",
			"-b:a",
			`${targetKbps}k`,
			"-ac",
			"1",
			"-ar",
			"44100",
			reduced,
		]);
		renameSync(reduced, audioPath);
		console.log(
			`   ↓ Re-encoded to ${targetKbps} kbps for the 25 MiB Pages limit: ${(bytes / 1024 / 1024).toFixed(1)} → ${(statSync(audioPath).size / 1024 / 1024).toFixed(1)} MB`,
		);
	}

	/**
	 * Get audio duration in seconds using ffprobe.
	 */
	private getAudioDuration(audioPath: string): number {
		try {
			const output = execFileSync("ffprobe", [
				"-v",
				"quiet",
				"-show_entries",
				"format=duration",
				"-of",
				"csv=p=0",
				audioPath,
			])
				.toString()
				.trim();
			return Math.round(Number.parseFloat(output));
		} catch {
			return 0;
		}
	}

	/**
	 * Add audioFile and audioDuration fields to article frontmatter.
	 */
	private updateFrontmatter(articlePath: string, audioFile: string, audioDuration: number): void {
		let content = readFileSync(articlePath, "utf-8");
		const audioLine = `audioFile: "${audioFile}"`;
		const durationLine = `audioDuration: ${audioDuration}`;

		if (/^audioFile: .+$/m.test(content)) {
			content = content.replace(/^audioFile: .+$/m, audioLine);
		} else {
			content = content.replace(/\n---\n/, `\n${audioLine}\n---\n`);
		}

		if (/^audioDuration: .+$/m.test(content)) {
			content = content.replace(/^audioDuration: .+$/m, durationLine);
		} else {
			content = content.replace(/^audioFile: .+$/m, `${audioLine}\n${durationLine}`);
		}

		writeFileSync(articlePath, content, "utf-8");
	}
}
