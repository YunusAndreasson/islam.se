// Small JSON-LD builders shared across pages. Base.astro accepts a single block
// or an array, so a page can pass e.g. [collectionPage, breadcrumbList(...)].

import { APP_STORE_URL, PLAY_STORE_URL } from "./app";
import { SITE_URL } from "./config";
import { withTrailingSlash } from "./path";
import { APPLE_PODCAST_URL, SPOTIFY_SHOW_URL } from "./podcast";

const SITE = SITE_URL;

/** Resolve a site path to its absolute, trailing-slash form — the way the static
 *  pages are actually served (Cloudflare 308s the slash-less form to it). Keeping
 *  every JSON-LD `url`/`item` byte-identical to the page's <link rel=canonical>
 *  means a crawler sees one URL per entity, not a canonical-vs-structured-data
 *  split. File endpoints (a dot in the last path segment) and URLs carrying a
 *  query/hash are returned untouched. */
function pageUrl(url: string): string {
	const abs = url.startsWith("http") ? url : `${SITE}${url}`;
	return abs.startsWith(SITE) ? withTrailingSlash(abs) : abs;
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

/** A schema.org ImageObject for a photograph set inside a text. Unlike the hero it is
 *  a block of its own, not the Article's `image`, and unlike the site's own art it is
 *  somebody else's picture: when it has a credit, the licence, the page that documents
 *  it and the name to credit are asserted. Those three are what an image search needs
 *  to show the licence beside the picture. */
export function figureImageObject(opts: {
	/** Absolute URL of the file the page's <img> points at. */
	contentUrl: string;
	/** The page the picture stands on (absolute URL). */
	url: string;
	name: string;
	caption?: string;
	width: number;
	height: number;
	credit?: {
		by: string;
		licence: string;
		licenceUrl: string;
		source: string;
		creator?: string;
	};
}): Record<string, unknown> {
	const credit = opts.credit;
	const maker = credit ? imageCreator(credit) : undefined;
	return {
		"@context": "https://schema.org",
		"@type": "ImageObject",
		contentUrl: opts.contentUrl,
		url: opts.url,
		name: opts.name,
		...(opts.caption ? { caption: opts.caption } : {}),
		width: opts.width,
		height: opts.height,
		...(credit
			? {
					creditText: credit.by,
					...(maker ? { creator: maker } : {}),
					copyrightNotice: copyrightNotice(
						credit.licence,
						credit.by.replace(/ \/ Wikimedia Commons$/, ""),
					),
					license: credit.licenceUrl,
					acquireLicensePage: credit.source,
				}
			: {}),
	};
}

// Search Console's image-metadata report (2026-11-04) flagged all 55 credited figures
// for a missing `creator` and `copyrightNotice`. Both come out of the credit we already
// keep: `by` reads »maker / where it is held«, so the maker is the part before the
// slash unless the registry names one, and a host on its own is no maker at all.
const INSTITUTION =
	/librar|museum|museet|museer|collections|gallery|society|heritage|department|press\b|bibliot/i;

function imageCreator(credit: {
	by: string;
	creator?: string;
}): { "@type": "Person" | "Organization"; name: string } | undefined {
	const name = (credit.creator ?? credit.by.split(" / ")[0] ?? "").trim();
	if (!name || name === "Wikimedia Commons") return undefined;
	return { "@type": INSTITUTION.test(name) ? "Organization" : "Person", name };
}

/** »Public domain« and »CC0« waive the copyright, so the notice says so and names nobody;
 *  under every other licence the holder is the credit line, not the maker alone: an 1880
 *  photograph by Sadiq Bey is licensed by the collection that reproduced it. The host
 *  that only carries the file is left out. */
function copyrightNotice(licence: string, holder: string): string {
	return /^(public domain|cc0)/i.test(licence) ? licence : `© ${holder}, ${licence}`;
}

export interface Crumb {
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
	/** Bönetider place slug — becomes the stable `@id`. Pass the SAME slug from
	 *  /bonetider/[stad] and /moskeer/[stad] so the two pages describe one City entity
	 *  instead of two anonymous nodes Google has to guess are the same town. */
	slug?: string;
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
		...(opts.slug ? { "@id": `${SITE}/bonetider/${opts.slug}/#city` } : {}),
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

/** A schema.org WebPage, or one of the subtypes the site uses, for a page that is not an
 *  Article. Its `url` goes through pageUrl like every other node's, so it is the page's
 *  canonical byte for byte: twelve pages wrote this node by hand, three of them without
 *  the trailing slash, and six without `isPartOf`. Pass `extra` for what is the page's
 *  own (`about`, `mainEntity`, `dateModified`). */
export function webPageJsonLd(opts: {
	type?: "WebPage" | "AboutPage" | "CollectionPage";
	name: string;
	/** Path or absolute URL of the page. */
	url: string;
	description?: string;
	extra?: Record<string, unknown>;
}): Record<string, unknown> {
	return {
		"@context": "https://schema.org",
		"@type": opts.type ?? "WebPage",
		name: opts.name,
		...(opts.description === undefined ? {} : { description: opts.description }),
		url: pageUrl(opts.url),
		inLanguage: "sv",
		isPartOf: { "@id": WEBSITE_ID },
		...opts.extra,
	};
}

/** A schema.org CollectionPage whose `hasPart` lists its members — the ämne, series and
 *  tänkare pages, and the indexes of answers and fördjupningar. Essays are passed by slug
 *  (an essay lives at /<slug>/); anything else by its own path in `parts`. With no
 *  members there is no `hasPart`, rather than an empty one. */
export function collectionPageJsonLd(opts: {
	name: string;
	description: string;
	/** Path or absolute URL of the collection page. */
	url: string;
	essays?: readonly { title: string; slug: string }[];
	parts?: readonly { title: string; url: string }[];
	extra?: Record<string, unknown>;
}): Record<string, unknown> {
	const members = [
		...(opts.essays ?? []).map((e) => ({ title: e.title, url: `/${e.slug}` })),
		...(opts.parts ?? []),
	];
	return webPageJsonLd({
		type: "CollectionPage",
		name: opts.name,
		description: opts.description,
		url: opts.url,
		extra: {
			...opts.extra,
			...(members.length === 0
				? {}
				: {
						hasPart: members.map((m) => ({
							"@type": "Article",
							headline: m.title,
							url: pageUrl(m.url),
						})),
					}),
		},
	});
}

/** A schema.org FAQPage from {q,a} pairs — every page with a "Vanliga frågor"
 *  block emits one. Pairs with the `.def-list` block that renders the same pairs
 *  on the page. Don't rebuild it inline; a drifted key silently loses the rich
 *  result. */
export function faqPageJsonLd(faqs: readonly { q: string; a: string }[]): Record<string, unknown> {
	return {
		"@context": "https://schema.org",
		"@type": "FAQPage",
		mainEntity: faqs.map((f) => ({
			"@type": "Question",
			name: f.q,
			acceptedAnswer: { "@type": "Answer", text: f.a },
		})),
	};
}

/** The common schema.org Article contract shared by essays, answers, pillar pages
 *  and the Fakta hub. Page-specific facts (`about`, `image`, `wordCount`) remain
 *  optional inputs; authorship, canonical URLs and editorial standards cannot drift. */
export function articleJsonLd(opts: {
	headline: string;
	description: string;
	url: string;
	publishedAt: string;
	updatedAt?: string;
	wordCount?: number;
	image?: string | Record<string, unknown>;
	about?: Record<string, unknown>;
	citations?: readonly { name: string; url?: string | undefined }[];
}): Record<string, unknown> {
	const url = pageUrl(opts.url);
	return {
		"@context": "https://schema.org",
		"@type": "Article",
		headline: opts.headline,
		description: opts.description,
		datePublished: opts.publishedAt,
		dateModified: opts.updatedAt ?? opts.publishedAt,
		...(opts.wordCount === undefined ? {} : { wordCount: opts.wordCount }),
		inLanguage: "sv",
		url,
		mainEntityOfPage: url,
		isPartOf: { "@id": WEBSITE_ID },
		publishingPrinciples: `${SITE}/om/redaktion/`,
		...(opts.image === undefined ? {} : { image: opts.image }),
		author: { "@id": ORG_ID },
		publisher: { "@id": ORG_ID },
		...(opts.about === undefined ? {} : { about: opts.about }),
		...(opts.citations && opts.citations.length > 0
			? {
					citation: opts.citations.map((citation) => ({
						"@type": "CreativeWork",
						name: citation.name,
						...(citation.url === undefined ? {} : { url: citation.url }),
					})),
				}
			: {}),
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
		// The site's subjects as the site states them (AGENTS.md): a neutral sufi or shia
		// entry in a list like this reads as a subject taught on equal terms, so none stands here.
		knowsAbout: [
			"Islam",
			"Islamisk teologi",
			"Koranen",
			"Islamisk filosofi",
			"Svensk litteratur",
			"Den islamiska kalendern",
			"Bönetider",
		],
		founder: {
			"@type": "Person",
			name: "Bilal",
			url: "https://bilal.se",
			description: "Grundare av islam.se.",
		},
		sameAs: ORG_SAME_AS,
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
