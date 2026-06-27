// Small JSON-LD builders shared across pages. Base.astro accepts a single block
// or an array, so a page can pass e.g. [collectionPage, breadcrumbList(...)].

import { APP_STORE_URL, PLAY_STORE_URL } from "./app";
import { APPLE_PODCAST_URL, SPOTIFY_SHOW_URL } from "./podcast";

const SITE = "https://islam.se";

/** Resolve a site path to its absolute, trailing-slash form — the way the static
 *  pages are actually served (Cloudflare 308s the slash-less form to it). Keeping
 *  every JSON-LD `url`/`item` byte-identical to the page's <link rel=canonical>
 *  means a crawler sees one URL per entity, not a canonical-vs-structured-data
 *  split. File endpoints (a dot in the last path segment) and URLs carrying a
 *  query/hash are returned untouched. */
function pageUrl(url: string): string {
	const abs = url.startsWith("http") ? url : `${SITE}${url}`;
	if (!abs.startsWith(SITE) || /[?#]/.test(abs)) return abs;
	const last = abs.split("/").pop() ?? "";
	if (last.includes(".")) return abs;
	return abs.endsWith("/") ? abs : `${abs}/`;
}

/** A schema.org ImageObject for an essay's hero image. Emitted as the Article's
 *  `image` so the clean illustration — not the text-laden OG share card — is the
 *  page's representative image for Google Images, carrying its own alt/caption and
 *  dimensions. Structured-data only; nothing here renders on the page. No author or
 *  licence is asserted — the imagery is not licensable stock or photography. */
export function imageObject(opts: {
	/** Absolute URL of the optimized hero rendition (the file Google should index). */
	contentUrl: string;
	/** The page the image represents (absolute URL). */
	url: string;
	/** Image-specific alt → ImageObject name. */
	name: string;
	/** Visible figcaption, when the essay has one. */
	caption?: string;
	width: number;
	height: number;
}): Record<string, unknown> {
	return {
		"@type": "ImageObject",
		contentUrl: opts.contentUrl,
		url: opts.url,
		name: opts.name,
		...(opts.caption ? { caption: opts.caption } : {}),
		width: opts.width,
		height: opts.height,
		representativeOfPage: true,
	};
}

interface Crumb {
	name: string;
	/** Path or absolute URL; bare paths are resolved against the site origin. */
	url: string;
}

/** A schema.org BreadcrumbList. Pass the trail in order, e.g.
 *  breadcrumbList([{ name: "Hem", url: "/" }, { name: "Tänkare", url: "/tankare" }, …]). */
export function breadcrumbList(items: Crumb[]): Record<string, unknown> {
	return {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: items.map((c, i) => ({
			"@type": "ListItem",
			position: i + 1,
			name: c.name,
			item: pageUrl(c.url),
		})),
	};
}

function administrativeArea(
	name: string,
	within?: Record<string, unknown>,
): Record<string, unknown> {
	return { "@type": "AdministrativeArea", name, ...(within ? { containedInPlace: within } : {}) };
}

/** A schema.org `City` for a /bonetider/[stad] page — geo, postal address, the
 *  kommun→län→Sverige containment chain, and (when we matched SCB) the official
 *  population as a PropertyValue. Used as a WebPage's `about`. */
export function cityPlace(opts: {
	name: string;
	county: string;
	lat: number;
	lon: number;
	kommun?: string;
	/** Official population (SCB tätort) — omitted when we only have a GeoNames estimate. */
	population?: number;
	/** Reference year for the population figure, e.g. 2023. */
	populationYear?: number;
}): Record<string, unknown> {
	const sweden = { "@type": "Country", name: "Sverige" };
	const lan = opts.county ? administrativeArea(opts.county, sweden) : sweden;
	const within = opts.kommun ? administrativeArea(opts.kommun, lan) : lan;
	const place: Record<string, unknown> = {
		"@type": "City",
		name: opts.name,
		address: {
			"@type": "PostalAddress",
			addressLocality: opts.name,
			...(opts.county ? { addressRegion: opts.county } : {}),
			addressCountry: "SE",
		},
		geo: { "@type": "GeoCoordinates", latitude: opts.lat, longitude: opts.lon },
		containedInPlace: within,
	};
	if (opts.population != null) {
		place.additionalProperty = {
			"@type": "PropertyValue",
			name: "befolkning",
			value: opts.population,
			...(opts.populationYear ? { observationDate: String(opts.populationYear) } : {}),
		};
	}
	return place;
}

/** A schema.org `Dataset` describing the bönetider place collection (for the hub),
 *  so the official-stats provenance is machine-readable. */
export function dataset(opts: {
	name: string;
	description: string;
	/** Path or absolute URL of the page that hosts the dataset. */
	url: string;
	license?: string;
	creator?: string[];
	spatialCoverage?: string;
}): Record<string, unknown> {
	return {
		"@context": "https://schema.org",
		"@type": "Dataset",
		name: opts.name,
		description: opts.description,
		url: pageUrl(opts.url),
		inLanguage: "sv",
		...(opts.license ? { license: opts.license } : {}),
		...(opts.spatialCoverage ? { spatialCoverage: opts.spatialCoverage } : {}),
		...(opts.creator
			? { creator: opts.creator.map((name) => ({ "@type": "Organization", name })) }
			: {}),
	};
}

/** A schema.org CollectionPage whose `hasPart` lists the member essays — shared by
 *  the ämne / tråd / tänkare `[slug]` pages, which built this block by hand. Pass
 *  `extra` to merge in page-specific properties (e.g. the tänkare page's `about`). */
export function collectionPageJsonLd(opts: {
	name: string;
	description: string;
	/** Path or absolute URL of the collection page. */
	url: string;
	essays: readonly { title: string; slug: string }[];
	extra?: Record<string, unknown>;
}): Record<string, unknown> {
	return {
		"@context": "https://schema.org",
		"@type": "CollectionPage",
		name: opts.name,
		description: opts.description,
		url: pageUrl(opts.url),
		inLanguage: "sv",
		isPartOf: { "@id": WEBSITE_ID },
		...opts.extra,
		hasPart: opts.essays.map((e) => ({
			"@type": "Article",
			headline: e.title,
			url: pageUrl(`/${e.slug}`),
		})),
	};
}

// ── Site entity graph ───────────────────────────────────────────────────────
// One canonical Organization + WebSite node, referenced by `@id` from every
// Article/AboutPage author/publisher instead of being re-declared inline. A
// single well-connected entity is the strongest 2026 AI-citation signal (entity
// authority): the shared `@id` lets LLMs and search engines merge every page's
// claims onto one node rather than treating each inline copy as a new entity.

export const ORG_ID = `${SITE}/#org`;
export const WEBSITE_ID = `${SITE}/#website`;

// Real, OWNED external profiles for islam.se — NOT the founders' personal sites
// (those live under `founder`). These flow into Organization `sameAs`, which
// strengthens entity grounding for AI citation and Knowledge-Panel eligibility:
// the App Store, Google Play, Apple Podcasts, and Spotify listings are all verified
// owned profiles of the brand, so an LLM sees the same entity vouched for across
// four independent platforms. TODO: add a Wikidata item / YouTube channel when they exist.
const ORG_SAME_AS: string[] = [APP_STORE_URL, PLAY_STORE_URL, APPLE_PODCAST_URL, SPOTIFY_SHOW_URL];

/** The canonical islam.se Organization node. Other schemas reference it via
 *  `{ "@id": ORG_ID }` instead of repeating name/logo/founder. */
export function organization(): Record<string, unknown> {
	return {
		"@context": "https://schema.org",
		"@type": "Organization",
		"@id": ORG_ID,
		name: "islam.se",
		url: SITE,
		// Registered and online since 2003 — a real longevity/authority signal.
		foundingDate: "2003",
		description:
			"Essäer om islamisk intellektuell tradition i dialog med svenskt och nordiskt kulturarv, byggda på primära arabiska källor och den svenska litterära kanon.",
		// The editorial-standards page (how essays are sourced, written, reviewed) —
		// Google's "How/Who/Why" E-E-A-T signal, linked from every Article too.
		publishingPrinciples: `${SITE}/om/redaktion/`,
		logo: {
			"@type": "ImageObject",
			"@id": `${SITE}/#logo`,
			url: `${SITE}/apple-touch-icon.png`,
			width: 180,
			height: 180,
		},
		knowsAbout: [
			"Islam",
			"Islamisk teologi",
			"Koranen",
			"Islamisk filosofi",
			"Sufism",
			"Svensk litteratur",
			"Den islamiska kalendern",
			"Bönetider",
		],
		founder: { "@type": "Person", name: "Bilal", url: "https://bilal.se", description: "Grundare av islam.se." },
		...(ORG_SAME_AS.length > 0 ? { sameAs: ORG_SAME_AS } : {}),
	};
}

/** The canonical WebSite node, published by the Organization. */
export function webSite(): Record<string, unknown> {
	return {
		"@context": "https://schema.org",
		"@type": "WebSite",
		"@id": WEBSITE_ID,
		url: SITE,
		name: "islam.se",
		description: "Essäer om islamisk intellektuell tradition och svenskt kulturarv.",
		inLanguage: "sv",
		publisher: { "@id": ORG_ID },
	};
}
