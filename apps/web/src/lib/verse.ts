import { getCollection } from "astro:content";
import { getArticles } from "./articles";
import { relatedEssayFor } from "./citations";

export interface VerseData {
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

export interface VerseOfDay {
	verse: VerseData;
	refName: string; // corpus-style transliteration, e.g. "al-Raʿd"
	relatedSlug: string;
	relatedTitle: string;
}

// Corpus transliteration (macrons, non-assimilated "al-") for the surahs in the
// rotation — matches how the essays set Arabic names (§4, §11). Tarteel's plainer
// romanization (e.g. "Ar-Ra'd") is the fallback. Extend as the rotation grows.
const SURAH_TRANSLIT: Record<number, string> = {
	3: "Āl ʿImrān",
	13: "al-Raʿd",
	17: "al-Isrāʾ",
	39: "al-Zumar",
};

/**
 * The committed verse rotation, each resolved to the essay that cites it.
 * Throws if a verse is cited by no essay (the §7.2 rule, enforced at build) —
 * since `sync-verses` only fetches cited verses, this should never fire unless
 * a verse is added without a citing essay.
 */
export async function getRotationVerses(): Promise<VerseOfDay[]> {
	const [verser, articles] = await Promise.all([getCollection("verser"), getArticles()]);
	const titleBySlug = new Map(articles.map((a) => [a.slug, a.title]));

	const resolved: VerseOfDay[] = [];
	for (const entry of verser) {
		const verse = entry.data as VerseData;
		const relatedSlug = await relatedEssayFor(verse.ayahKey);
		if (!relatedSlug) {
			throw new Error(
				`Daily verse ${verse.ayahKey} is cited by no essay — remove it from the rotation or add a citing essay (plan §7.2).`,
			);
		}
		const relatedTitle = titleBySlug.get(relatedSlug);
		if (!relatedTitle) {
			throw new Error(`Daily verse ${verse.ayahKey} derives to unknown essay "${relatedSlug}".`);
		}
		resolved.push({
			verse,
			refName: SURAH_TRANSLIT[verse.surah] ?? verse.surahName,
			relatedSlug,
			relatedTitle,
		});
	}

	// Stable order so the day-based index is deterministic across builds.
	resolved.sort((a, b) =>
		a.verse.ayahKey.localeCompare(b.verse.ayahKey, undefined, { numeric: true }),
	);
	return resolved;
}

/** Deterministic date-based pick over the committed rotation (§7.2). */
export async function getVerseOfDay(): Promise<VerseOfDay | null> {
	const verses = await getRotationVerses();
	if (verses.length === 0) return null;
	const dayIndex = Math.floor(Date.now() / 86_400_000) % verses.length;
	return verses[dayIndex];
}
