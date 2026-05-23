import { getCollection } from "astro:content";
import type { APIRoute } from "astro";
import { renderOg } from "../../../lib/og";

export async function getStaticPaths() {
	const threads = await getCollection("tradar");
	return threads.map((thread) => ({
		params: { slug: thread.id },
		props: { title: thread.data.title, framing: thread.data.framing },
	}));
}

export const GET: APIRoute = async ({ props }) => {
	const png = await renderOg({
		kicker: "Tråd",
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
