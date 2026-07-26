// The canonical production origin, in one place. Imported wherever an absolute
// URL is built (JSON-LD @ids, the podcast feed, the moskeer permalinks) so the
// domain is never hand-typed in more than this file.
export const SITE_URL = "https://islam.se";

/** Feature gate for the Moskéer section (the map, the 127 city pages and the 21
 *  county pages).
 *
 *  Off means genuinely absent, not merely unlinked: no entry in the mast, the
 *  homepage doorways, the footer or the command palette; no city or county pages
 *  emitted; nothing in the sitemap. Turning it back on is this one boolean.
 *
 *  Safe to flip either way today — the section has never been deployed
 *  (islam.se/moskeer is a 404 in production), so nothing is indexed and no URL
 *  breaks when it disappears. That will stop being true the moment it ships once;
 *  after that, switching it off strands live URLs and needs redirects instead.
 *
 *  The two dynamic routes gate themselves (`getStaticPaths` returns []), but the
 *  hub is a plain non-dynamic route and a static build has no way to skip emitting
 *  one. So the hub is un-routed by filename instead: it lives at
 *  `src/pages/_moskeer.astro`, and Astro ignores `_`-prefixed files under
 *  `src/pages`. Turning the section back on therefore means BOTH flipping this
 *  boolean and renaming that file back to `moskeer.astro`. */
export const MOSKEER_ENABLED = false;
