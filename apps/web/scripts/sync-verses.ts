/**
 * sync-verses — one-time authoring tool (plan §7.2, "setup-time only").
 *
 * Run BY HAND (`pnpm sync-verses`) whenever the curated verse list changes.
 * For each verse it produces, all committed to the repo:
 *   - Uthmanic Arabic + chapter names — Tarteel MCP (get_translation_text).
 *   - Swedish — *Den ädla Koranen* (Kent Asante Wennerström), read from the local
 *     Quran DB (data/quran.db), the translation the project uses everywhere. NOT
 *     Bernström, and NOT Tarteel. The DB text has PDF line-wrap artifacts; see
 *     swedishFromDb() — review verses.json's diff after a sync.
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
 * Two artifacts are produced, both committed:
 *   - src/content/verser/verses.json — the homepage daily-verse ROTATION (a small
 *     curated pool); every key must be cited by an essay (the build-time citation
 *     index derives `relatedEssay`).
 *   - src/data/quran-verses.json — a lean map (ayahKey → {textArabic, audioFile,
 *     segments, reciter}) for EVERY verse cited in any essay footnote. The rehype
 *     plugin (src/plugins/rehype-quran-verse.ts) reads this map to inject a compact
 *     recitation player after each verse a reader meets in the prose. So the author
 *     adds nothing new: they cite "Koranen, <Name> S:A" in a footnote as always, run
 *     `pnpm sync-verses`, and the player appears.
 *
 * Slicing is idempotent — an ayah whose mp3 already exists is left untouched, so a
 * re-run only fetches the newly-cited verses. A verse that QUL doesn't cover, or
 * whose text and segments disagree, is skipped (reported in the summary) rather than
 * aborting the whole run; it simply gets no player.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Segment, wordCount } from "../src/lib/arabic";

const TARTEEL_MCP_URL = "https://mcp.tarteel.ai/mcp";
// Tarteel is now used ONLY for the Uthmanic Arabic + chapter names (get_translation_text
// still needs a translation slug to answer, so we pass one and ignore its Swedish).
const TRANSLATION_SLUG = "sv-knut";
// The DISPLAYED Swedish comes from the local Quran DB — *Den ädla Koranen*
// (Kent Asante Wennerström), the translation the project uses everywhere — not
// from Tarteel's Bernström. See swedishFromDb() below.
const TRANSLATOR = "Kent Asante Wennerström";
const RECITER = "Ahmad al-Nufais - Murattal"; // QUL recitation #461
// al-Nufais murattal surah masters on Tarteel's CDN (003.mp3, 013.mp3, …) — sliced
// per-ayah so the cut shares QUL's clock and the word highlight stays in sync.
const AUDIO_BASE = "https://audio-cdn.tarteel.ai/quran/surah/alnufais/murattal/mp3";
// Ready-made per-ayah clips (003036.mp3, …). Independently cut, so their timing
// drifts from QUL's surah segments — fine ONLY for the no-highlight fallback below.
const AYAH_AUDIO_BASE = "https://audio-cdn.tarteel.ai/quran/alnufais";

// How much audio to keep around the recited words when slicing an ayah out of
// the surah master. A short lead-in/tail-out feels natural and rings out the
// final elongation without bleeding into the neighbouring ayah.
const LEAD_PAD_MS = 200;
const TAIL_PAD_MS = 400;

// Curated homepage rotation — every key is cited by at least one essay (verified).
const ROTATION_KEYS = ["13:28", "3:190", "17:44", "39:42"];

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = join(__dirname, "..");
const versesJsonPath = join(webRoot, "src/content/verser/verses.json");
const quranVersesPath = join(webRoot, "src/data/quran-verses.json");
const audioDir = join(webRoot, "public/audio/quran");
const qulSegmentsPath = join(__dirname, "data/qul-alnufais-segments.json");
const quranDbPath = join(webRoot, "../../data/quran.db");
const articlesDir = join(webRoot, "../../data/articles");

// The Quran footnote form essays already use — "Koranen, <Name> S:A" (a few use
// "sura <Name> S:A"). Mirrors src/lib/citations.ts so the set of verses we generate
// audio for is exactly the set readers can meet in the prose.
const QURAN_FOOTNOTE = /\[\^[^\]]+\]:\s*(?:Koranen,\s*|sura\s+)[^0-9\n]*?(\d{1,3}):(\d{1,3})/g;

/** Every ayahKey cited in any essay footnote, de-duplicated. */
async function citedKeys(): Promise<string[]> {
	const files = (await readdir(articlesDir)).filter((f) => f.endsWith(".md"));
	const set = new Set<string>();
	for (const f of files) {
		const body = await readFile(join(articlesDir, f), "utf8");
		for (const m of body.matchAll(QURAN_FOOTNOTE)) set.add(`${m[1]}:${m[2]}`);
	}
	return [...set];
}

/** The lean per-verse record the essay player needs (no Swedish — the prose already
 *  carries the literary translation; no glosses — not used in essays). */
interface EssayVerse {
	textArabic: string;
	audioFile: string;
	segments: Segment[];
	reciter: string;
}

/**
 * The committed Swedish, *Den ädla Koranen*, read straight from the local Quran
 * DB via the sqlite3 CLI (no driver dependency — same spirit as shelling out to
 * ffmpeg). The DB text carries PDF line-wrap artifacts: runs of spaces (collapsed
 * here) and the odd word split across a line ("sanner ligen", "kvar håller") that
 * a space-collapse cannot rejoin. Eyeball `git diff` on verses.json after a sync
 * and fix any survivors by hand before committing.
 */
function cleanSwedish(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

function swedishFromDb(surah: number, ayah: number): string {
	const sql =
		`SELECT text_swedish FROM verses WHERE surah_number=${surah} ` +
		`AND verse_number=${ayah} AND translator='${TRANSLATOR}' LIMIT 1;`;
	const out = execFileSync("sqlite3", [quranDbPath, sql], { encoding: "utf8" }).trim();
	if (!out) {
		throw new Error(`${surah}:${ayah}: no "${TRANSLATOR}" translation in ${quranDbPath}`);
	}
	return cleanSwedish(out);
}

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

/** Download a remote file wholesale — used for the ready-made per-ayah clips that
 *  back the no-highlight fallback (no ffmpeg, original quality). */
async function downloadFile(url: string, outPath: string): Promise<void> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`download ${url}: HTTP ${res.status}`);
	await writeFile(outPath, Buffer.from(await res.arrayBuffer()));
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

	// 1. Uthmanic Arabic + chapter names from Tarteel (one call); the Swedish in
	// this payload is ignored — we take ours from the local DB below.
	const tr = await callTarteel("get_translation_text", {
		queries: [{ start_ayah: key, translations: [TRANSLATION_SLUG] }],
	});
	const trText: string = tr.content?.[0]?.text ?? "";
	const trJson = trText.match(/\{[\s\S]*\}/);
	if (!trJson) throw new Error(`${key}: could not parse translation payload`);
	const trData = JSON.parse(trJson[0]);
	const ayahData = trData.ayahs?.[0];
	if (!ayahData) throw new Error(`${key}: no ayah in translation payload`);
	const textArabic: string = ayahData.text_arabic;

	// 2. Swedish — Den ädla Koranen, from the local Quran DB (not Tarteel).
	const textSwedish = swedishFromDb(surah, ayah);

	// 3. The QUL word timing can drive the highlight ONLY when the segment word
	// numbers line up with the tokenized text one-for-one — proven by an exact count
	// match. That is the bulletproof guarantee: a mid-verse split would otherwise
	// shift the spotlight onto the wrong word, which is unacceptable for the Qur'an.
	// When they disagree (QUL omitted a word's timing, or has none), we ship the
	// verse WITHOUT a highlight — the reader still sees the Arabic and can listen.
	const repaired = repairTrailingArtifact(qul.segments ?? []);
	const maxWord = repaired.length ? Math.max(...repaired.map((s) => s[0])) : 0;
	const canHighlight = repaired[0]?.[0] === 1 && maxWord === wordCount(textArabic);

	const fileName = `${pad3(surah)}${pad3(ayah)}.mp3`;
	const outPath = join(audioDir, fileName);
	await mkdir(audioDir, { recursive: true });
	// Idempotent: an ayah already produced is left untouched, so a re-run only fetches
	// the newly-cited verses. Delete the mp3 by hand to force a refresh.
	const cached = existsSync(outPath);

	let segments: Segment[];
	if (canHighlight) {
		// 4a. Slice the ayah out of the surah master at QUL's boundaries (so the cut
		// shares one clock with the timing), trimming the gap before the first word
		// and ringing out the last. Offsets are normalized to the saved clip.
		const firstStart = repaired[0][1];
		const lastEnd = Math.max(...repaired.map((s) => s[2]));
		const sliceStart = Math.max(0, firstStart - LEAD_PAD_MS);
		const sliceEnd = lastEnd + TAIL_PAD_MS;
		if (!cached) {
			await ffmpegSlice(
				`${AUDIO_BASE}/${pad3(surah)}.mp3`,
				sliceStart,
				sliceEnd - sliceStart,
				outPath,
			);
		}
		segments = repaired.map(
			([w, s, e]) => [w, Math.max(0, s - sliceStart), e - sliceStart] as Segment,
		);
	} else {
		// 4b. No usable word timing — download the ready-made per-ayah clip (no ffmpeg)
		// and ship with empty segments; the player renders the verse without a spotlight.
		if (!cached) await downloadFile(`${AYAH_AUDIO_BASE}/${fileName}`, outPath);
		segments = [];
	}

	console.log(
		`  ${canHighlight ? "✓" : "♪"} ${key}  ${ayahData.chapter_name}  (${fileName}${cached ? ", cached" : ""}, ${canHighlight ? `${segments.length} segments` : "audio only — no QUL word alignment"})`,
	);

	return {
		id: key,
		surah,
		ayah,
		ayahKey: key,
		surahName: ayahData.chapter_name,
		surahNameArabic: ayahData.chapter_name_arabic,
		textArabic,
		textSwedish,
		translator: TRANSLATOR,
		reciter: RECITER,
		audioFile: `/audio/quran/${fileName}`,
		segments,
	};
}

/** Numeric ayahKey sort (surah, then ayah) so output diffs stay stable. */
function bySurahAyah(a: string, b: string): number {
	const [as, aa] = a.split(":").map(Number);
	const [bs, ba] = b.split(":").map(Number);
	return as - bs || aa - ba;
}

async function main() {
	const qulSegments: Record<string, QulVerse> = JSON.parse(await readFile(qulSegmentsPath, "utf8"));
	const rotation = new Set(ROTATION_KEYS);
	const cited = await citedKeys();
	// Every verse a reader can meet (essays) ∪ the homepage rotation.
	const allKeys = [...new Set([...ROTATION_KEYS, ...cited])].sort(bySurahAyah);

	console.log(
		`Syncing ${allKeys.length} verses (${cited.length} cited in essays, ${ROTATION_KEYS.length} in rotation) — ` +
			"Arabic via Tarteel, al-Nufais via QUL, Den ädla Koranen via quran.db…",
	);

	const rotationEntries: VerseEntry[] = [];
	const map: Record<string, EssayVerse> = {};
	const skipped: { key: string; reason: string }[] = [];
	const audioOnly: string[] = []; // shipped, but with no word highlight

	for (const key of allKeys) {
		const isRotation = rotation.has(key);
		const qul = qulSegments[key];
		// `!qul` (no entry at all) → can still play via the per-ayah clip fallback;
		// pass a hollow QulVerse so fetchVerse takes the no-highlight path.
		try {
			const entry = await fetchVerse(
				key,
				qul ?? { segments: [], timestamp_from: 0, timestamp_to: 0 },
			);
			if (isRotation && entry.segments.length === 0) {
				// The homepage rotation relies on the word highlight — never ship one silently flat.
				throw new Error("rotation verse lost its QUL word alignment — fix before shipping");
			}
			map[key] = {
				textArabic: entry.textArabic,
				audioFile: entry.audioFile,
				segments: entry.segments,
				reciter: entry.reciter,
			};
			if (isRotation) rotationEntries.push(entry);
			if (entry.segments.length === 0) audioOnly.push(key);
		} catch (err) {
			const reason = err instanceof Error ? err.message : String(err);
			if (isRotation) throw new Error(`rotation verse ${key}: ${reason}`);
			skipped.push({ key, reason });
		}
	}

	await mkdir(dirname(versesJsonPath), { recursive: true });
	await writeFile(versesJsonPath, `${JSON.stringify(rotationEntries, null, "\t")}\n`);
	await mkdir(dirname(quranVersesPath), { recursive: true });
	await writeFile(quranVersesPath, `${JSON.stringify(map, null, "\t")}\n`);

	console.log(`\nWrote ${rotationEntries.length} rotation verses → ${versesJsonPath}`);
	console.log(`Wrote ${Object.keys(map).length} verses → ${quranVersesPath}`);
	console.log(`Audio → ${audioDir}`);
	if (audioOnly.length) {
		console.log(
			`\n${audioOnly.length} verse(s) ship as audio only — no QUL word alignment, so the player plays without a highlight: ${audioOnly.join(", ")}`,
		);
	}
	if (skipped.length) {
		console.log(`\nSkipped ${skipped.length} cited verse(s) (no player at all):`);
		for (const s of skipped) console.log(`  – ${s.key}: ${s.reason}`);
	}

	// Astro's content layer caches each entry's RENDERED html (node_modules/.astro/
	// data-store.json), keyed only by the markdown digest — it has no idea the rehype
	// verse-player output also depends on this map. So when the map changes but the
	// essays don't, the next `astro build` (incl. `pnpm ship`) re-emits the OLD players
	// from cache. Invalidate the store so the next build re-renders; Astro rebuilds it.
	const dataStore = join(webRoot, "node_modules/.astro/data-store.json");
	if (existsSync(dataStore)) {
		await rm(dataStore);
		console.log("Invalidated Astro content cache → next build re-renders the players.");
	}

	console.log(
		"\nCommit src/content/verser/verses.json, src/data/quran-verses.json and public/audio/quran/*.mp3.",
	);
}

main().catch((err) => {
	console.error("sync-verses failed:", err);
	process.exit(1);
});
