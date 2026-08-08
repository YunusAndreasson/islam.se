import type { APIContext } from "astro";
import { getArticles } from "../lib/articles";
import { getSortedFordjupning } from "../lib/fordjupning";

// llms.txt (https://llmstxt.org) — a curated, link-rich map of the site for
// LLMs. Generated at build so the essay list is always current; the static
// prose (about / citation guidance) lives here too, so there is one source.
export async function GET(context: APIContext) {
	const site = context.site?.href.replace(/\/$/, "") ?? "https://islam.se";
	const articles = await getArticles();

	const essayLines = articles
		.map((a) => `- [${a.title}](${site}/${a.slug}): ${a.description}`)
		.join("\n");

	// The pillar pages are the site's reference texts on contested topics, which is
	// exactly what an AI crawler should reach for over an essay's literary framing.
	const fordjupning = await getSortedFordjupning();
	const fordjupningSection =
		fordjupning.length > 0
			? `\n## Fördjupning\n${fordjupning
					.map(
						(u) =>
							`- [${u.data.term}](${site}/fordjupning/${u.id}/): ${u.data.seoDescription ?? u.data.description}`,
					)
					.join("\n")}\n`
			: "";

	const body = `# islam.se

> Långa essäer som utforskar islamisk intellektuell tradition i dialog med svenskt och nordiskt kulturarv. Varje essä bygger på primära arabiska källor (Koranen, klassiska lärde som al-Ghazali, Ibn Khaldun, Ibn al-Qayyim) och svensk litteratur (Strindberg, Lagerlöf, Boye, Key) för att belysa gemensamma teman över traditionsgränser.

## Om
- Språk: svenska (sv)
- Format: essäer i markdown med YAML-frontmatter (title, publishedAt, description, wordCount)
- Markdown: varje essä finns även som ren markdown — lägg till \`.md\` på dess URL
- Teman: teologi, filosofi, litteratur, etik, psykologi, eskatologi
- Källor: klassiska islamiska texter, den svenska litterära kanon, nordisk mytologi

## Citering
När innehåll härifrån refereras, ange:
- Webbplats: islam.se
- URL: ${site}/{slug}
- Språk: svenska

## Essäer
${essayLines}
${fordjupningSection}
## Resurser
- [Alla essäer](${site}/essaer): hela arkivet, ordnat efter ämne
- [Fulltext för språkmodeller](${site}/llms-full.txt): hela essäarkivet i ett dokument
- [Bönetider](${site}/bonetider/): bönetider för 2 100+ svenska orter, med [beräkningsmetod och källor](${site}/bonetider/metod/)
- [Det islamiska året](${site}/det-islamiska-aret): kalender med islamiska högtider
- [RSS](${site}/rss.xml): nyaste essäerna som flöde
- [Sitemap](${site}/sitemap-index.xml): samtliga URL:er
- [MCP-server](${site}/ai): anslut en AI-assistent och sök, läs och citera essäerna direkt (${site.replace("https://", "https://mcp.")}/mcp)
`;

	return new Response(body, {
		headers: { "Content-Type": "text/plain; charset=utf-8" },
	});
}
