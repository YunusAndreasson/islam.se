export interface NavLink {
	href: string;
	label: string;
}

export interface PaletteNavLink extends NavLink {
	sub: string;
}

export interface PalettePageLink extends PaletteNavLink {
	alt?: string;
}

/** Whether `path` belongs to a navigation destination. Section links remain current
 *  on their detail pages; the root destination is exact-only so it never claims the
 *  whole site. `activeHref` lets a root-level essay opt into the Essäer section. */
export function isNavCurrent(path: string, href: string, activeHref?: string): boolean {
	const normalize = (value: string) => (value === "/" ? value : `${value.replace(/\/$/, "")}/`);
	const destination = normalize(href);
	if (activeHref) return destination === normalize(activeHref);
	const current = normalize(path);
	return destination === "/" ? current === "/" : current.startsWith(destination);
}

/** Pick one current destination from a navigation surface. When destinations
 * overlap (for example /om/ and /om/redaktion/), the most specific match wins. */
export function currentNavHref(
	path: string,
	hrefs: readonly string[],
	activeHref?: string,
): string | undefined {
	if (activeHref) return hrefs.find((href) => isNavCurrent(path, href, activeHref));

	return hrefs.filter((href) => isNavCurrent(path, href)).sort((a, b) => b.length - a.length)[0];
}

const pages = {
	home: { href: "/", label: "Hem", sub: "Startsidan." },
	pillars: {
		href: "/vad-ar-islam/",
		label: "Pelare & tro",
		menuSub: "De fem pelarna och de sex trosartiklarna.",
		sub: "Vad är islam – fakta om de fem pelarna och de sex trosartiklarna, källbelagt.",
	},
	svar: {
		href: "/svar/",
		label: "Frågor & svar",
		menuSub: "Källbelagda svar på vanliga frågor.",
		sub: "Frågor och svar: källbelagda svar på vanliga frågor om islam – tro, dyrkan, mat och familj.",
	},
	essaer: { href: "/essaer/", label: "Essäer", sub: "Hela arkivet, ordnat efter ämne." },
	fordjupning: {
		href: "/fordjupning/",
		label: "Fördjupning",
		menuSub: "Omdiskuterade ämnen, från källorna till svensk rätt.",
		sub: "Fördjupning: källorna, historien och det svenska rättsläget, ämne för ämne.",
	},
	// ÄMNEN ÄR INGET EGET MÅL LÄNGRE (2026-08). /amnen/ renderade <AmnenHome
	// perDept={4} /> — samma sju ämnen, samma framing-rader, samma ordning som
	// /essaer/ redan visar, fast avkortat till fyra essäer per grupp. Sidan bar
	// dessutom backHref="/essaer/" med etiketten "Hela arkivet", och ämnessidornas
	// brödsmula gick Hem → Essäer → {ämne} och nämnde aldrig /amnen/. Indexet var
	// alltså redan föräldralöst från sina egna barn; bara menyerna höll det vid liv.
	//
	// /essaer/ ÄR ämnesindexet: det grupperar efter ämne, sätter varje amne.framing
	// som ingress, ankrar varje grupp på #amne-{slug} och har ett Ämnen-filter.
	// /amnen/{slug} står kvar och nås från de rubrikerna, från varje essäs kicker,
	// från FeatureEssay, från EssayConnections och som sju egna rader i paletten.
	// /amnen 301:ar till /essaer/ (se customRedirects i astro.config.ts).
	tradar: { href: "/tradar/", label: "Trådar", sub: "Utvalda läsningar genom essäerna." },
	tankare: { href: "/tankare/", label: "Tänkare", sub: "De röster essäerna återvänder till." },
	calendar: {
		href: "/det-islamiska-aret/",
		label: "Det islamiska året",
		footerLabel: "Kalender",
		sub: "Islamiska högtider och fastedagar med datum.",
	},
	mosqueScreen: {
		href: "/bonetider/skarm/",
		label: "Moskéskärm",
		menuSub: "Dagens tider på storbild i moskéns entré.",
		sub: "Dagens bönetider och iqāma på en skärm i moskén.",
	},
	prayerTimes: {
		href: "/bonetider/",
		label: "Bönetider",
		menuSub: "Hela Sverige, ort för ort, efter solens läge.",
		sub: "Bönetider för hela Sverige, ort för ort, efter solens läge.",
	},
	mosques: {
		href: "/moskeer/",
		label: "Moskéer",
		menuSub: "Karta över moskéer, län för län.",
		sub: "Karta över moskéer i hela Sverige, län för län.",
	},
	app: {
		href: "/app/",
		label: "App",
		menuSub: "Bönetider, påminnelser och qibla i fickan.",
		sub: "Appen för iPhone och Android: bönetider, påminnelser och qibla.",
	},
	nyheter: {
		href: "/nyheter/",
		label: "Nyheter",
		menuSub: "Världsnyheter på svenska.",
		sub: "Världsnyheter på svenska, levererade av zuhd.news och uppdaterade flera gånger om dagen.",
	},
	aiBarometern: {
		href: "/ai-barometern/",
		label: "AI-barometern",
		menuSub: "Vad AI-modellerna svarar, mätning för mätning.",
		sub: "Vad ChatGPT, Claude, Gemini, Grok och DeepSeek svarar om klimatet, AI, krig och tro, varje månad.",
	},
	podcast: {
		href: "/podcast/",
		label: "Podd",
		menuSub: "Essäerna inlästa.",
		sub: "Andliga essäer, inlästa – i Apple Podcasts, Spotify eller via RSS.",
	},
	about: { href: "/om/", label: "Om", sub: "Om idén bakom islam.se." },
	editorial: { href: "/om/redaktion/", label: "Redaktion" },
	ai: { href: "/ai/", label: "Läs med AI", sub: "Koppla hela arkivet till din AI-assistent." },
	corrections: { href: "/ratta/", label: "Föreslå en rättelse" },
	privacy: { href: "/integritetspolicy/", label: "Integritetspolicy" },
} as const;

// The mast is two tiers. It used to be one flat row that put a magazine, an
// encyclopedia and two utilities side by side as peers — Pelare & tro · Frågor &
// svar · Essäer · Bönetider · Moskéer · App · Podd — so the publication competed
// for attention with a prayer clock.
//
// NOTHING IS REMOVED. Bönetider alone is 2 128 of the 2 471 built pages and the
// mosque map is another 158; dropping either from the mast would put real traffic
// at risk to win an argument about tone. They move to a quieter second rail, and
// the three curated axes that were footer-only (Ämnen, Trådar, Tänkare) come up
// into the first.

/** Tier 1 — three links, ordered by the site's purpose, which is to PRESENT ISLAM.
 *
 *    Pelare & tro   what Islam is — the five pillars and the six articles of faith
 *    Frågor & svar  the reference half: 64 sourced answers, and the nine
 *                   fördjupning pillar pages that sit above them
 *    Essäer         the literary half
 *
 *  FÖRDJUPNING IS NOT A FOURTH ITEM. A pillar page and the short answers on its
 *  topic are one thing seen at two depths — /svar/ links up to the pillar and the
 *  pillar links back down to the answers — so listing both in the mast splits one
 *  destination into two labels and makes the reader choose between them before
 *  they know the difference. It stays in the footer and the palette.
 *
 *  Ämnen, Trådar and Tänkare are not here either: all three are ways THROUGH the
 *  essays rather than ways into Islam. None loses its link — footer and palette
 *  carry all three, Ämnen additionally from every essay's eyebrow and the front
 *  page's departments, Tänkare from the Mötet axis at the foot of every essay,
 *  Trådar from the front page and /essaer/. They are reached from the content that
 *  uses them rather than from a standing menu.
 *
 *  Resist adding a fourth. The row was seven flat items and the whole point of the
 *  second tier is that this one stays short enough to read at a glance. */
export const MAST_SECTION_LINKS: NavLink[] = [pages.pillars, pages.svar, pages.essaer];

/** The utility group — what the site DOES for you rather than an essay to read. Same
 *  row as the sections, set quieter and behind a hairline, so the mast reads as one
 *  line with two registers rather than two rows of unequal length.
 *
 *  AI-barometern is here and not in tier 1: it is a standing instrument, measured
 *  every month, and the three sections above stay about presenting Islam.
 *
 *  PODD LEFT THE MAST (2026-09-13) to make that room. The row is still three and
 *  three: one link was exchanged, so no page lost a path. A listener finds the
 *  podcast where they already are — beside »Lyssna« on every read essay, in the
 *  book-and-podcast close of the front page — and it keeps its footer and palette
 *  links on every page.
 *
 *  App is NOT here. The app IS prayer times — that is its whole first screen — and
 *  <AppPromo> already runs on all 2 128 city pages, /bonetider/ramadan/ and
 *  /bonetider/metod/. A standing mast link sent the reader to a promo page for
 *  something the page they were already on offers them. It keeps its page, its
 *  palette entry and those promos. */
export const MAST_UTILITY_LINKS: NavLink[] = [pages.prayerTimes, pages.mosques, pages.aiBarometern];

/** The front page's doorways (index.astro), which touch screens and narrow windows get under the
 *  lead essay in place of the mast's inline links. Built FROM the mast arrays, so the two cannot
 *  disagree: the hand-typed row this replaces still listed Podd's old neighbours after
 *  AI-barometern took Podd's place in the mast. */
const PAGE_BY_HREF = new Map<string, (typeof pages)[keyof typeof pages]>(
	Object.values(pages).map((page) => [page.href, page]),
);

export const HOME_DOORWAYS: PaletteNavLink[] = [...MAST_SECTION_LINKS, ...MAST_UTILITY_LINKS].map(
	(link) => {
		const page = PAGE_BY_HREF.get(link.href);
		const sub = page ? ("menuSub" in page ? page.menuSub : "sub" in page ? page.sub : "") : "";
		return { href: link.href, label: link.label, sub };
	},
);

/** The front page's »Praktiskt« movement (PraktisktHome.astro): what the site does for a reader
 *  besides the reading, including the two the mast has no room for. */
export const HOME_TOOL_LINKS: PaletteNavLink[] = [
	pages.prayerTimes,
	pages.mosques,
	pages.mosqueScreen,
	pages.app,
].map(({ href, label, menuSub }) => ({ href, label, sub: menuSub }));

export const PALETTE_READ_LINKS: PaletteNavLink[] = [
	{ href: pages.pillars.href, label: pages.pillars.label, sub: pages.pillars.menuSub },
	{ href: pages.svar.href, label: pages.svar.label, sub: pages.svar.menuSub },
	{
		href: pages.fordjupning.href,
		label: pages.fordjupning.label,
		sub: pages.fordjupning.menuSub,
	},
	pages.essaer,
];

export const PALETTE_TOOL_LINKS: PaletteNavLink[] = [
	{ href: pages.prayerTimes.href, label: pages.prayerTimes.label, sub: pages.prayerTimes.menuSub },
	{ href: pages.mosques.href, label: pages.mosques.label, sub: pages.mosques.menuSub },
	// Third, as in the mast, so the menu a phone opens lists what the desktop row shows.
	{
		href: pages.aiBarometern.href,
		label: pages.aiBarometern.label,
		sub: pages.aiBarometern.menuSub,
	},
	{ href: pages.app.href, label: pages.app.label, sub: pages.app.menuSub },
	{ href: pages.podcast.href, label: pages.podcast.label, sub: pages.podcast.menuSub },
	{ href: pages.nyheter.href, label: pages.nyheter.label, sub: pages.nyheter.menuSub },
];

export const PALETTE_MINOR_LINKS: NavLink[] = [
	pages.calendar,
	pages.about,
	pages.editorial,
	pages.ai,
	pages.corrections,
	pages.privacy,
];

export const FOOTER_GROUPS: { heading: string; links: NavLink[] }[] = [
	{
		heading: "Läs",
		links: [
			pages.pillars,
			pages.svar,
			pages.essaer,
			pages.fordjupning,
			pages.tradar,
			pages.tankare,
		],
	},
	{
		heading: "Praktiskt",
		links: [
			pages.prayerTimes,
			pages.mosques,
			pages.mosqueScreen,
			{ ...pages.calendar, label: pages.calendar.footerLabel },
			pages.podcast,
			pages.nyheter,
			pages.aiBarometern,
		],
	},
	{ heading: "Om islam.se", links: [pages.about, pages.editorial, pages.ai, pages.privacy] },
];
export const FOOTER_LINKS: NavLink[] = FOOTER_GROUPS.flatMap((group) => group.links);

export const STANDING_PALETTE_PAGES: PalettePageLink[] = [
	pages.essaer,
	pages.pillars,
	pages.svar,
	pages.fordjupning,
	pages.tradar,
	pages.tankare,
	pages.calendar,
	pages.prayerTimes,
	pages.mosques,
	{ href: pages.app.href, label: pages.app.label, sub: pages.app.sub, alt: "Appen" },
	pages.podcast,
	pages.nyheter,
	{ ...pages.aiBarometern, alt: "AI barometer ChatGPT Claude Gemini Grok DeepSeek" },
	pages.about,
	pages.ai,
	pages.home,
];
