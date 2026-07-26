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
