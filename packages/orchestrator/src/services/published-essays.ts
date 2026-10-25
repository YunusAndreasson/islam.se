/**
 * What the research stage is shown about the essays already published.
 *
 * ⚠️ Research could not see the published corpus, so it re-derived hinges that were
 * already taken: the same verse or the same passage of Ibn Taymiyya, turned the same way,
 * in a second essay. The check was a manual grep of data/articles before every run. This
 * gives the stage each essay's title, description, and the verses and works its notes cite.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface EssayHinges {
	title: string;
	description: string;
	/** Quran references in the notes, in order of first appearance ("2:29", "43:22–24"). */
	verses: string[];
	/** "Author, Work" pairs the notes cite most, most cited first. */
	works: string[];
}

const MAX_VERSES = 10;
const MAX_WORKS = 5;

function frontmatterField(markdown: string, field: string): string {
	const m = new RegExp(`^${field}:\\s*"?(.*?)"?\\s*$`, "m").exec(markdown.slice(0, 2000));
	return m?.[1]?.trim() ?? "";
}

/** The title, description and cited sources of one published essay. */
export function essayHinges(markdown: string): EssayHinges {
	const notes = [...markdown.matchAll(/^\[\^[^\]]+\]:\s*(.*)$/gm)].map((m) => m[1] ?? "");
	const verses: string[] = [];
	const works = new Map<string, number>();
	for (const note of notes) {
		// »Koranen 2:29« in the newer essays, »Koranen, al-Baqarah 2:269« in the older ones.
		for (const m of note.matchAll(/Koranen[^\d\n]{0,40}?(\d+:\d+(?:[–-]\d+)?)/g)) {
			if (m[1] && !verses.includes(m[1])) verses.push(m[1]);
		}
		// A note opens »Author, *Work* …«; the author is what stands before the first italic.
		const cited = /^([^*,]{2,60}),\s*\*([^*]{2,80})\*/.exec(note);
		if (cited) {
			const key = `${cited[1]?.trim()}, ${cited[2]?.trim()}`;
			works.set(key, (works.get(key) ?? 0) + 1);
		}
	}
	return {
		title: frontmatterField(markdown, "title"),
		description: frontmatterField(markdown, "description"),
		verses: verses.slice(0, MAX_VERSES),
		works: [...works.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, MAX_WORKS)
			.map(([work]) => work),
	};
}

/**
 * The two title frames the pipeline keeps falling back on. A frame is the sentence shape
 * with the words swapped out; readers see the titles side by side on the front page.
 *
 * ⚠️ Three of eight titles in October 2026 were »Resenären som sitter still«, »Guden som
 * gick sönder« and »Koppen som höll natten vaken«, and the genitive (»Polarnattens fiqh«,
 * »Fenrisulvens kedja«) was what the author and ideator prompts gave as their examples.
 * The user asked for titles that do not all read as written by the same model.
 */
export type TitleFrame = "som-sats" | "genitiv";

export function titleFrame(title: string): TitleFrame | null {
	const words = title.trim().split(/\s+/);
	// A definite noun and a som-clause: »Guden som gick sönder«.
	if (words.length >= 3 && words[1]?.toLowerCase() === "som") return "som-sats";
	// A genitive and a noun, nothing more: »Tigerns bön«, »Sömnens lilla död«.
	if (words.length >= 2 && words.length <= 3 && /^\p{Lu}\p{L}{3,}s$/u.test(words[0] ?? "")) {
		return "genitiv";
	}
	return null;
}

/** The titles of the most recently published essays, newest first. */
export function recentTitles(articlesDir: string, count: number): string[] {
	if (!existsSync(articlesDir)) return [];
	return readdirSync(articlesDir)
		.filter((file) => file.endsWith(".md"))
		.map((file) => readFileSync(join(articlesDir, file), "utf-8"))
		.map((markdown) => ({
			title: frontmatterField(markdown, "title"),
			publishedAt: frontmatterField(markdown, "publishedAt"),
		}))
		.filter((essay) => essay.title)
		.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
		.slice(0, count)
		.map((essay) => essay.title);
}

const RECENT_TITLES = 12;

/** The `<recent_titles>` block for every stage that writes or corrects a title. */
export function recentTitlesBlock(articlesDir: string): string {
	const titles = recentTitles(articlesDir, RECENT_TITLES);
	if (titles.length === 0) return "";
	return `<recent_titles>
De senaste titlarna på sajten, nyast först. Samma modell har skrivit de flesta, och på förstasidan står de bredvid varandra. Två ramar har den fastnat i, och båda läses som maskinskrivna. Använd dem inte:
- bestämt substantiv med som-sats: »Guden som gick sönder«, »Resenären som sitter still«, »Skapelsehymnen som slutar med ett kanske«
- en genitiv och ett substantiv i bildlig mening: »Tigerns bön«, »Kompassnålens moské«, »Silvertärnans hijra«
Undvik också ett föremål som gör något mänskligt och en paradox som pointe.

Skriv hellre det en redaktör på en svensk dagstidning skulle sätta: ett påstående med subjekt och verb som säger essäns sak (»Folkmordet skrevs under i förväg«, »Muslimerna bad för en kristen kung«, »Goliat var också ett barn«), en fråga som läsaren själv ställer (»Måste du tro som dina föräldrar?«) eller ord ur materialet (»Om dessa ord når er«). Liknar titeln någon i listan till byggnaden, välj en annan form.

${titles.map((title) => `- ${title}`).join("\n")}
</recent_titles>`;
}

/** The `<published_essays>` block for the research prompt, or "" when nothing is published. */
export function publishedEssaysBlock(articlesDir: string): string {
	if (!existsSync(articlesDir)) return "";
	const lines = readdirSync(articlesDir)
		.filter((file) => file.endsWith(".md"))
		.sort()
		.map((file) => essayHinges(readFileSync(join(articlesDir, file), "utf-8")))
		.filter((essay) => essay.title)
		.map((essay) => {
			const parts = [`${essay.title} — ${essay.description}`];
			if (essay.verses.length > 0) parts.push(`Koranen ${essay.verses.join(", ")}`);
			if (essay.works.length > 0) parts.push(essay.works.join("; "));
			return `- ${parts.join(" | ")}`;
		});
	if (lines.length === 0) return "";
	return `<published_essays>
Essays already on the site, each with the Quran verses and the works its notes cite. Read the list before you settle this essay's Islamic hinge. An essay that turns on the same verse, or the same passage of the same work, read the same way as one already published, repeats it: choose another hinge, or a reading the earlier essay did not make. Sharing a source with an earlier essay is fine; sharing its turn is not. Say in your summary which earlier essays come closest and how this one differs.

${lines.join("\n")}
</published_essays>`;
}
