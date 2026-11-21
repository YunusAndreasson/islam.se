// The show cover at a content-addressed path (lib/podcast-cover.ts): one page, whose
// name is the current hash. public/podcast-cover.jpg stays where it is for everything
// else that links it.
import type { APIRoute, GetStaticPaths } from "astro";
import { podcastCoverBytes, podcastCoverVersion } from "../lib/podcast-cover";

export const getStaticPaths: GetStaticPaths = () => [
	{ params: { version: podcastCoverVersion() } },
];

export const GET: APIRoute = () =>
	new Response(new Uint8Array(podcastCoverBytes()), { headers: { "Content-Type": "image/jpeg" } });
