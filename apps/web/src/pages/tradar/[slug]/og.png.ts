import { getCollection } from "astro:content";
import type { InferGetStaticPropsType } from "astro";
import { ogEndpoint } from "../../../lib/og-endpoints";

export async function getStaticPaths() {
	const threads = await getCollection("tradar");
	return threads.map((thread) => ({
		params: { slug: thread.id },
		props: { title: thread.data.title, framing: thread.data.framing },
	}));
}

export const GET = ogEndpoint<InferGetStaticPropsType<typeof getStaticPaths>>(
	(p) => ({ kicker: "Essäserie", title: p.title, framing: p.framing }),
	(p) => `tradar|${p.title}|${p.framing}`,
);
