/** The homepage feature hero's responsive ladder. Shared by FeatureEssay (which
 *  renders the <Image>) and index.astro (which preloads the matching LCP candidate),
 *  so the preloaded `imagesrcset` always equals what the <picture> actually paints. */
export const FEATURE_HERO_WIDTHS = [480, 640, 768, 1024, 1280, 1600, 2048];
export const FEATURE_HERO_SIZES = "(max-width: 1024px) 100vw, 1024px";
