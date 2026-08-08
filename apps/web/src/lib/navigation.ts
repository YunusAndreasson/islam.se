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
		menuSub: "Omdiskuterade ämnen tagna hela vägen.",
		sub: "Fördjupning: källorna, historien och det svenska rättsläget, ämne för ämne.",
	},
	amnen: {
		href: "/amnen/",
		label: "Ämnen",
		menuSub: "De sju ingångarna essäerna är ordnade efter.",
		sub: "Ämnen: de sju ingångarna essäerna är ordnade efter, från skapelsen till Norden.",
	},
	tradar: { href: "/tradar/", label: "Trådar", sub: "Utvalda läsningar genom essäerna." },
	tankare: { href: "/tankare/", label: "Tänkare", sub: "De röster essäerna återvänder till." },
	calendar: {
		href: "/det-islamiska-aret/",
		label: "Det islamiska året",
		footerLabel: "Kalender",
		sub: "Islamiska högtider och fastedagar med datum.",
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
	podcast: {
		href: "/podcast/",
		label: "Podd",
		menuSub: "Essäerna inlästa.",
		sub: "Andliga essäer, inlästa — i Apple Podcasts, Spotify eller via RSS.",
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
// NOTHING IS REMOVED. Bönetider alone is 2 118 of the 2 464 built pages and the
// mosque map is another 158; dropping either from the mast would put real traffic
// at risk to win an argument about tone. They move to a quieter second rail, and
// the three curated axes that were footer-only (Ämnen, Trådar, Tänkare) come up
// into the first.

/** Tier 1 — what the publication IS. */
export const MAST_SECTION_LINKS: NavLink[] = [
	pages.essaer,
	pages.amnen,
	pages.tradar,
	pages.tankare,
	pages.pillars,
	pages.svar,
];

/** Tier 2 — what it DOES for you. Errands, not reading. */
export const MAST_UTILITY_LINKS: NavLink[] = [
	pages.prayerTimes,
	pages.mosques,
	pages.app,
	pages.podcast,
];

export const PALETTE_READ_LINKS: PaletteNavLink[] = [
	{ href: pages.pillars.href, label: pages.pillars.label, sub: pages.pillars.menuSub },
	{ href: pages.svar.href, label: pages.svar.label, sub: pages.svar.menuSub },
	{
		href: pages.fordjupning.href,
		label: pages.fordjupning.label,
		sub: pages.fordjupning.menuSub,
	},
	pages.essaer,
	{ href: pages.amnen.href, label: pages.amnen.label, sub: pages.amnen.menuSub },
];

export const PALETTE_TOOL_LINKS: PaletteNavLink[] = [
	{ href: pages.prayerTimes.href, label: pages.prayerTimes.label, sub: pages.prayerTimes.menuSub },
	{ href: pages.mosques.href, label: pages.mosques.label, sub: pages.mosques.menuSub },
	{ href: pages.app.href, label: pages.app.label, sub: pages.app.menuSub },
	{ href: pages.podcast.href, label: pages.podcast.label, sub: pages.podcast.menuSub },
];

export const PALETTE_MINOR_LINKS: NavLink[] = [
	pages.calendar,
	pages.about,
	pages.editorial,
	pages.ai,
	pages.corrections,
	pages.privacy,
];

export const FOOTER_LINKS: NavLink[] = [
	pages.fordjupning,
	pages.amnen,
	pages.tradar,
	pages.tankare,
	{ href: pages.calendar.href, label: pages.calendar.footerLabel },
	pages.about,
	pages.editorial,
	pages.ai,
	pages.privacy,
];

export const STANDING_PALETTE_PAGES: PalettePageLink[] = [
	pages.essaer,
	pages.pillars,
	pages.svar,
	pages.fordjupning,
	pages.amnen,
	pages.tradar,
	pages.tankare,
	pages.calendar,
	pages.prayerTimes,
	pages.mosques,
	{ href: pages.app.href, label: pages.app.label, sub: pages.app.sub, alt: "Appen" },
	pages.podcast,
	pages.about,
	pages.ai,
	pages.home,
];
