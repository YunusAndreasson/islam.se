/**
 * FAKTA — the cornerstone of islam.se: the Five Pillars (de fem pelarna) and the
 * six Articles of Faith (de sex trosartiklarna). These are the encyclopedic spine
 * the head term "vad är islam" should rank for, so they earn their own image-led
 * hub at `/vad-ar-islam/` instead of sitting buried in the Q&A river.
 *
 * Each card opens an EXISTING answer at its unchanged `/svar/<slug>/` URL — we
 * reclassify, never move, so no SEO equity is spent. The cornerstone slugs are
 * removed from the FRÅGOR & SVAR index (see `groupSvar` in lib/svar.ts) so FAKTA
 * and the Q&A list don't duplicate each other.
 *
 * `image` borrows an essay hero (by essay slug, resolved via the
 * `src/assets/images/*` glob in lib/articles.ts) until bespoke FAKTA photography
 * lands — swap that one field per card. The borrowed photo is decorative (the card
 * label carries the meaning), so the hub renders it with an empty alt.
 */

export interface FaktaItem {
	/** The answer this card opens, at `/svar/<svarSlug>/` (URL never changes). */
	svarSlug: string;
	/** Short card label — the pillar/article name (not the answer's full title). */
	label: string;
	/** One calm line under the label. */
	blurb: string;
	/** Essay slug whose hero photo is borrowed for the card (temporary art). */
	image: string;
}

export interface FaktaCluster {
	/** Stable anchor + aria id. */
	slug: string;
	name: string;
	/** One-sentence framing under the heading. */
	intro: string;
	/** Overview answer the heading links to (e.g. `islams-fem-pelare`), if any. */
	overview?: string;
	/** Borrowed essay slug for the overview answer's OWN hero (not shown on the hub). */
	overviewImage?: string;
	items: FaktaItem[];
}

export const FAKTA_CLUSTERS: FaktaCluster[] = [
	{
		slug: "fem-pelarna",
		name: "De fem pelarna",
		intro:
			"Det en muslim gör (arkan al-islam): de fem handlingar som bär trons liv – trosbekännelse, bön, allmosa, fasta och vallfärd.",
		overview: "islams-fem-pelare",
		overviewImage: "kompassnalens-moske",
		items: [
			{
				svarSlug: "trosbekannelsen-shahada",
				label: "Trosbekännelsen",
				blurb: "Vittnesbörden: ingen gud utom Gud, och Muhammed är hans sändebud.",
				image: "det-han-letade-efter",
			},
			{
				svarSlug: "sa-ber-man-steg-for-steg",
				label: "Bönen",
				blurb: "De fem dagliga bönerna – trons ryggrad, bedda i riktning mot Kaba.",
				image: "nattbonens-ansikte",
			},
			{
				svarSlug: "vad-ar-zakat",
				label: "Allmosan",
				blurb: "Den årliga gåvan som renar förmögenheten och bär samhället.",
				image: "ater-ni-var-for-sig",
			},
			{
				svarSlug: "vad-ar-ramadan",
				label: "Fastan",
				blurb: "Ramadans fasta från gryning till solnedgång – kropp och själ i skola.",
				image: "forlatelsens-pris",
			},
			{
				svarSlug: "vad-ar-hajj",
				label: "Vallfärden",
				blurb: "Resan till Mecka som varje muslim med möjlighet gör en gång i livet.",
				image: "silvertarnans-hijra",
			},
		],
	},
	{
		slug: "trosartiklarna",
		name: "De sex trosartiklarna",
		intro:
			"Det en muslim tror (arkan al-iman): tron på Gud, hans änglar, hans skrifter, hans sändebud, domedagen och ödet.",
		items: [
			{
				svarSlug: "islams-gudssyn",
				label: "Gud",
				blurb: "Tron på en enda, oskapad Gud (tawhid) – islams hjärta.",
				image: "samma-stjarnhimmel",
			},
			{
				svarSlug: "tror-muslimer-pa-anglar",
				label: "Änglarna",
				blurb: "Tron på Guds änglar, skapade av ljus för att bära hans vilja.",
				image: "nar-natten-inte-faller",
			},
			{
				svarSlug: "koranen-och-tidigare-skrifter",
				label: "Skrifterna",
				blurb: "Tron på de uppenbarade skrifterna, fullbordade i Koranen.",
				image: "bergen-som-vagrade",
			},
			{
				svarSlug: "vem-var-profeten-muhammed",
				label: "Sändebuden",
				blurb: "Tron på profeternas kedja, beseglad med Muhammed.",
				image: "rosten-over-taken",
			},
			{
				svarSlug: "vad-ar-domedagen",
				label: "Domedagen",
				blurb: "Tron på uppståndelsen och räkenskapen inför Gud.",
				image: "solen-morknar-for-ingen",
			},
			{
				svarSlug: "vad-ar-odet-qadar",
				label: "Ödet",
				blurb: "Tron på Guds förutvetande och vishet i allt som sker.",
				image: "guden-som-bokfor",
			},
		],
	},
];

/** Every cornerstone answer slug, including each cluster's overview. `groupSvar()`
 *  removes these from the FRÅGOR & SVAR index so FAKTA and the Q&A list never show
 *  the same answer twice. */
export const FAKTA_SLUGS: ReadonlySet<string> = new Set(
	FAKTA_CLUSTERS.flatMap((c) => [
		...(c.overview ? [c.overview] : []),
		...c.items.map((i) => i.svarSlug),
	]),
);

/** Answer slug → borrowed essay slug, so a cornerstone answer page can render its
 *  own hero (it reads as a FAKTA article, not a bare Q&A). Covers the cluster
 *  overviews and every pillar/article card. */
export const FAKTA_IMAGE_BY_SVAR: ReadonlyMap<string, string> = new Map([
	...FAKTA_CLUSTERS.flatMap((c) => [
		...(c.overview && c.overviewImage
			? ([[c.overview, c.overviewImage]] as [string, string][])
			: []),
		...c.items.map((i) => [i.svarSlug, i.image] as [string, string]),
	]),
]);
