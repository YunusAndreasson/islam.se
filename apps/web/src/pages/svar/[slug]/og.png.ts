import { getCollection } from "astro:content";
import { ogEndpoint } from "../../../lib/og-endpoints";

// A title card per answer page. They all shared /og-default.png before, so every
// shared link and Discover card showed the same generic image.
export async function getStaticPaths() {
	const entries = await getCollection("svar");
	return entries.map((entry) => ({
		params: { slug: entry.id },
		props: { title: entry.data.title, framing: entry.data.description },
	}));
}

export const GET = ogEndpoint<{ title: string; framing: string }>(
	(p) => ({ kicker: "Frågor och svar", title: p.title, framing: p.framing }),
	(p) => `svar|${p.title}|${p.framing}`,
);
