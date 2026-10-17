// Podcast directory identities — the single source of truth for the show's public
// listings. Used both for the in-page subscribe links (FloatingPlayer, BookPod) and
// for Organization `sameAs` in the JSON-LD entity graph: verified owned profiles
// across independent platforms are the strongest 2026 AI-citation signal (entity
// consensus). Kept dependency-free so any component or lib can import it.

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
