import { describe, expect, it } from "vitest";
import { SITE_URL, siteOrigin } from "./config";
import { articleMarkdown, type MarkdownArticle } from "./representations";

const ARTICLE = {
	slug: "en-essa",
	title: "En essä",
	description: "Essäns ingress.",
	publishedAt: "2026-01-02T00:00:00Z",
	updatedAt: "2026-03-04T00:00:00Z",
	body: "Själva **texten**.\n",
} satisfies MarkdownArticle;

describe("siteOrigin", () => {
	it("uses the configured origin and removes only its trailing slash", () => {
		expect(siteOrigin()).toBe(SITE_URL);
		expect(siteOrigin(new URL("https://preview.example/"))).toBe("https://preview.example");
	});
});

describe("articleMarkdown", () => {
	it("serializes the shared full-corpus representation", () => {
		expect(articleMarkdown(ARTICLE, { site: `${SITE_URL}/` })).toBe(
			"# En essä\n\n" +
				"> Essäns ingress.\n\n" +
				`*Källa: ${SITE_URL}/en-essa · Publicerad 2026-01-02 · Uppdaterad 2026-03-04*\n\n` +
				"Själva **texten**.",
		);
	});

	it("supports the linked source and divider used by per-essay routes", () => {
		const markdown = articleMarkdown(ARTICLE, {
			site: SITE_URL,
			linkedSource: true,
			bodyDivider: true,
		});

		expect(markdown).toContain(`*Källa: [islam.se](${SITE_URL}/en-essa)`);
		expect(markdown).toContain("\n\n---\n\nSjälva **texten**.");
	});
});
