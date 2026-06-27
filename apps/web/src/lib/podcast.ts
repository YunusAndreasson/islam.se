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
