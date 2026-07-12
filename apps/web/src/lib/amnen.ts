import type { Article } from "./articles";

// The seven ämnen, in the canonical da'wah order (§6) — foundational theology
// first, the Swedish reader's meeting-point last. This order is used by the
// homepage sections (§7.7), the archive grouping (§9), and matches the schema
// enum in content.config.ts. `name` equals the essay `category` enum value.
export type AmneName =
	| "Skapelsen"
	| "Skriften"
	| "Själen"
	| "Rättvisa"
	| "Samhälle"
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
			"Naturen, djuren och kosmos lästa som tecken – vägen till en skapare går genom det vi ser omkring oss.",
	},
	{
		name: "Skriften",
		slug: "skriften",
		framing:
			"Koranen som text och budskap – vad den säger, hur dess språk bär och hur den uppenbarades och bevarades.",
	},
	{
		name: "Själen",
		slug: "sjalen",
		framing:
			"Människans inre liv – begäret och samvetet, sorgen och förlåtelsen, det som tär på en själ och det som läker den.",
	},
	{
		name: "Rättvisa",
		slug: "rattvisa",
		framing:
			"Rätt handling och lag – om rättvisa, makt och rättigheter, och vad vi är skyldiga varandra.",
	},
	{
		name: "Samhälle",
		slug: "samhalle",
		framing:
			"Livet tillsammans – tron i det offentliga, och en gammal tradition som möter dagens Sverige.",
	},
	{
		name: "Sökandet",
		slug: "sokandet",
		framing:
			"Den moderna människans sökande efter mening – och vad svenska tänkare och diktare anade på vägen.",
	},
	{
		name: "Norden",
		slug: "norden",
		framing: "Nordisk myt och gammalt svenskt arv – det nedärvda förflutna prövat i nytt ljus.",
	},
];

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
