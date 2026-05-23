/**
 * sync-verses — one-time authoring tool (plan §7.2, "setup-time only").
 *
 * Run BY HAND (`pnpm sync-verses`) whenever the curated verse list changes.
 * For each verse it produces, all committed to the repo:
 *   - Uthmanic Arabic + Mohammed Knut Bernström's Swedish — Tarteel MCP
 *     (get_translation_text, sv-knut).
 *   - A per-ayah mp3 of Ahmad al-Nufais's murattal, AND the per-word recitation
 *     timing that drives the word highlight — both from QUL (Quranic Universal
 *     Library, qul.tarteel.ai), recitation #461.
 *
 * QUL only ships *surah-by-surah* audio + segment data, so we slice each ayah
 * out of the surah master at QUL's own ayah boundaries. Because the cut and the
 * timestamps come from the same source recording, audio and highlight stay
 * perfectly in sync (verified: re-encoded slices match QUL durations to the ms).
 *
 * The QUL segment export is vendored at scripts/data/qul-alnufais-segments.json
 * (downloaded once from QUL, which gates it behind a free login). From then on
 * `astro build` and `pnpm ship` read only the committed verses.json + mp3s —
 * neither Tarteel's API nor QUL is touched at build, deploy, or runtime.
 *
 * al-Nufais's murattal repeats phrases, so a word can be recited several times;
 * the segment list reflects that (word numbers repeat, `start` stays ordered).
 * The highlight follows it faithfully, re-lighting words as he returns to them.
 *
 * The verse pool is curated from the corpus: every key must be cited by an
 * essay (the build-time citation index derives `relatedEssay`). al-Mulk 67:3,
 * al-Baqara 2:186 and Qāf 50:16 were dropped — no essay cites them.
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Segment, wordCount } from "../src/lib/arabic";

const TARTEEL_MCP_URL = "https://mcp.tarteel.ai/mcp";
const TRANSLATION_SLUG = "sv-knut"; // Mohammed Knut Bernström, Koranens budskap
const RECITER = "Ahmad al-Nufais - Murattal"; // QUL recitation #461
// al-Nufais murattal surah masters on Tarteel's CDN (003.mp3, 013.mp3, …).
const AUDIO_BASE = "https://audio-cdn.tarteel.ai/quran/surah/alnufais/murattal/mp3";

// How much audio to keep around the recited words when slicing an ayah out of
// the surah master. A short lead-in/tail-out feels natural and rings out the
// final elongation without bleeding into the neighbouring ayah.
const LEAD_PAD_MS = 200;
const TAIL_PAD_MS = 400;

// Curated rotation — every key is cited by at least one essay (verified).
const VERSE_KEYS = ["13:28", "3:190", "17:44", "39:42"];

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = join(__dirname, "..");
const versesJsonPath = join(webRoot, "src/content/verser/verses.json");
const audioDir = join(webRoot, "public/audio/quran");
const qulSegmentsPath = join(__dirname, "data/qul-alnufais-segments.json");

/** QUL surah-by-surah entry: absolute timestamps within the surah master. */
interface QulVerse {
	segments: Segment[];
	timestamp_from: number;
	timestamp_to: number;
}

/** Call a Tarteel MCP tool over JSON-RPC; return the full `result` object. */
// biome-ignore lint/suspicious/noExplicitAny: opaque MCP payload, validated downstream
async function callTarteel(toolName: string, args: Record<string, unknown>): Promise<any> {
	const response = await fetch(TARTEEL_MCP_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
		},
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: Math.floor(Math.random() * 1e6),
			method: "tools/call",
			params: { name: toolName, arguments: args },
		}),
	});

	const raw = await response.text();
	// Streamable-HTTP transport replies as SSE: "event: message\ndata: {...}".
	const dataLine = raw.split("\n").find((l) => l.startsWith("data: "));
	if (!dataLine) throw new Error(`Tarteel ${toolName}: no data line in response`);
	const parsed = JSON.parse(dataLine.slice(6));
	if (parsed.error) throw new Error(`Tarteel ${toolName}: ${JSON.stringify(parsed.error)}`);
	return parsed.result;
}

/** Slice [startMs, startMs+durMs] out of a remote mp3 with ffmpeg, re-encoding
 *  so the cut is sample-accurate. `-ss` before `-i` seeks via HTTP range, so
 *  only the needed window is fetched — not the whole surah. */
function ffmpegSlice(url: string, startMs: number, durMs: number, outPath: string): Promise<void> {
	const args = [
		"-v",
		"error",
		"-y",
		"-ss",
		(startMs / 1000).toFixed(3),
		"-t",
		(durMs / 1000).toFixed(3),
		"-i",
		url,
		"-c:a",
		"libmp3lame",
		"-q:a",
		"5",
		outPath,
	];
	return new Promise((resolve, reject) => {
		const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
		let err = "";
		child.stderr.on("data", (d) => {
			err += d;
		});
		child.on("error", reject);
		child.on("close", (code) =>
			code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${err.trim()}`)),
		);
	});
}

interface VerseEntry {
	id: string;
	surah: number;
	ayah: number;
	ayahKey: string;
	surahName: string;
	surahNameArabic: string;
	textArabic: string;
	textSwedish: string;
	translator: string;
	reciter: string;
	audioFile: string;
	segments: Segment[];
}

const pad3 = (n: number) => String(n).padStart(3, "0");

/**
 * QUL's automated alignment occasionally tacks a spurious trailing segment onto
 * the end of an ayah — the final elongated word's tail mislabelled as an earlier
 * word (seen as a stray word-7 closing 3:190 and 17:44). When the very last
 * segment regresses to a word that isn't the last one, it's that artifact: remap
 * it to the final word so its elongation keeps the closing word lit. Genuine
 * mid-ayah repeats (which end on the last word) are left untouched.
 */
function repairTrailingArtifact(segments: Segment[]): Segment[] {
	if (segments.length < 2) return segments;
	const maxWord = Math.max(...segments.map((s) => s[0]));
	const last = segments[segments.length - 1];
	const prev = segments[segments.length - 2];
	if (last[0] < prev[0] && last[0] !== maxWord) {
		return [...segments.slice(0, -1), [maxWord, last[1], last[2]]];
	}
	return segments;
}

async function fetchVerse(key: string, qul: QulVerse): Promise<VerseEntry> {
	const [surah, ayah] = key.split(":").map((n) => Number.parseInt(n, 10));

	// 1. Arabic + Bernström from Tarteel, one call.
	const tr = await callTarteel("get_translation_text", {
		queries: [{ start_ayah: key, translations: [TRANSLATION_SLUG] }],
	});
	const trText: string = tr.content?.[0]?.text ?? "";
	const trJson = trText.match(/\{[\s\S]*\}/);
	if (!trJson) throw new Error(`${key}: could not parse translation payload`);
	const trData = JSON.parse(trJson[0]);
	const ayahData = trData.ayahs?.[0];
	if (!ayahData) throw new Error(`${key}: no ayah in translation payload`);
	// biome-ignore lint/suspicious/noExplicitAny: opaque MCP payload
	const swedish = ayahData.translations?.find((t: any) => t.translator?.includes("Bernström"));
	if (!swedish) throw new Error(`${key}: Bernström translation missing`);
	const textArabic: string = ayahData.text_arabic;

	// 2. Repair the QUL segments, then validate they describe this exact text:
	// the highest word number must equal the recited-word count, or the highlight
	// would point span N at the wrong word.
	const repaired = repairTrailingArtifact(qul.segments);
	if (repaired[0]?.[0] !== 1) throw new Error(`${key}: segments don't start at word 1`);
	const maxWord = Math.max(...repaired.map((s) => s[0]));
	const words = wordCount(textArabic);
	if (words !== maxWord) {
		throw new Error(
			`${key}: text has ${words} words but QUL segments reference word ${maxWord} — ` +
				"tokenization and segmentation disagree; the highlight would be misaligned.",
		);
	}

	// 3. Slice the ayah out of the surah master at QUL's boundaries, trimming the
	// gap before the first word and ringing out the last. Segment offsets are
	// normalized to the slice start so they line up with the saved clip.
	const firstStart = repaired[0][1];
	const lastEnd = Math.max(...repaired.map((s) => s[2]));
	const sliceStart = Math.max(0, firstStart - LEAD_PAD_MS);
	const sliceEnd = lastEnd + TAIL_PAD_MS;
	const fileName = `${pad3(surah)}${pad3(ayah)}.mp3`;
	await mkdir(audioDir, { recursive: true });
	await ffmpegSlice(
		`${AUDIO_BASE}/${pad3(surah)}.mp3`,
		sliceStart,
		sliceEnd - sliceStart,
		join(audioDir, fileName),
	);

	const segments: Segment[] = repaired.map(
		([w, s, e]) => [w, Math.max(0, s - sliceStart), e - sliceStart] as Segment,
	);

	console.log(
		`  ✓ ${key}  ${ayahData.chapter_name}  (${fileName}, ${((sliceEnd - sliceStart) / 1000).toFixed(1)}s, ${repaired.length} segments)`,
	);

	return {
		id: key,
		surah,
		ayah,
		ayahKey: key,
		surahName: ayahData.chapter_name,
		surahNameArabic: ayahData.chapter_name_arabic,
		textArabic,
		textSwedish: swedish.text.trim(),
		translator: swedish.translator,
		reciter: RECITER,
		audioFile: `/audio/quran/${fileName}`,
		segments,
	};
}

async function main() {
	const qulSegments: Record<string, QulVerse> = JSON.parse(await readFile(qulSegmentsPath, "utf8"));
	console.log(`Syncing ${VERSE_KEYS.length} verses (al-Nufais via QUL, Bernström via Tarteel)…`);
	const entries: VerseEntry[] = [];
	for (const key of VERSE_KEYS) {
		const qul = qulSegments[key];
		if (!qul) throw new Error(`${key}: not present in QUL segment export`);
		entries.push(await fetchVerse(key, qul));
	}
	await mkdir(dirname(versesJsonPath), { recursive: true });
	await writeFile(versesJsonPath, `${JSON.stringify(entries, null, "\t")}\n`);
	console.log(`\nWrote ${entries.length} verses → ${versesJsonPath}`);
	console.log(`Audio → ${audioDir}`);
	console.log("Commit src/content/verser/verses.json and public/audio/quran/*.mp3.");
}

main().catch((err) => {
	console.error("sync-verses failed:", err);
	process.exit(1);
});
