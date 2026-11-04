import { describe, expect, it } from "vitest";
import { SITE_URL } from "./config";
import {
	articleJsonLd,
	collectionPageJsonLd,
	figureImageObject,
	ORG_ID,
	WEBSITE_ID,
	webPageJsonLd,
} from "./jsonld";

describe("articleJsonLd", () => {
	it("keeps the shared Article identity and canonical URL in one contract", () => {
		expect(
			articleJsonLd({
				headline: "En rubrik",
				description: "En beskrivning",
				url: "/svar/ett-svar",
				publishedAt: "2026-01-02T00:00:00Z",
			}),
		).toMatchObject({
			"@context": "https://schema.org",
			"@type": "Article",
			headline: "En rubrik",
			datePublished: "2026-01-02T00:00:00Z",
			dateModified: "2026-01-02T00:00:00Z",
			inLanguage: "sv",
			url: `${SITE_URL}/svar/ett-svar/`,
			mainEntityOfPage: `${SITE_URL}/svar/ett-svar/`,
			isPartOf: { "@id": WEBSITE_ID },
			publishingPrinciples: `${SITE_URL}/om/redaktion/`,
			author: { "@id": ORG_ID },
			publisher: { "@id": ORG_ID },
		});
	});

	it("adds only the page-specific Article facts supplied by the caller", () => {
		const image = { "@type": "ImageObject", contentUrl: `${SITE_URL}/bild.webp` };
		const about = { "@type": "Thing", name: "Islam" };
		const result = articleJsonLd({
			headline: "En rubrik",
			description: "En beskrivning",
			url: `${SITE_URL}/essa/`,
			publishedAt: "2026-01-02T00:00:00Z",
			updatedAt: "2026-03-04T00:00:00Z",
			wordCount: 1200,
			image,
			about,
			citations: [{ name: "Koranen" }, { name: "En bok", url: "https://example.com" }],
		});

		expect(result).toMatchObject({
			dateModified: "2026-03-04T00:00:00Z",
			wordCount: 1200,
			image,
			about,
			citation: [
				{ "@type": "CreativeWork", name: "Koranen" },
				{ "@type": "CreativeWork", name: "En bok", url: "https://example.com" },
			],
		});
	});
});

describe("figureImageObject", () => {
	const figure = {
		contentUrl: `${SITE_URL}/_astro/kaba.webp`,
		url: `${SITE_URL}/fordjupning/kaba/`,
		name: "Kaba klädd i mörkt tyg.",
		width: 1400,
		height: 1074,
	};

	it("asserts licence, source page and credit for a picture that is somebody else's", () => {
		expect(
			figureImageObject({
				...figure,
				caption: "Kaba 1880.",
				credit: {
					by: "Adli Wahid / Wikimedia Commons",
					licence: "CC BY-SA 4.0",
					licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
					source: "https://commons.wikimedia.org/wiki/File:The_Kaaba_during_Hajj.jpg",
				},
			}),
		).toMatchObject({
			"@context": "https://schema.org",
			"@type": "ImageObject",
			contentUrl: figure.contentUrl,
			caption: "Kaba 1880.",
			creditText: "Adli Wahid / Wikimedia Commons",
			creator: { "@type": "Person", name: "Adli Wahid" },
			copyrightNotice: "© Adli Wahid, CC BY-SA 4.0",
			license: "https://creativecommons.org/licenses/by-sa/4.0/",
			acquireLicensePage: "https://commons.wikimedia.org/wiki/File:The_Kaaba_during_Hajj.jpg",
		});
	});

	// Search Console (2026-11-04) flagged every credited figure for a missing `creator`
	// and `copyrightNotice`. These pin the three ways a credit names its maker.
	const credit = (by: string, licence: string, creator?: string) => ({
		by,
		licence,
		licenceUrl: "https://creativecommons.org/publicdomain/mark/1.0/",
		source: "https://commons.wikimedia.org/wiki/File:X.jpg",
		...(creator ? { creator } : {}),
	});

	it("names a holding institution as an Organization and claims no copyright for the public domain", () => {
		const block = figureImageObject({
			...figure,
			credit: credit("Österreichische Nationalbibliothek, Wien", "Public domain"),
		});
		expect(block.creator, "an institution credited as maker must not be typed Person").toEqual({
			"@type": "Organization",
			name: "Österreichische Nationalbibliothek, Wien",
		});
		expect(block.copyrightNotice, "a public-domain picture has no © holder").toBe("Public domain");
	});

	it("takes the registry's creator over the credit line when the line names a collection first", () => {
		const block = figureImageObject({
			...figure,
			credit: credit(
				"Röhsska museet, foto Carl Ander / Wikimedia Commons",
				"CC BY 4.0",
				"Carl Ander",
			),
		});
		expect(block.creator).toEqual({ "@type": "Person", name: "Carl Ander" });
		expect(
			block.copyrightNotice,
			"the notice names the credited holder, not the photographer alone",
		).toBe("© Röhsska museet, foto Carl Ander, CC BY 4.0");
	});

	it("names no creator when the credit is only the host that carries the file", () => {
		const block = figureImageObject({ ...figure, credit: credit("Wikimedia Commons", "CC0") });
		expect(block, "Wikimedia Commons hosts the file; it did not make it").not.toHaveProperty(
			"creator",
		);
		expect(block.copyrightNotice).toBe("CC0");
	});

	// A licence asserted for a picture with no recorded credit would be a claim the
	// site cannot back: the fields are absent, not empty.
	it("asserts nothing about rights when the picture has no recorded credit", () => {
		const block = figureImageObject(figure);
		expect(block).not.toHaveProperty("license");
		expect(block).not.toHaveProperty("creditText");
		expect(block).not.toHaveProperty("creator");
		expect(block).not.toHaveProperty("copyrightNotice");
		expect(block).not.toHaveProperty("caption");
	});
});

describe("webPageJsonLd", () => {
	it("states the page's url as its canonical, with the trailing slash", () => {
		// Three hand-written nodes said https://islam.se/om while the canonical said
		// https://islam.se/om/: one entity under two URLs for a crawler.
		const node = webPageJsonLd({ type: "AboutPage", name: "Om islam.se", url: "/om" });
		expect(node.url).toBe(`${SITE_URL}/om/`);
		expect(node.isPartOf, "every page belongs to the one WebSite node").toEqual({
			"@id": WEBSITE_ID,
		});
		expect(node["@type"]).toBe("AboutPage");
	});

	it("leaves out a description it was not given, and keeps the page's own facts", () => {
		const node = webPageJsonLd({
			name: "Appen",
			url: "/app",
			extra: { publisher: { "@id": ORG_ID } },
		});
		expect(node).not.toHaveProperty("description");
		expect(node.publisher).toEqual({ "@id": ORG_ID });
	});
});

describe("collectionPageJsonLd", () => {
	it("lists essays by slug and other members by their own path", () => {
		const node = collectionPageJsonLd({
			name: "Tro och lära",
			description: "…",
			url: "/vad-ar-islam/",
			essays: [{ title: "En essä", slug: "en-essa" }],
			parts: [{ title: "Ett svar", url: "/svar/ett-svar" }],
		});
		expect(node.hasPart).toEqual([
			{ "@type": "Article", headline: "En essä", url: `${SITE_URL}/en-essa/` },
			{ "@type": "Article", headline: "Ett svar", url: `${SITE_URL}/svar/ett-svar/` },
		]);
	});

	it("has no hasPart at all when the collection names no members", () => {
		// /nyheter/ declares its provenance, not its items, which are gone within a day;
		// an empty hasPart claimed a collection of nothing.
		const node = collectionPageJsonLd({ name: "Nyheter", description: "…", url: "/nyheter/" });
		expect(node).not.toHaveProperty("hasPart");
	});
});
