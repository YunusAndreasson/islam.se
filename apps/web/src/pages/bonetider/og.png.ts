import type { APIRoute } from "astro";
import { renderOg } from "../../lib/og";

// Shared Open Graph card for the hub and the long-tail city pages (those below the
// per-city OG threshold) – date-independent, so it never goes stale.
export const GET: APIRoute = async () => {
	const png = await renderOg({
		kicker: "Bönetider",
		title: "Bönetider i Sverige",
		framing: "Solens tider, ort för ort – från Malmö till Kiruna.",
	});
	return new Response(new Uint8Array(png), {
		headers: {
			"Content-Type": "image/png",
			"Cache-Control": "public, max-age=31536000, immutable",
		},
	});
};
