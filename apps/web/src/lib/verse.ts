import { getCollection } from "astro:content";
import glossesData from "../content/verser/glosses.json";
import { type Segment, wordCount } from "./arabic";
import { getArticles } from "./articles";
import { essaysCiting } from "./citations";
import { dayIndex } from "./daily";

export type { Segment, VerseToken } from "./arabic";
export { tokenizeArabic } from "./arabic";

// Per-word Swedish glosses, keyed by ayahKey, in word order (§7.2). A short
// reading aid distinct from Bernström's literary translation — hand-curated and
// reviewable in src/content/verser/glosses.json, never touched by sync-verses.
const GLOSSES = glossesData as Record<string, { ar: string; en: string; sv: string }[]>;

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
	/**
	 * Word-recitation timing for the committed mp3, sourced from QUL (§7.2).
	 * Each entry is [wordNumber, startMs, endMs], offsets relative to the start
	 * of `audioFile` — already normalized and cleaned by `sync-verses`. A word
	 * may appear more than once when the reciter repeats a phrase (al-Nufais's
	 * murattal does this), so word numbers are not unique and not monotonic;
	 * `startMs` always is. Empty when no segment data exists for the recitation.
	 */
	segments: Segment[];
}

export interface EssayRef {
	slug: string;
	title: string;
}

export interface VerseOfDay {
	verse: VerseData;
	refName: string; // corpus-style transliteration, e.g. "al-Raʿd"
	relatedSlug: string;
	relatedTitle: string;
	/**
	 * Every essay that cites this verse, most-recent first — including the primary
	 * one above. A verse rarely belongs to a single essay; surfacing the rest turns
	 * the daily verse into a doorway onto each essay that engages it (§7.2).
	 */
	relatedEssays: EssayRef[];
	/** Short Swedish gloss per recited word, word order. Empty if none curated. */
	glosses: string[];
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
		const citers = await essaysCiting(verse.ayahKey);
		const relatedEssays: EssayRef[] = [];
		for (const c of citers) {
			const title = titleBySlug.get(c.slug);
			if (title) relatedEssays.push({ slug: c.slug, title });
		}
		if (relatedEssays.length === 0) {
			throw new Error(
				`Daily verse ${verse.ayahKey} is cited by no essay — remove it from the rotation or add a citing essay (plan §7.2).`,
			);
		}
		const { slug: relatedSlug, title: relatedTitle } = relatedEssays[0];
		const glosses = GLOSSES[verse.ayahKey]?.map((g) => g.sv) ?? [];
		// A misaligned gloss table would point the wrong word at the wrong meaning;
		// fail the build rather than ship a silent mismatch.
		if (glosses.length > 0 && glosses.length !== wordCount(verse.textArabic)) {
			throw new Error(
				`Daily verse ${verse.ayahKey}: ${glosses.length} glosses for ${wordCount(verse.textArabic)} words — re-sync src/content/verser/glosses.json.`,
			);
		}
		resolved.push({
			verse,
			refName: SURAH_TRANSLIT[verse.surah] ?? verse.surahName,
			relatedSlug,
			relatedTitle,
			relatedEssays,
			glosses,
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
	return verses[dayIndex(verses.length)];
}
