import { describe, expect, it } from "vitest";
import { SITE_URL } from "./config";
import { articleJsonLd, ORG_ID, WEBSITE_ID } from "./jsonld";

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
