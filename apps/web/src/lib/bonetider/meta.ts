// Shared bönetider metadata constants. Kept dependency-free so astro.config.ts can
// import the data date for sitemap <lastmod> without pulling in the whole place graph.

/** The date the bönetider place dataset / page content was last materially updated.
 *  Bump when regenerating places.ts (scripts/enrich-places-scb.py) or reworking the
 *  city-page template. Used for JSON-LD `dateModified` and sitemap `lastmod`. */
export const BONETIDER_DATA_DATE = "2026-06-27";

/** Official population source, reused in prose, JSON-LD and attribution. */
export const SCB_SOURCE = "SCB, Statistiska tätorter 2023";
export const SCB_REF = "referensår 31 december 2023";
export const SCB_POP_YEAR = 2023;
