import type { APIRoute } from "astro";
import { INDEXED_PLACES, OG_POPULATION } from "../../../lib/bonetider/places-index";
import { renderOg } from "../../../lib/og";

// Personalised OG cards for the larger towns only (population ≥ OG_POPULATION); smaller
// places fall back to the shared /bonetider/og.png card, keeping the build cheap. Prayer
// names are kept ASCII here so the vendored satori fonts render them without tofu.
export function getStaticPaths() {
	return INDEXED_PLACES.filter((p) => p.population >= OG_POPULATION).map((p) => ({
		params: { stad: p.slug },
		props: { name: p.name, county: p.county },
	}));
}

export const GET: APIRoute = async ({ props }) => {
	const county = props.county as string;
	const png = await renderOg({
		kicker: "Bönetider",
		title: props.name as string,
		framing: `Fajr · Dhuhr · Asr · Maghrib · Isha – varje dag${county ? `, ${county}` : ""}`,
	});
	return new Response(new Uint8Array(png), {
		headers: {
			"Content-Type": "image/png",
			"Cache-Control": "public, max-age=31536000, immutable",
		},
	});
};
