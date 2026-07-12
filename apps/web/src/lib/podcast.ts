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
export const PODCAST_TITLE = "islam.se: andliga essäer";
export const PODCAST_DESCRIPTION =
	"Svenskan bär sina djupaste begrepp i sammansatta ord. Samvete – sam och vete – betyder att veta tillsammans med någon; ansvar, att svara inför någon. Orden förutsätter en motpart. Fjorton hundra år av islamiskt tänkande har känt den ensamheten – men aldrig förlorat motparten. Här får samtalet en svensk röst.";
/** Square cover art (3000×3000), served from public/. */
export const PODCAST_COVER = "/podcast-cover.jpg";
/** The RSS feed every podcast app subscribes to. */
export const PODCAST_FEED = "/podcast.xml";
