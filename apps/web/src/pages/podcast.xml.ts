import { statSync } from "node:fs";
import type { APIContext } from "astro";
import { getArticles } from "../lib/articles";
import { SITE_URL } from "../lib/config";
import { PODCAST_COVER, PODCAST_DESCRIPTION, PODCAST_TITLE } from "../lib/podcast";
import { escapeXml } from "../lib/xml";

const SITE = SITE_URL;

const SHOW = {
	title: PODCAST_TITLE,
	description: PODCAST_DESCRIPTION,
	author: "Islam.se",
	email: "yunus@edenmind.com",
	image: `${SITE}${PODCAST_COVER}`,
	language: "sv",
	category: "Religion &amp; Spirituality",
	subcategory: "Islam",
};

function toRFC2822(iso: string): string {
	return new Date(iso).toUTCString();
}

function getFileBytes(filename: string): number {
	try {
		const path = new URL(`../../../public/audio/${filename}`, import.meta.url);
		return statSync(path).size;
	} catch {
		return 0;
	}
}

function hasEpisodeArt(slug: string): boolean {
	try {
		const path = new URL(`../../../public/audio/${slug}.jpg`, import.meta.url);
		statSync(path);
		return true;
	} catch {
		return false;
	}
}

export async function GET(_context: APIContext) {
	const articles = await getArticles();
	const episodes = articles.filter(
		(a): a is typeof a & { audioFile: string } => typeof a.audioFile === "string",
	);

	const items = episodes
		.map((ep) => {
			const audioUrl = `${SITE}/audio/${ep.audioFile}`;
			const bytes = getFileBytes(ep.audioFile);
			const link = `${SITE}/${ep.slug}/`;
			const imageTag = hasEpisodeArt(ep.slug)
				? `\n      <itunes:image href="${SITE}/audio/${ep.slug}.jpg"/>`
				: "";

			return `    <item>
      <title>${escapeXml(ep.title)}</title>
      <description><![CDATA[${ep.description}]]></description>
      <pubDate>${toRFC2822(ep.publishedAt)}</pubDate>
      <link>${link}</link>
      <guid isPermaLink="false">${ep.slug}</guid>
      <enclosure url="${audioUrl}" length="${bytes}" type="audio/mpeg"/>
      <itunes:duration>${ep.audioDuration ?? 0}</itunes:duration>
      <itunes:explicit>false</itunes:explicit>
      <itunes:episodeType>full</itunes:episodeType>${imageTag}
    </item>`;
		})
		.join("\n");

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:podcast="https://podcastindex.org/namespace/1.0"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <atom:link href="${SITE}/podcast.xml" rel="self" type="application/rss+xml"/>
    <title>${SHOW.title}</title>
    <description><![CDATA[${SHOW.description}]]></description>
    <link>${SITE}</link>
    <language>${SHOW.language}</language>
    <itunes:author>${escapeXml(SHOW.author)}</itunes:author>
    <itunes:owner>
      <itunes:name>${escapeXml(SHOW.author)}</itunes:name>
      <itunes:email>${SHOW.email}</itunes:email>
    </itunes:owner>
    <itunes:explicit>false</itunes:explicit>
    <itunes:type>episodic</itunes:type>
    <itunes:image href="${SHOW.image}"/>
    <itunes:category text="${SHOW.category}">
      <itunes:category text="${SHOW.subcategory}"/>
    </itunes:category>
    <podcast:locked>no</podcast:locked>
${items}
  </channel>
</rss>`;

	return new Response(xml, {
		headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
	});
}
