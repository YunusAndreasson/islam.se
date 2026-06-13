// Small JSON-LD builders shared across pages. Base.astro accepts a single block
// or an array, so a page can pass e.g. [collectionPage, breadcrumbList(...)].

const SITE = "https://islam.se";

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
			item: c.url.startsWith("http") ? c.url : `${SITE}${c.url}`,
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
		url: opts.url.startsWith("http") ? opts.url : `${SITE}${opts.url}`,
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
		url: opts.url.startsWith("http") ? opts.url : `${SITE}${opts.url}`,
		inLanguage: "sv",
		...opts.extra,
		hasPart: opts.essays.map((e) => ({
			"@type": "Article",
			headline: e.title,
			url: `${SITE}/${e.slug}`,
		})),
	};
}
