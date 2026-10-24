import { getCollection } from "astro:content";
import type { InferGetStaticPropsType } from "astro";
import { ogEndpoint } from "../../../lib/og-endpoints";
import { TRADITIONS } from "../../../lib/traditions";

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

export const GET = ogEndpoint<InferGetStaticPropsType<typeof getStaticPaths>>(
	(p) => ({
		// The spaced en dash of the house style, and the side as the thinker's page names it.
		kicker: `Tänkare – ${TRADITIONS[p.tradition].singular.toLowerCase()}`,
		title: p.title,
		framing: p.framing,
	}),
	(p) => `tankare|${p.tradition}|${p.title}|${p.framing}`,
);
