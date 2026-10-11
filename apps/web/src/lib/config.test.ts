import { describe, expect, it } from "vitest";
import { absoluteSiteLinks } from "./config";

describe("absoluteSiteLinks", () => {
	// One essay refers to another with »[Titel](/slug/)«. On the site that link works; in a
	// feed reader it has nothing to resolve against and leads nowhere.
	it("spells out a link to another page of the site", () => {
		expect(
			absoluteSiteLinks(
				'<p>Essän ”<a href="/ater-ni-var-for-sig/">Äter ni var för sig?</a>” har visat det.</p>',
				"https://islam.se",
			),
			"a site-relative link in feed content must carry the origin",
		).toBe(
			'<p>Essän ”<a href="https://islam.se/ater-ni-var-for-sig/">Äter ni var för sig?</a>” har visat det.</p>',
		);
	});

	it("leaves outside links, protocol-relative links and note anchors as they are", () => {
		const html =
			'<a href="https://www.svt.se/kultur/x">SVT</a> <a href="//cdn.example/x">x</a> <a id="fnref-1" href="#fn-1">1</a>';
		expect(absoluteSiteLinks(html, "https://islam.se")).toBe(html);
	});
});
