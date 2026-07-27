import type { APIRoute } from "astro";
import { type OgInput, renderOg } from "./og";
import { ogCached } from "./og-cache";

// Every OG-card endpoint (essay, tänkare, tråd, bönetider hub + city) did the same
// three things: map its route props to an OG card, rasterise via renderOg(), and
// return the PNG with a year-long immutable cache. Only the mapping differs, so the
// handler + headers live here once; each page keeps its own getStaticPaths (the
// props shape is the page's contract) and passes just the card mapper.

const OG_HEADERS = {
	"Content-Type": "image/png",
	// Cards are content-hashed by the build and never change for a given URL.
	"Cache-Control": "public, max-age=31536000, immutable",
} as const;

/** Build the GET handler for an OG-card endpoint from a props→card mapper (async so
 *  the essay card can resize its hero photo).
 *
 *  `cacheKey` must be CHEAP and must name every input that changes the image — it is
 *  evaluated before the card is built, so the expensive work (the essay hero's
 *  attention-crop) is skipped on a hit. Omit it and the endpoint renders every build.
 *  The card layout itself is versioned by og-cache.ts, not by this key. */
export function ogEndpoint<P = Record<string, unknown>>(
	card: (props: P) => OgInput | Promise<OgInput>,
	cacheKey?: (props: P) => string,
): APIRoute {
	return async ({ props }) => {
		const p = props as P;
		const render = async () => renderOg(await card(p));
		const png = cacheKey ? await ogCached(cacheKey(p), render) : await render();
		return new Response(new Uint8Array(png), { headers: OG_HEADERS });
	};
}
