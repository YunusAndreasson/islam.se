/**
 * sync-verses — one-time authoring tool (plan §7.2, "setup-time only").
 *
 * Run BY HAND (`pnpm sync-verses`) whenever the curated verse list changes.
 * For each verse it fetches, from the Tarteel MCP:
 *   - the Uthmanic Arabic + Mohammed Knut Bernström's Swedish (get_translation_text, sv-knut)
 *   - Yasser al-Dosari's recitation mp3 (play_ayahs, reciter 26)
 * then writes src/content/verser/verses.json and downloads the mp3s into
 * public/audio/quran/. ALL of it — text and audio — is committed to the repo.
 *
 * From then on `astro build` and `pnpm ship` read only those static files.
 * Tarteel is NOT called at build, deploy, or runtime.
 *
 * The verse pool is curated from the corpus: every verse must be cited by an
 * essay (the build-time citation index derives `relatedEssay`). al-Mulk 67:3,
 * al-Baqara 2:186 and Qāf 50:16 were dropped — no essay cites them.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TARTEEL_MCP_URL = "https://mcp.tarteel.ai/mcp";
const RECITER_ID = 26; // Yasser al-Dosari (§13.2)
const TRANSLATION_SLUG = "sv-knut"; // Mohammed Knut Bernström, Koranens budskap

// Curated rotation — every key is cited by at least one essay (verified).
const VERSE_KEYS = ["13:28", "3:190", "17:44", "39:42"];

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = join(__dirname, "..");
const versesJsonPath = join(webRoot, "src/content/verser/verses.json");
const audioDir = join(webRoot, "public/audio/quran");

/** Call a Tarteel MCP tool over JSON-RPC; return the full `result` object. */
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
}

async function fetchVerse(key: string): Promise<VerseEntry> {
	const [surah, ayah] = key.split(":").map((n) => Number.parseInt(n, 10));

	// 1. Arabic + Bernström, one call.
	const tr = await callTarteel("get_translation_text", {
		queries: [{ start_ayah: key, translations: [TRANSLATION_SLUG] }],
	});
	const trText: string = tr.content?.[0]?.text ?? "";
	const trJson = trText.match(/\{[\s\S]*\}/);
	if (!trJson) throw new Error(`${key}: could not parse translation payload`);
	const trData = JSON.parse(trJson[0]);
	const ayahData = trData.ayahs?.[0];
	if (!ayahData) throw new Error(`${key}: no ayah in translation payload`);
	const swedish = ayahData.translations?.find((t: any) => t.translator?.includes("Bernström"));
	if (!swedish) throw new Error(`${key}: Bernström translation missing`);

	// 2. Dosari audio URL.
	const audio = await callTarteel("play_ayahs", {
		queries: [{ start_ayah: key, reciter_id: RECITER_ID }],
	});
	const item = audio.structuredContent?.items?.[0];
	if (!item?.audio_url) throw new Error(`${key}: no audio_url`);

	// 3. Download the mp3 into public/audio/quran/.
	const fileName = item.audio_url.split("/").pop() as string; // e.g. 013028.mp3
	const mp3 = await fetch(item.audio_url);
	if (!mp3.ok) throw new Error(`${key}: audio download failed (${mp3.status})`);
	await mkdir(audioDir, { recursive: true });
	await writeFile(join(audioDir, fileName), Buffer.from(await mp3.arrayBuffer()));

	console.log(`  ✓ ${key}  ${ayahData.chapter_name}  (${fileName})`);

	return {
		id: key,
		surah,
		ayah,
		ayahKey: key,
		surahName: ayahData.chapter_name,
		surahNameArabic: ayahData.chapter_name_arabic,
		textArabic: ayahData.text_arabic,
		textSwedish: swedish.text.trim(),
		translator: swedish.translator,
		reciter: item.reciter_name,
		audioFile: `/audio/quran/${fileName}`,
	};
}

async function main() {
	console.log(`Syncing ${VERSE_KEYS.length} verses from Tarteel (Dosari, Bernström)…`);
	const entries: VerseEntry[] = [];
	for (const key of VERSE_KEYS) {
		entries.push(await fetchVerse(key));
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
