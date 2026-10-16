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
 * ART, in two tiers. A card shows bespoke FAKTA photography when it exists, and
 * otherwise borrows an essay hero via `image` (an essay slug, resolved through the
 * `src/assets/images/*` glob in lib/articles.ts). Either way the photo is
 * decorative — the card label carries the meaning — so it renders with empty alt.
 *
 * Bespoke art needs no entry here at all: see FAKTA_ART below.
 */

import type { ImageMetadata } from "astro";
import { basename } from "./path";

interface FaktaItem {
	/** The answer this card opens, at `/svar/<svarSlug>/` (URL never changes). */
	svarSlug: string;
	/** Short card label — the pillar/article name (not the answer's full title). */
	label: string;
	/** One calm line under the label. */
	blurb: string;
	/** The same term transliterated, with the site's academic diacritics. */
	translit: string;
	/** Essay slug whose hero photo is borrowed when this card has no bespoke art
	 *  of its own in FAKTA_ART. Kept even once art lands — it is the fallback if
	 *  a file is ever removed. */
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
		name: "Islams fem pelare",
		intro:
			"Det en muslim gör (arkān al-islām): de fem handlingar som islam är byggd på – trosbekännelse, bön, allmosa, fasta och vallfärd.",
		overview: "islams-fem-pelare",
		overviewImage: "kompassnalens-moske",
		items: [
			{
				svarSlug: "trosbekannelsen-shahada",
				label: "Trosbekännelsen",
				translit: "ash-shahāda",
				blurb: "Vittnesbörden: ingen gud utom Gud, och Muhammed ﷺ är hans sändebud.",
				// A man under the Nordic night sky, looking up. The shahāda is a
				// witnessing, and this is what witnessing looks like. It replaced a
				// café window with coffee and a bun — a fine picture of seeking, which
				// is what its own essay is about, but the wrong register for the
				// testimony itself: it read as an ordinary Swedish afternoon.
				image: "skapad-ur-ingenting",
			},
			{
				svarSlug: "sa-ber-man-steg-for-steg",
				label: "Bönen",
				translit: "aṣ-ṣalāt",
				blurb: "De fem dagliga bönerna, förrättade med ansiktet vänt mot Kaba.",
				image: "nattbonens-ansikte",
			},
			{
				svarSlug: "vad-ar-zakat",
				label: "Allmosan",
				translit: "az-zakāt",
				blurb: "En årlig andel av förmögenheten som går till de behövande och renar resten.",
				image: "ater-ni-var-for-sig",
			},
			{
				svarSlug: "vad-ar-ramadan",
				label: "Fastan",
				translit: "aṣ-ṣawm",
				blurb: "Fastan från gryning till solnedgång under hela ramadan.",
				image: "forlatelsens-pris",
			},
			{
				svarSlug: "vad-ar-hajj",
				label: "Vallfärden",
				translit: "al-ḥajj",
				blurb: "Resan till Mecka, en plikt en gång i livet för den som har möjlighet.",
				// The arch shot, not an aerial of the Grand Mosque: pilgrims at eye level,
				// people who have travelled, rather than a postcard of a monument.
				image: "kompassnalens-moske",
			},
		],
	},
	{
		slug: "trosartiklarna",
		name: "Trons sex pelare",
		intro:
			"Det en muslim tror (arkān al-īmān, ofta kallade de sex trosartiklarna): tron på Gud, hans änglar, hans skrifter, hans sändebud, domedagen och förutbestämmelsen.",
		items: [
			{
				svarSlug: "islams-gudssyn",
				label: "Gud",
				translit: "Allāh",
				blurb: "Tron på en enda Gud, utan like och utan någon vid sin sida (tawhid).",
				image: "samma-stjarnhimmel",
			},
			{
				svarSlug: "tror-muslimer-pa-anglar",
				label: "Änglarna",
				translit: "al-malāʾika",
				blurb: "Tron på Guds änglar, skapade av ljus och alltid lydiga mot honom.",
				image: "nar-natten-inte-faller",
			},
			{
				svarSlug: "koranen-och-tidigare-skrifter",
				label: "Skrifterna",
				translit: "al-kutub",
				blurb: "Tron på de uppenbarade skrifterna, fullbordade i Koranen.",
				image: "bergen-som-vagrade",
			},
			{
				svarSlug: "vem-var-profeten-muhammed",
				label: "Sändebuden",
				translit: "ar-rusul",
				blurb: "Tron på alla Guds sändebud, med Muhammed ﷺ som det sista.",
				image: "rosten-over-taken",
			},
			{
				svarSlug: "vad-ar-domedagen",
				label: "Domedagen",
				translit: "al-yawm al-ākhir",
				blurb: "Tron på uppståndelsen och räkenskapen inför Gud.",
				// A figure waiting before a monumental clock — as-Sāʿah, the Hour, which
				// is the Quran's own name for this day.
				image: "tid-till-salu",
			},
			{
				svarSlug: "vad-ar-odet-qadar",
				label: "Förutbestämmelsen",
				translit: "al-qadar",
				blurb: "Tron på att ingenting sker utan Guds vetande och vilja.",
				image: "guden-som-bokfor",
			},
		],
	},
];

/** Bespoke FAKTA photography — art made FOR the pillars and articles of faith,
 *  rather than an essay hero pressed into service.
 *
 *  Convention over configuration: the file is named after the answer it belongs
 *  to, `src/assets/images/fakta/<svarSlug>.webp`, and that is the whole wiring.
 *  Drop a file in and that card stops borrowing; delete it and the borrow in
 *  `image` takes over again. No data edit either way. The file is also the
 *  answer page's top picture (svar/[slug].astro).
 *
 *  A card picture joins the series or the card keeps borrowing. The series is made
 *  pictures of lamplit rooms, dark and warm, and Bönen, Vallfärden and Domedagen
 *  borrow essay heroes in that hand on purpose: daylight documentary photographs
 *  were tried on those three cards (2026-10-11 and 2026-10-16), and the user asked
 *  for the old pictures that match (2026-10-17). The photographs now stand in the
 *  texts, beside the sentences they show: the prayer answer, the Kaaba answer and
 *  the burial fördjupning. The pillars overview has no picture of its own either.
 *
 *  The subfolder is deliberate: lib/articles.ts globs `images/*` NON-recursively
 *  for essay heroes, so FAKTA art can never collide with an essay slug — which it
 *  otherwise would the day someone writes an essay called "vad-ar-hajj". */
const artEntries = Object.entries(
	import.meta.glob<{ default: ImageMetadata }>("../assets/images/fakta/*.{jpg,jpeg,png,webp}", {
		eager: true,
	}),
);

export const FAKTA_ART: ReadonlyMap<string, ImageMetadata> = new Map(
	artEntries.map(([path, mod]) => [basename(path, /\.[^.]+$/), mod.default]),
);

/** Every cornerstone answer slug in hub order — each cluster's overview, then its
 *  cards. `groupSvar()` removes these from the FRÅGOR & SVAR index so FAKTA and the
 *  Q&A list never show the same answer twice; /svar/ still renders them in this order
 *  as rows its on-page search can reach. */
export const FAKTA_SVAR_ORDER: readonly string[] = FAKTA_CLUSTERS.flatMap((c) => [
	...(c.overview ? [c.overview] : []),
	...c.items.map((i) => i.svarSlug),
]);

export const FAKTA_SLUGS: ReadonlySet<string> = new Set(FAKTA_SVAR_ORDER);

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
