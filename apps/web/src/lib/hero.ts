/** The homepage feature hero's responsive ladder. Shared by FeatureEssay (which
 *  renders the <Image>) and index.astro (which preloads the matching LCP candidate),
 *  so the preloaded `imagesrcset` always equals what the <picture> actually paints.
 *
 *  The hero is the one module that BLEEDS past the 64rem home canvas (see the
 *  signature-spread rules in FeatureEssay). Its painted width therefore steps at
 *  the same breakpoint the CSS does, and `sizes` has to say so — otherwise the
 *  browser picks a 976px candidate for a 1216px box and the cover of the site is
 *  the one soft image on it.
 *
 *    viewport            painted width
 *    ≥ 86rem (1376px)    76rem = 1216px   (the signature spread)
 *    ≥ 67rem (1072px)    61rem =  976px   (64rem canvas − 2 × 1.5rem padding)
 *    below               100vw − the canvas padding, i.e. ~100vw
 *
 *  Why the spread stops at 76rem when there is clearly room for more on a 1920
 *  monitor: the art itself. Every hero in src/assets/images is 1448–1672px on the
 *  long edge, so 1216 CSS px is already the widest box the source can fill at 1:1,
 *  and anything past it trades sharpness for size — worst on the retina laptops
 *  where the cover is most often seen. Widen this only after the heroes are
 *  re-exported at ~2400px. */
export const FEATURE_HERO_SIZES = "(min-width: 86rem) 76rem, (min-width: 67rem) 61rem, 100vw";

/** Candidates for the ladder above: each CSS width exactly, plus the 2× retina
 *  steps the smaller breakpoints ask for. Astro clamps every candidate to the
 *  source's intrinsic width, so the top of this list only starts paying off once
 *  the art is re-exported larger. */
export const FEATURE_HERO_WIDTHS = [480, 640, 768, 976, 1216, 1600, 2048];

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

/** The small square art: podcast episode (6rem) and the /svar/ index (120px). */
export const CHIP_WIDTHS = [128, 256, 384];
