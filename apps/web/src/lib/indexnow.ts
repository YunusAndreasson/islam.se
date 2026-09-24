// Which sitemap URLs to announce to IndexNow (Bing, Yandex, Seznam, Naver) after a
// deploy. Pure, so the selection rule is testable apart from the network call in
// scripts/indexnow.ts.

export const INDEXNOW_KEY = "9c785bb953da9f79992a4e3a103e3dfb";

export interface SitemapUrl {
	loc: string;
	lastmod?: string;
}

export interface IndexNowState {
	/** When the last successful submission was made (ISO). */
	lastPing: string;
	/** Every URL already announced, so a new page without a lastmod still goes out once. */
	seen: string[];
}

/** Pull `<loc>` + optional `<lastmod>` out of one urlset sitemap. */
export function parseSitemap(xml: string): SitemapUrl[] {
	const urls: SitemapUrl[] = [];
	for (const [, block] of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
		const loc = block?.match(/<loc>([^<]+)<\/loc>/)?.[1];
		if (!loc) continue;
		const lastmod = block?.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1];
		urls.push(lastmod ? { loc, lastmod } : { loc });
	}
	return urls;
}

// The bönetider pages and /nyheter/ take the build time as lastmod because they
// re-render daily. That is not an edit; announcing 2,100 unchanged pages every day is
// exactly the resubmission IndexNow asks sites not to do. /bonetider/metod/ has a real
// data date and stays in.
const CHURN = /^https:\/\/islam\.se\/(bonetider\/(?!metod\/)|nyheter\/)/;

/** URLs that are new since the last ping, or whose content changed after it. */
export function selectChanged(urls: SitemapUrl[], state: IndexNowState | null): string[] {
	const seen = new Set(state?.seen ?? []);
	const since = state ? Date.parse(state.lastPing) : Number.NEGATIVE_INFINITY;
	return urls
		.filter((u) => !CHURN.test(u.loc))
		.filter((u) => !seen.has(u.loc) || (u.lastmod !== undefined && Date.parse(u.lastmod) > since))
		.map((u) => u.loc);
}
