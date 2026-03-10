/**
 * Tarteel MCP API client — fetches tafsir data via Streamable HTTP transport.
 * Uses the public MCP endpoint at mcp.tarteel.ai (no auth required).
 */

const TARTEEL_MCP_URL = "https://mcp.tarteel.ai/mcp";

export interface TafsirResult {
	surah: number;
	ayah: number;
	ayahKey: string;
	tafsirSlug: string;
	text: string;
}

/**
 * Parse a surah:ayah key like "10:36" into { surah, ayah }.
 */
function parseAyahKey(key: string): { surah: number; ayah: number } {
	const [s = "0", a = "0"] = key.split(":");
	return { surah: parseInt(s, 10), ayah: parseInt(a, 10) };
}

/**
 * Call a Tarteel MCP tool via JSON-RPC over HTTP POST.
 */
async function callTarteelTool(toolName: string, args: Record<string, unknown>): Promise<string> {
	const id = Math.floor(Math.random() * 100000);
	const response = await fetch(TARTEEL_MCP_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
		},
		body: JSON.stringify({
			jsonrpc: "2.0",
			id,
			method: "tools/call",
			params: { name: toolName, arguments: args },
		}),
	});

	const raw = await response.text();

	// Response is SSE format: "event: message\ndata: {...}\n"
	const dataLine = raw.split("\n").find((line) => line.startsWith("data: "));
	if (!dataLine) {
		throw new Error(`Tarteel: no data in response for ${toolName}`);
	}

	const parsed = JSON.parse(dataLine.slice(6));
	if (parsed.error) {
		throw new Error(`Tarteel ${toolName} error: ${JSON.stringify(parsed.error)}`);
	}

	const content = parsed.result?.content;
	if (!(content && Array.isArray(content)) || content.length === 0) {
		throw new Error(`Tarteel ${toolName}: empty content`);
	}

	return content[0].text ?? "";
}

/**
 * Fetch Ibn Kathir tafsir (Arabic) for a list of ayah keys.
 * Keys are in "surah:ayah" format, e.g. ["10:36", "17:36"].
 * Batches into a single request (max 20 queries per Tarteel limit).
 */
export async function fetchIbnKathirTafsir(ayahKeys: string[]): Promise<TafsirResult[]> {
	if (ayahKeys.length === 0) return [];

	const results: TafsirResult[] = [];

	// Tarteel limits: max 20 queries, max 50 total ayah+tafsir items
	const batchSize = 20;
	for (let i = 0; i < ayahKeys.length; i += batchSize) {
		const batch = ayahKeys.slice(i, i + batchSize);
		const queries = batch.map((key) => ({
			start_ayah: key,
			tafsir_slugs: ["ar-tafsir-ibn-kathir"],
		}));

		try {
			const text = await callTarteelTool("ayah_tafsir", { queries });

			// Response format: { ayahs: [{ chapter, verse, verse_end, tafsir_text, ... }] }
			const jsonMatch = text.match(/\{[\s\S]*\}/);
			if (jsonMatch) {
				const data = JSON.parse(jsonMatch[0]);
				const ayahs = data.ayahs ?? data.results ?? [];
				for (const entry of ayahs) {
					const chapter = entry.chapter ?? entry.surah;
					const verse = entry.verse ?? entry.ayah;
					const tafsirText = entry.tafsir_text ?? entry.text ?? "";
					if (!(chapter && verse && tafsirText)) continue;

					// Tarteel may group verses (e.g. 267-269 for query 2:269)
					// Map back to the requested ayah key
					const verseEnd = entry.verse_end ?? verse;
					const matchingKeys = batch.filter((key) => {
						const { surah, ayah } = parseAyahKey(key);
						return surah === chapter && ayah >= verse && ayah <= verseEnd;
					});

					for (const ayahKey of matchingKeys) {
						const { surah, ayah } = parseAyahKey(ayahKey);
						results.push({
							surah,
							ayah,
							ayahKey,
							tafsirSlug: "ar-tafsir-ibn-kathir",
							text: tafsirText,
						});
					}
				}
			}
		} catch (err) {
			// Log but don't fail — partial results are still useful
			console.error(`  Tarteel batch ${i / batchSize + 1} failed: ${err}`);
		}
	}

	return results;
}

/**
 * Extract Quran references from article footnotes.
 * Matches patterns like: [^N]: Koranen, al-Baqarah 2:269.
 * Returns unique ayah keys in "surah:ayah" format.
 */
export function extractQuranRefsFromFootnotes(
	articleBody: string,
): Array<{ footnote: string; surahName: string; ayahKey: string }> {
	const refs: Array<{
		footnote: string;
		surahName: string;
		ayahKey: string;
	}> = [];
	const seen = new Set<string>();

	// Match footnote definitions with Quran references
	// Patterns: "Koranen, al-Baqarah 2:269" or "Koranen, Yūnus 10:36" or "sura al-Isrāʾ 17:36"
	const footnotePattern =
		/\[\^(\d+)\]:\s*(?:Koranen,\s*|sura\s+)([^0-9]+?)\s*(\d+):(\d+)(?:[–-](\d+))?/g;

	for (const match of articleBody.matchAll(footnotePattern)) {
		const footnoteNum = match[1] ?? "";
		const surahName = match[2] ?? "";
		const surahNum = match[3] ?? "";
		const ayahStart = match[4] ?? "";
		const ayahEnd = match[5];
		const key = `${surahNum}:${ayahStart}`;

		if (!seen.has(key)) {
			seen.add(key);
			refs.push({
				footnote: `[^${footnoteNum}]`,
				surahName: surahName.trim(),
				ayahKey: key,
			});
		}

		// If it's a range like 52:35-36, also add the end verse
		if (ayahEnd) {
			const endKey = `${surahNum}:${ayahEnd}`;
			if (!seen.has(endKey)) {
				seen.add(endKey);
				refs.push({
					footnote: `[^${footnoteNum}]`,
					surahName: surahName.trim(),
					ayahKey: endKey,
				});
			}
		}
	}

	return refs;
}
