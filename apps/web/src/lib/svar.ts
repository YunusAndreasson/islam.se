import type { CollectionEntry } from "astro:content";
import { FAKTA_SLUGS } from "./fakta";

type SvarEntry = CollectionEntry<"svar">;

export interface SvarSeoMetadata {
	title: string;
	description: string;
}

// GSC, 1–28 August 2026: these pages already rank on page one but their generic
// question titles fail to echo the wording that earns most impressions. Keep the
// editorial H1/headline intact; this map is only the concise search-result promise.
//
// vad-ar-kaba had an entry here (»Kaba – helgedomen i Mecka«) until 2026-09-24. It chased
// »helgedom i mecka«, 1 030 impressions and 0 clicks in 90 days — a crossword clue, not a
// question: the searcher wants the four letters, and the result page gives them. The page
// now carries its own question title and question-shaped H2s for the real queries.
const SVAR_SEO_OVERRIDES = new Map<string, SvarSeoMetadata>([
	// GSC, 5 August–2 November 2026: 15 471 impressions, 13 clicks (0,1 %) at position
	// 7–9; the title above (2026-08-31) left the rate where it was. The old description
	// listed all five, which is the whole answer to »islams fem pelare«, so the result
	// page was enough – the halalslakt lesson. This one names the stakes and withholds the
	// list; the list itself now opens the first section, where a snippet can take it.
	[
		"islams-fem-pelare",
		{
			title: "Islams fem pelare – vilka är de?",
			description:
				"Islam är byggd på fem pelare. Faller den första rasar allt, och en av de andra kan enligt flera lärda inte överges utan att man lämnar islam. Här är alla fem.",
		},
	],
	[
		"vad-ar-hajj",
		{
			title: "Hajj – islams vallfärd till Mecka",
			description:
				"Hajj är islams vallfärd till Mecka och den femte pelaren. Se vem som måste resa, vilka riter som ingår och skillnaden mellan hajj och umra.",
		},
	],
	// GSC, 17–23 September 2026: the searches are »hur många fruar…«, not »får…«.
	// Where the wording matched (»…får muslimer ha«) the page converted 10,5 %; the
	// »…får en muslimsk man ha« variant, 4 964 impressions, only 1,4–4,6 %. The
	// description is kept as it was: it names the number and withholds the condition.
	[
		"far-muslimska-man-ha-flera-fruar",
		{
			title: "Hur många fruar får en muslim ha? Fyra – på ett villkor",
			description:
				"Islam tillåter en man upp till fyra fruar – men bara på ett villkor som de flesta glömmer, och det avgör om äktenskapet är tillåtet eller en synd inför Gud.",
		},
	],
	// GSC, 27 August–23 September 2026: »får muslimer dricka alkohol« converts 1 % at
	// position 1,8 against a title that asks »varför« instead.
	[
		"far-muslimer-dricka-alkohol",
		{
			title: "Får muslimer dricka alkohol? Därför är det förbjudet",
			description:
				"Koranen förbjöd rusdrycker i tre steg: först en varning, sedan förbud mot att be berusad, till sist budet att hålla sig borta. Det som skyddas är människans förnuft.",
		},
	],
	// GSC, 27 August–23 September 2026: »vad är halal slakt« converts 0,8 % at position
	// 1,7. The old description was the whole answer, definition and law both, so the
	// result page was enough. This one keeps the law question and leaves it open.
	[
		"vad-ar-halalslakt",
		{
			title: "Vad är halalslakt? Så går slakten till",
			description:
				"Halalslakt är laglig i Sverige – men bara på ett villkor, och där går de lärda isär. Så går slakten till, vad Guds namn över djuret kräver och när köttet ändå blir haram.",
		},
	],
]);

export function svarSeoMetadata(id: string, fallback: SvarSeoMetadata): SvarSeoMetadata {
	return SVAR_SEO_OVERRIDES.get(id) ?? fallback;
}

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
		intro: "Guds enhet (tawhid), meningen med skapelsen, bevisen för Gud och livet efter döden.",
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
			"Var uppenbarelsen kommer ifrån, hur profetens liv såg ut och vad hans exempel (sunna) betyder.",
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
		intro: "Att bli muslim, rening före bön, moskén och de två högtiderna.",
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
			"Vad som är tillåtet och förbjudet (halal och haram) i mat och vardag, och skillnaden mellan sedvänja och religiösa regler.",
		ids: [
			"varfor-ater-muslimer-inte-griskott",
			"vad-ar-halalslakt",
			"vad-betyder-halal",
			"far-muslimer-dricka-alkohol",
			"ar-vinager-halal",
			"far-muslimer-roka",
			"vad-betyder-alhamdulillah",
			"vad-betyder-inshallah",
			"vad-betyder-mashallah",
			"vad-betyder-bismillah",
			"vad-sager-islam-om-vidskepelse",
			"islams-symboler",
		],
	},
	{
		slug: "familj-och-samhalle",
		name: "Familj och samhälle",
		short: "Familj",
		intro: "Frågor om äktenskap, familjeliv och samhället, med svar utifrån Koranen och sunna.",
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
			"Sharia, jihad och sufism är ord som ofta missförstås. Här står också vad som skiljer sunni från shia.",
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
			"Händelserna och epokerna som format den muslimska världen, från utvandringen till Medina till al-Andalus.",
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
