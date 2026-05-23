import type { Article } from "./articles";

// The seven ämnen, in the canonical da'wah order (§6) — foundational theology
// first, the Swedish reader's meeting-point last. This order is used by the
// homepage sections (§7.7), the archive grouping (§9), and matches the schema
// enum in content.config.ts. `name` equals the essay `category` enum value.
export type AmneName =
	| "Skapelsen"
	| "Skriften"
	| "Själen"
	| "Rätten"
	| "Samhället"
	| "Sökandet"
	| "Norden";

export interface Amne {
	name: AmneName;
	slug: string;
	/** One line in the site's voice — a section is framed, not just labelled (§7.7). */
	framing: string;
}

export const AMNEN: Amne[] = [
	{
		name: "Skapelsen",
		slug: "skapelsen",
		framing:
			"Skaparen, igenkänd genom sina tecken: naturen, djuren, kosmos — Koranens första argument för Gud.",
	},
	{
		name: "Skriften",
		slug: "skriften",
		framing: "Uppenbarelsen som följer: Koranen och dess budskap, språket, textens historia.",
	},
	{
		name: "Själen",
		slug: "sjalen",
		framing: "Hjärtats svar: begäret och lasterna, sorgen och förlåtelsen, tungan och reningen.",
	},
	{
		name: "Rätten",
		slug: "ratten",
		framing: "Rätt handling och lag: rättvisa, styre, rättigheter, pengar.",
	},
	{
		name: "Samhället",
		slug: "samhallet",
		framing: "Den troende gemenskapen och det offentliga: traditionen möter dagens Sverige.",
	},
	{
		name: "Sökandet",
		slug: "sokandet",
		framing:
			"Det moderna inre sökandet som inbjudan svarar på: Swedenborg, Strindberg, Linné, Levertin.",
	},
	{
		name: "Norden",
		slug: "norden",
		framing: "Det nedärvda förflutna, omprövat i nytt ljus: nordisk myt och gammalt svenskt arv.",
	},
];

export const amneBySlug = new Map(AMNEN.map((a) => [a.slug, a]));
export const amneByName = new Map(AMNEN.map((a) => [a.name, a]));

/** Articles carrying a given ämne, already in the feed's date order. */
export function essaysInAmne(articles: Article[], name: AmneName): Article[] {
	return articles.filter((a) => a.entry.data.category === name);
}

/** The ämnen that actually have essays, in da'wah order, with their essays. */
export function amnenWithEssays(articles: Article[]): { amne: Amne; essays: Article[] }[] {
	return AMNEN.map((amne) => ({ amne, essays: essaysInAmne(articles, amne.name) })).filter(
		(group) => group.essays.length > 0,
	);
}
