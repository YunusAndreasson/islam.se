import { describe, expect, it } from "vitest";
import { parseSitemap, selectChanged } from "./indexnow";

const XML = `<urlset>
<url><loc>https://islam.se/guds-vagar/</loc><lastmod>2026-09-23T20:44:02.112Z</lastmod></url>
<url><loc>https://islam.se/om/</loc></url>
<url><loc>https://islam.se/bonetider/stockholm/</loc><lastmod>2026-09-24T00:00:00.000Z</lastmod></url>
<url><loc>https://islam.se/bonetider/metod/</loc><lastmod>2026-06-27T00:00:00.000Z</lastmod></url>
<url><loc>https://islam.se/nyheter/</loc><lastmod>2026-09-24T00:00:00.000Z</lastmod></url>
</urlset>`;

describe("indexnow selection", () => {
	const urls = parseSitemap(XML);

	it("parses loc and optional lastmod", () => {
		expect(urls).toHaveLength(5);
		expect(urls[1]).toEqual({ loc: "https://islam.se/om/" });
	});

	it("first run announces everything except the daily-churn pages", () => {
		// The city pages and /nyheter/ get a fresh build-time lastmod every day; pinging
		// them would resubmit ~2,100 unchanged URLs daily.
		expect(selectChanged(urls, null)).toEqual([
			"https://islam.se/guds-vagar/",
			"https://islam.se/om/",
			"https://islam.se/bonetider/metod/",
		]);
	});

	it("later runs announce only edits after the last ping and never-seen URLs", () => {
		const state = {
			lastPing: "2026-09-01T00:00:00.000Z",
			seen: [
				"https://islam.se/guds-vagar/",
				"https://islam.se/om/",
				"https://islam.se/bonetider/metod/",
			],
		};
		expect(selectChanged(urls, state)).toEqual(["https://islam.se/guds-vagar/"]);
		expect(selectChanged([...urls, { loc: "https://islam.se/svar/ny/" }], state)).toContain(
			"https://islam.se/svar/ny/",
		);
	});
});
