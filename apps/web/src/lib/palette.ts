import { getCollection } from "astro:content";
import { AMNEN } from "./amnen";
import { getArticles } from "./articles";

// One flat, typed entry per navigable destination on the site. The command
// palette (SearchOverlay) is the sole navigation surface now that the mast is
// wordmark-only, so this index must cover *everything* a reader can reach:
// the standing pages, the three browse axes (ämnen/trådar/tänkare), and every
// essay. Built once at build time and serialized into an inline JSON island.
export type PaletteType = "Sida" | "Ämne" | "Tråd" | "Tänkare" | "Essä";

export interface PaletteEntry {
	type: PaletteType;
	/** What the reader matches against and what the row/chip shows. */
	label: string;
	/** A one-line gloss — framing prose or the essay lead; also searched. */
	sub: string;
	href: string;
	/** Tänkare only: which tradition the thinker belongs to, so the palette can
	    list the classical Islamic scholars apart from the Swedish/Western voices
	    instead of interleaving the two — the same division the /tankare directory
	    draws. */
	group?: "sunni" | "western";
}

// Standing destinations: the old mast links plus the two collection indexes.
// Trådar/Tänkare appear here so a literal "trådar" query finds the index page,
// even though the browse view lists their members under their own headings.
const PAGES: PaletteEntry[] = [
	{ type: "Sida", label: "Essäer", sub: "Hela arkivet, ordnat efter ämne.", href: "/essaer" },
	{ type: "Sida", label: "Trådar", sub: "Kuraterade läsningar genom essäerna.", href: "/tradar" },
	{ type: "Sida", label: "Tänkare", sub: "De röster essäerna återvänder till.", href: "/tankare" },
	{
		type: "Sida",
		label: "Det islamiska året",
		sub: "Islamiska högtider och fastedagar med datum.",
		href: "/det-islamiska-aret",
	},
	{
		type: "Sida",
		label: "Bönetider",
		sub: "Bönetider för hela Sverige, ort för ort, efter solens läge.",
		href: "/bonetider/",
	},
	{ type: "Sida", label: "Om", sub: "Om idén bakom islam.se.", href: "/om" },
	{ type: "Sida", label: "AI", sub: "Koppla hela arkivet till din AI-assistent.", href: "/ai" },
	{ type: "Sida", label: "Hem", sub: "Startsidan.", href: "/" },
];

export async function buildPaletteIndex(): Promise<PaletteEntry[]> {
	const [tradar, tankare, articles] = await Promise.all([
		getCollection("tradar"),
		getCollection("tankare"),
		getArticles(),
	]);

	const amnen: PaletteEntry[] = AMNEN.map((a) => ({
		type: "Ämne",
		label: a.name,
		sub: a.framing,
		href: `/amnen/${a.slug}`,
	}));

	const tradarEntries: PaletteEntry[] = tradar.map((t) => ({
		type: "Tråd",
		label: t.data.title,
		sub: t.data.framing,
		href: `/tradar/${t.id}`,
	}));

	const tankareEntries: PaletteEntry[] = tankare.map((t) => ({
		type: "Tänkare",
		label: t.data.name,
		sub: t.data.framing,
		href: `/tankare/${t.data.slug}`,
		group: t.data.tradition,
	}));

	const essays: PaletteEntry[] = articles.map((a) => ({
		type: "Essä",
		label: a.title,
		sub: a.description,
		href: `/${a.slug}`,
	}));

	// Order mirrors the search group order (pages/structure first, essays last);
	// the browse view re-orders into ämnen → trådar → tänkare → sidor itself.
	return [...PAGES, ...amnen, ...tradarEntries, ...tankareEntries, ...essays];
}
