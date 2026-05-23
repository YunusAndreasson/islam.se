import { getCollection } from "astro:content";
import type { APIRoute } from "astro";
import { renderOg } from "../../../lib/og";

export async function getStaticPaths() {
	const thinkers = await getCollection("tankare");
	return thinkers.map((thinker) => ({
		params: { slug: thinker.data.slug },
		props: {
			title: thinker.data.name,
			framing: thinker.data.framing,
			tradition: thinker.data.tradition,
		},
	}));
}

export const GET: APIRoute = async ({ props }) => {
	const kicker =
		props.tradition === "sunni" ? "Tänkare — klassisk tradition" : "Tänkare — svensk röst";
	const png = await renderOg({
		kicker,
		title: props.title as string,
		framing: props.framing as string,
	});
	return new Response(new Uint8Array(png), {
		headers: {
			"Content-Type": "image/png",
			"Cache-Control": "public, max-age=31536000, immutable",
		},
	});
};
