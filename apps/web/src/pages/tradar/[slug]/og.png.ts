import { getCollection } from "astro:content";
import { ogEndpoint } from "../../../lib/og-endpoints";

export async function getStaticPaths() {
	const threads = await getCollection("tradar");
	return threads.map((thread) => ({
		params: { slug: thread.id },
		props: { title: thread.data.title, framing: thread.data.framing },
	}));
}

export const GET = ogEndpoint<{ title: string; framing: string }>((p) => ({
	kicker: "Tråd",
	title: p.title,
	framing: p.framing,
}));
