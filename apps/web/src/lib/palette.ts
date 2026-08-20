import { getCollection } from "astro:content";
import { AMNEN } from "./amnen";
import { getArticles } from "./articles";
import { INDEXED_PLACES, officialPopulation } from "./bonetider/places-index";
import { FAKTA_SLUGS } from "./fakta";
import { STANDING_PALETTE_PAGES } from "./navigation";
// Folded here exactly as the client matcher folds it — a redundancy test below
// only means anything if both ends agree on what "the same text" is.
import { fold } from "./search-text";

// One flat, typed entry per navigable destination on the site. The command
// palette (SearchOverlay) is the sole navigation surface now that the mast is
// wordmark-only, so this index must cover *everything* a reader can reach:
// the standing pages, the three browse axes (ämnen/trådar/tänkare), and every
// essay. Built once at build time and serialized into an inline JSON island.
type PaletteType = "Sida" | "Svar" | "Ort" | "Ämne" | "Tråd" | "Tänkare" | "Essä";

export interface PaletteEntry {
	type: PaletteType;
	/** What the reader matches against and what the row/chip shows. */
	label: string;
	/** A one-line gloss — framing prose or the essay lead; also searched. */
	sub: string;
	/** A cornerstone answer. Breaks score ties toward the canonical page, so
	    "ramadan" opens "Vad är ramadan?" and not "Måste gravida fasta?". */
	core?: true;
	/** Extra wording matched but never shown. Answer pages carry the question in
	    the reader's own words here, so typing the query the page was written for
	    ("får muslimer dricka alkohol") finds it even when the title is phrased
	    differently. */
	alt?: string;
	href: string;
	/** Tänkare only: which tradition the thinker belongs to, so the palette can
	    list the classical Islamic scholars apart from the Swedish/Western voices
	    instead of interleaving the two — the same division the /tankare directory
	    draws. */
	group?: "sunni" | "western";
}

/** How many localities ride along in the index. The largest few cover the queries people
 *  actually type, and the rest stay one click away via the hub. NOTE: the cap was set when
 *  this index was inlined into every document; it is now fetched once from
 *  /search-index.json, so raising it costs one page's worth of nothing. */
const PLACE_ENTRIES = 30;

export async function buildPaletteIndex(): Promise<PaletteEntry[]> {
	const [tradar, tankare, svar, articles] = await Promise.all([
		getCollection("tradar"),
		getCollection("tankare"),
		getCollection("svar"),
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
		href: `/tradar/${t.id}/`,
	}));

	const tankareEntries: PaletteEntry[] = tankare.map((t) => ({
		type: "Tänkare",
		label: t.data.name,
		sub: t.data.framing,
		href: `/tankare/${t.data.slug}/`,
		group: t.data.tradition,
	}));

	// The whole FRÅGOR & SVAR corpus, cornerstone FAKTA pages included: these are
	// the site's most-searched destinations, so a reader typing "halal" or "tawhid"
	// must reach the answer rather than "Inga träffar". The index is inlined into
	// every page, so `question` is carried only when it isn't already spelled out
	// in the title or the gloss — for most answers the title opens with the
	// question verbatim, and repeating it would be pure payload.
	const svarEntries: PaletteEntry[] = svar.map((s) => {
		const { title, description, question } = s.data;
		const covered = fold(`${title} ${description}`).includes(fold(question));
		return {
			type: "Svar" as const,
			label: title,
			sub: description,
			...(covered ? {} : { alt: question }),
			...(FAKTA_SLUGS.has(s.id) ? { core: true as const } : {}),
			href: `/svar/${s.id}/`,
		};
	});

	// The prayer-time pages are the largest surface on the site — 2 128 localities
	// — and none of them were reachable from the palette: typing "malmö" returned
	// an essay that happens to mention it, while /bonetider/malmo/ stayed invisible.
	// The whole index cannot go in (it is inlined into every page), so the largest
	// PLACE_ENTRIES localities carry it. Everything below that is still reachable
	// from the /bonetider/ hub, which the "Bönetider" page entry opens.
	const orter: PaletteEntry[] = [...INDEXED_PLACES]
		.sort((a, b) => officialPopulation(b) - officialPopulation(a))
		.slice(0, PLACE_ENTRIES)
		.map((p) => ({
			type: "Ort" as const,
			label: `Bönetider i ${p.name}`,
			// The county disambiguates same-named localities and is what a reader
			// scanning the list actually needs; keep it terse — this ships on every page.
			sub: p.county ? `${p.name}, ${p.county}.` : `${p.name}.`,
			// So a bare "malmö" matches without the "Bönetider i " prefix in the way.
			alt: p.name,
			href: `/bonetider/${p.slug}/`,
		}));

	const essays: PaletteEntry[] = articles.map((a) => ({
		type: "Essä",
		label: a.title,
		sub: a.description,
		href: `/${a.slug}`,
	}));

	// Order mirrors the search group order (pages/structure first, essays last);
	// the browse view re-orders into sidor → ämnen → trådar → tänkare itself.
	return [
		...STANDING_PALETTE_PAGES.map((page) => ({ type: "Sida" as const, ...page })),
		...svarEntries,
		...orter,
		...amnen,
		...tradarEntries,
		...tankareEntries,
		...essays,
	];
}
