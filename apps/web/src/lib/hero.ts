/** The homepage feature hero's responsive ladder. Shared by FeatureEssay (which
 *  renders the <Image>) and index.astro (which preloads the matching LCP candidate),
 *  so the preloaded `imagesrcset` always equals what the <picture> actually paints.
 *
 *  From 64rem the picture stands in two thirds of the front page's canvas, under the
 *  lead's words: 49.67rem (795px) once the window passes 79rem and the canvas is its
 *  full 76rem, two thirds of the window below that. In one column, under 64rem, it
 *  runs the window's width. */
export const FEATURE_HERO_SIZES = "(min-width: 79rem) 49.67rem, (min-width: 64rem) 66vw, 100vw";

/** Candidates for the ladder above: the painted widths at the common windows, plus
 *  the 2× retina steps. 800 is the desktop column at 1×, 1600 the same at 2×. Astro
 *  clamps every candidate to the source's intrinsic width, so the top of this list
 *  only starts paying off once the art is re-exported larger. */
export const FEATURE_HERO_WIDTHS = [480, 640, 800, 976, 1216, 1600, 2048];

/* ---------------------------------------------------------------------------
   The other two ladders. `widths` is what actually generates files, so it is
   shared; `sizes` stays at the call site, because the painted box genuinely
   differs per layout (a 14rem FAKTA card is not an 18rem recent card).

   ⚠️ Nothing above 1672 belongs in any ladder here: every hero source in
   src/assets/images is 750–1672px wide, so Astro clamps a larger candidate and
   it costs a build step for no extra pixels.
   --------------------------------------------------------------------------- */

/** In-page hero (essay, /svar/, /fordjupning/). Measured painted width, not
 *  assumed: 350px @390vp, ~728 @768, ~852 @900, then a hard 976 from ~1072 up —
 *  61rem, the 64rem canvas minus its padding.
 *  ⚠️ `64rem` here is a LIE and was in all three routes: it declares 1024 for a
 *  box that never exceeds 976, so tablets over-select a candidate. */
export const PAGE_HERO_SIZES = "(min-width: 67rem) 61rem, 100vw";

/** 1× and retina steps of the widths above, capped at the source's own 1672. */
export const PAGE_HERO_WIDTHS = [768, 1024, 1456, 1672];

/** Card thumbnails — archive rows, FAKTA cards, recent, the app shots. Painted
 *  ~192–320 on desktop and up to ~350 on a phone; these are its 1×/2×/3× steps. */
export const CARD_WIDTHS = [320, 640, 960];

/** The small art: podcast episode (6rem), the /svar/ index (120px) and the
 *  archive-row thumb — up to 16rem on the start page, hence the 512 (2×). */
export const CHIP_WIDTHS = [128, 256, 384, 512];

/** CardList (fördjupning, trådar). A one-column track on a tablet paints ~730px,
 *  so the 2× step needs the top of the ladder. */
export const CARD_LIST_WIDTHS = [320, 640, 960, 1280, 1600];
