import type { APIRoute } from "astro";
import { type OgInput, renderOg } from "./og";

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
 *  the essay card can resize its hero photo). */
export function ogEndpoint<P = Record<string, unknown>>(
	card: (props: P) => OgInput | Promise<OgInput>,
): APIRoute {
	return async ({ props }) => {
		const png = await renderOg(await card(props as P));
		return new Response(new Uint8Array(png), { headers: OG_HEADERS });
	};
}
