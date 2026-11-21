// Podcast directory identities — the single source of truth for the show's public
// listings. Used both for the in-page subscribe links (FloatingPlayer, BookPod) and
// for Organization `sameAs` in the JSON-LD entity graph: verified owned profiles
// across independent platforms are the strongest 2026 AI-citation signal (entity
// consensus). Kept dependency-free so any component or lib can import it.

import EPISODES from "../data/podcast-episodes.json";

/** Apple Podcasts canonical show URL (Swedish storefront). Resolved + verified 200
 *  from the historical `apple.co/48s9hK6` smart link, tracking params stripped. */
export const APPLE_PODCAST_URL =
	"https://podcasts.apple.com/se/podcast/islam-se-andliga-essäer/id1890751890";

/** Spotify show URL. */
export const SPOTIFY_SHOW_URL = "https://open.spotify.com/show/2WgLxCwy5RFu07sEgHHfI4";

/** The show's public identity — one source of truth shared by the RSS feed
 *  (podcast.xml.ts) and the /podcast landing page, so the title/description/cover
 *  never drift between the two. */
// Matches the cover art, which has always read »islam.se · Essäer, inlästa«. The show
// was »islam.se: andliga essäer« until 2026-09-27; »andliga« read as devotional
// literature rather than a publication (user decision). Apple's URL slug still says
// »andliga-essäer«, which is harmless: the show is addressed by its id.
export const PODCAST_TITLE = "islam.se: essäer, inlästa";
export const PODCAST_DESCRIPTION =
	"Lyssna på essäerna från islam.se om tro, samvete och samhälle. Texterna tar sin utgångspunkt i islamisk tradition och svensk litteratur.";
/** Square cover art (3000×3000), served from public/. */
export const PODCAST_COVER = "/podcast-cover.jpg";
/** The RSS feed every podcast app subscribes to. */
export const PODCAST_FEED = "/podcast.xml";

/** An episode's show notes: the essay's summary, then a link to the essay itself.
 *  Spotify shows the description and nothing else from the item: it never surfaces
 *  `<link>`, so before 2026-11-21 a Spotify listener had no way from an episode to the
 *  text, its sources or the site. The URL is also the link text, so an app that strips
 *  tags still prints an address a listener can type. Returned as HTML, to go inside
 *  the feed's CDATA; `&`, `<` and `"` in the summary are escaped for that. */
export function episodeShowNotes(summary: string, essayUrl: string): string {
	const html = (text: string) =>
		text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
	return `<p>${html(summary)}</p><p>Läs essän på islam.se: <a href="${html(essayUrl)}">${html(essayUrl)}</a></p>`;
}

/** Where one essay's recording sits in Apple Podcasts and Spotify. */
export interface EpisodeLinks {
	apple: string;
	spotify: string;
}

/** The essay's own episode in each directory, so »Spotify« under an essay opens that
 *  reading rather than the show's front page. src/data/podcast-episodes.json holds
 *  them, keyed by slug, which is also the feed's <guid>. Apple's come from its public
 *  lookup (itunes.apple.com/lookup?id=1890751890&entity=podcastEpisode). Spotify has no
 *  public lookup, so its ids are read off the show page. An episode the directories have
 *  not listed yet, or that nobody has added here, falls back to the show. */
export function episodeLinks(slug: string): EpisodeLinks {
	const episode = (EPISODES as Record<string, Partial<EpisodeLinks>>)[slug];
	return {
		apple: episode?.apple ?? APPLE_PODCAST_URL,
		spotify: episode?.spotify ?? SPOTIFY_SHOW_URL,
	};
}
