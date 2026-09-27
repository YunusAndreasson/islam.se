import type { Article } from "./articles";

// The seven ämnen, in the canonical da'wah order (§6) — foundational theology
// first, the Swedish reader's meeting-point last. This order is used by the
// homepage sections (§7.7), the archive grouping (§9), and matches the schema
// enum in content.config.ts. `name` equals the essay `category` enum value.
export type AmneName =
	| "Skapelsen"
	| "Koranen"
	| "Själen"
	| "Rättvisa"
	| "Samhälle"
	| "Livsfrågor"
	| "Norden";

export interface Amne {
	name: AmneName;
	slug: string;
	/** One line in the site's voice — a section is framed, not just labelled (§7.7). */
	framing: string;
	/** The ämne as it reads after »essäer om …« — written out, not derived, because
	 *  Swedish takes each word in its own form: »om rättvisa« but »om samhället«,
	 *  »om Koranen« with its capital. */
	omForm: string;
}

// NAMES IN SWEDISH USAGE (2026-09-27). Each word takes the form Swedish gives it as a
// heading: the unique and the proper in the definite (Skapelsen, Koranen, Själen,
// Norden), general and abstract ideas bare (Rättvisa, Samhälle, Livsfrågor). Forcing all
// seven into the definite — »Rättvisan«, »Samhället«, »Livsfrågorna« — was tried for
// one afternoon and read as a calque of the Arabic article (al-ʿadl, »the justice«);
// the user caught it. The mix was never the fault: the fault was a link built by
// lowercasing the name (»essäer om samhälle«), which `omForm` now writes out.
// »Skriften« read to a Swedish reader as the Bible on a topic that is the Quran;
// »Sökandet« was English »The Search«, where the curriculum and public service say
// »livsfrågor«. Slugs are unchanged (skriften, sokandet), so no URL moved.

export const AMNEN: Amne[] = [
	{
		name: "Skapelsen",
		slug: "skapelsen",
		omForm: "skapelsen",
		framing:
			"Vägen till en skapare går genom det vi ser omkring oss. Naturen, djuren och kosmos lästa som tecken.",
	},
	{
		name: "Koranen",
		slug: "skriften",
		omForm: "Koranen",
		framing: "Vad Koranen säger, vad dess språk förmår och hur den uppenbarades och bevarades.",
	},
	{
		name: "Själen",
		slug: "sjalen",
		omForm: "själen",
		framing:
			"Begäret och samvetet, sorgen och förlåtelsen. Det som tär på en själ och det som läker den.",
	},
	{
		name: "Rättvisa",
		slug: "rattvisa",
		omForm: "rättvisa",
		framing: "Rätt handling och lag. Om makt, om rättigheter och om vad vi är skyldiga varandra.",
	},
	{
		name: "Samhälle",
		slug: "samhalle",
		omForm: "samhället",
		framing: "Tron i det offentliga, och en gammal tradition som möter dagens Sverige.",
	},
	{
		name: "Livsfrågor",
		slug: "sokandet",
		omForm: "livsfrågor",
		framing:
			"Den moderna människans sökande efter mening, och vad svenska tänkare och diktare anade på vägen.",
	},
	{
		name: "Norden",
		slug: "norden",
		omForm: "Norden",
		framing: "Nordisk myt och gammalt svenskt arv, sedda i ett nytt ljus.",
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
