import type { CollectionEntry } from "astro:content";
import { FAKTA_SLUGS } from "./fakta";

type SvarEntry = CollectionEntry<"svar">;

/** A themed section of the Q&A corpus, rendered on the Fakta hub
 *  (`/vad-ar-islam/`). The answer `.md` files carry no category field and the
 *  grouping is editorial, so the taxonomy lives here, next to the page that
 *  renders it. `ids` is the curated within-section order (not alphabetical) so
 *  each section reads pedagogically. */
export interface SvarCategory {
	/** Stable anchor + aria id. */
	slug: string;
	name: string;
	/** Short one-word label for the category pill nav (the full `name` heads the
	 *  section). Uppercased by the `.label` style, like Essäer's filter chips. */
	short?: string;
	/** One-sentence framing shown under the section heading. */
	intro: string;
	ids: string[];
}

// Ordered belief → sources → practice → daily life → society → concepts →
// comparative → history. The cornerstone Five Pillars + six Articles of Faith are
// NOT listed here — they live in the image-led FAKTA hub (lib/fakta.ts) and are
// filtered out of this index by `groupSvar` so the two sections never duplicate
// each other. Every remaining /svar/ id appears in exactly one section; any new
// answer not listed (and not a FAKTA slug) falls into a trailing "Övriga frågor"
// group so it can never silently vanish from the list.
export const SVAR_CATEGORIES: SvarCategory[] = [
	{
		slug: "tron",
		name: "Tro och tänkande",
		short: "Tro",
		intro:
			"Djupare frågor om tron – Guds enhet (tawhid), meningen med skapelsen, bevisen för Gud och livet efter döden.",
		ids: [
			"vad-ar-tawhid",
			"vad-sager-islam-om-livet-efter-doden",
			"varfor-skapade-gud-manniskan",
			"finns-bevis-for-gud",
			"tro-och-handling-i-islam",
		],
	},
	{
		slug: "koranen-och-profeten",
		name: "Koranen och profeten Muhammed",
		short: "Koranen",
		intro:
			"Uppenbarelsens källor – den heliga skriften, profetens liv och hans vägledande exempel (sunna).",
		ids: [
			"vad-ar-koranen",
			"vad-betyder-al-fatiha",
			"koranen-och-embryologi",
			"forsta-uppenbarelsen",
			"skrev-muhammed-koranen",
			"vad-ar-sunna",
		],
	},
	{
		slug: "pelarna-och-dyrkan",
		name: "Dyrkan i praktiken",
		short: "Dyrkan",
		intro:
			"Hur dyrkan utförs i vardagen – att bli muslim, rening före bön, moskén och de två högtiderna.",
		ids: [
			"hur-blir-man-muslim",
			"tvagning-wudu",
			"vad-ar-ghusl",
			"maste-gravida-fasta",
			"vad-ar-kaba",
			"vad-ar-en-moske",
			"eid-al-fitr-och-eid-al-adha",
		],
	},
	{
		slug: "mat-och-vardag",
		name: "Mat, vardag och kultur",
		short: "Mat",
		intro:
			"Det tillåtna och förbjudna (halal och haram) i mat och vardag – och vad som hör till sed snarare än religion.",
		ids: [
			"varfor-ater-muslimer-inte-griskott",
			"vad-ar-halalslakt",
			"far-muslimer-dricka-alkohol",
			"ar-vinager-halal",
			"far-muslimer-roka",
			"vad-betyder-alhamdulillah",
			"vad-sager-islam-om-vidskepelse",
			"islams-symboler",
		],
	},
	{
		slug: "familj-och-samhalle",
		name: "Familj och samhälle",
		short: "Familj",
		intro:
			"Äktenskap, familjeliv och omdebatterade samhällsfrågor – vad islams källor faktiskt säger, bortom rubrikerna.",
		ids: [
			"aktenskap-i-islam",
			"far-muslimska-man-ha-flera-fruar",
			"islams-syn-pa-kvinnan",
			"vad-ar-hijab",
			"vad-sager-islam-om-abort",
			"manlig-omskarelse-i-islam",
			"vad-sager-islam-om-kvinnlig-omskarelse",
			"vad-sager-islam-om-hedersmord",
			"fyra-vittnen-och-valdtakt",
		],
	},
	{
		slug: "begrepp-och-inriktningar",
		name: "Begrepp och inriktningar",
		short: "Begrepp",
		intro:
			"Ord som ofta missförstås: sharia, jihad och sufism – och skillnaden mellan sunni och shia.",
		ids: ["vad-ar-sharia", "vad-ar-jihad", "vad-ar-sufism", "sunni-och-shia"],
	},
	{
		slug: "islam-och-andra-livsaskadningar",
		name: "Islam och andra livsåskådningar",
		short: "Jämförelse",
		intro:
			"Hur islam förhåller sig till kristendomen, ateismen och andra sätt att se på Gud, skapelsen och världen.",
		ids: [
			"jesus-i-islam",
			"vad-sager-islam-om-ateism",
			"vad-sager-islam-om-agnosticism",
			"islam-deism-och-sekularism",
			"islam-och-polyteism",
			"islam-och-big-bang",
			"tror-muslimer-pa-karma",
		],
	},
	{
		slug: "historia",
		name: "Historia",
		short: "Historia",
		intro:
			"Från utvandringen till Medina till al-Andalus – händelserna och epokerna som format den muslimska världen.",
		ids: [
			"vad-var-hijra",
			"de-rattledda-kaliferna",
			"erovringen-av-mecka",
			"den-islamiska-guldaldern",
			"det-muslimska-spanien-al-andalus",
		],
	},
];

/** Group the FRÅGOR & SVAR corpus into the themed sections above, preserving each
 *  section's curated order. Cornerstone answers (the Five Pillars + six Articles
 *  of Faith — `FAKTA_SLUGS`) are dropped first: they live in the FAKTA hub, not in
 *  this index. Any remaining answer not assigned to a section is collected into a
 *  trailing "Övriga frågor" group (alphabetical), so adding a new `/svar/` page can
 *  never make it disappear from the list. Empty sections are dropped. */
export function groupSvar(
	entries: SvarEntry[],
): { category: SvarCategory; entries: SvarEntry[] }[] {
	const questions = entries.filter((e) => !FAKTA_SLUGS.has(e.id));
	const byId = new Map(questions.map((e) => [e.id, e]));
	const used = new Set<string>();

	const groups = SVAR_CATEGORIES.map((category) => {
		const list = category.ids.map((id) => byId.get(id)).filter((e): e is SvarEntry => Boolean(e));
		for (const e of list) used.add(e.id);
		return { category, entries: list };
	}).filter((g) => g.entries.length > 0);

	const rest = questions
		.filter((e) => !used.has(e.id))
		.sort((a, b) => a.data.title.localeCompare(b.data.title, "sv"));
	if (rest.length > 0) {
		groups.push({
			category: { slug: "ovrigt", name: "Övriga frågor", intro: "", ids: [] },
			entries: rest,
		});
	}

	return groups;
}
