import { getCollection } from "astro:content";
import { ogEndpoint } from "../../../lib/og-endpoints";

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

export const GET = ogEndpoint<{ title: string; framing: string; tradition: string }>((p) => ({
	kicker:
		p.tradition === "sunni" ? "Tänkare — klassisk islamisk tradition" : "Tänkare — svensk röst",
	title: p.title,
	framing: p.framing,
}));
