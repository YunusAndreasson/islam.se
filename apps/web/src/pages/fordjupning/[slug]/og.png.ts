import { getCollection } from "astro:content";
import { ogEndpoint } from "../../../lib/og-endpoints";

// A title card per pillar page, in place of the shared /og-default.png.
export async function getStaticPaths() {
	const entries = await getCollection("fordjupning");
	return entries.map((entry) => ({
		params: { slug: entry.id },
		props: { title: entry.data.term, framing: entry.data.description },
	}));
}

export const GET = ogEndpoint<{ title: string; framing: string }>(
	(p) => ({ kicker: "Fördjupning", title: p.title, framing: p.framing }),
	(p) => `fordjupning|${p.title}|${p.framing}`,
);
