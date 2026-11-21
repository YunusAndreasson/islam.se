import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import EPISODES from "../data/podcast-episodes.json";
import { APPLE_PODCAST_URL, episodeLinks, episodeShowNotes, SPOTIFY_SHOW_URL } from "./podcast";

// Spotify shows an episode's description and ignores the item's <link>, so until
// 2026-11-21 no Spotify listener could get from an episode to the essay it reads.
describe("episodeShowNotes", () => {
	const url = "https://islam.se/somnens-lilla-dod/";

	it("ends with a link to the essay, its address as the visible text", () => {
		const notes = episodeShowNotes("Sömnen kallas den lilla döden.", url);
		expect(notes, "the essay link is what carries a listener to the text").toContain(
			`<a href="${url}">${url}</a>`,
		);
		expect(notes.startsWith("<p>Sömnen kallas den lilla döden.</p>")).toBe(true);
	});

	it("escapes the summary so a stray character cannot break the HTML or the CDATA", () => {
		const notes = episodeShowNotes('Tro & samvete <i> "citat"', url);
		expect(notes).toContain("Tro &amp; samvete &lt;i&gt; &quot;citat&quot;");
		expect(notes).not.toContain("]]>");
	});
});

describe("episodeLinks", () => {
	// From this file, not process.cwd(): the suite runs from the repo root and from apps/web.
	const articlesDir = fileURLToPath(new URL("../../../../data/articles", import.meta.url));
	const narrated = new Set(
		readdirSync(articlesDir)
			.filter((file) => file.endsWith(".md"))
			.filter((file) => /^audioFile:/m.test(readFileSync(join(articlesDir, file), "utf8")))
			.map((file) => file.replace(/\.md$/, "")),
	);

	it("opens the essay's own episode, not the show", () => {
		const links = episodeLinks("somnens-lilla-dod");
		expect(links.apple).toMatch(
			/^https:\/\/podcasts\.apple\.com\/se\/podcast\/.+\/id1890751890\?i=\d+$/,
		);
		expect(links.spotify).toMatch(/^https:\/\/open\.spotify\.com\/episode\/[A-Za-z0-9]{22}$/);
	});

	it("falls back to the show for an episode the directories have not listed yet", () => {
		expect(episodeLinks("ingen-sadan-essa")).toEqual({
			apple: APPLE_PODCAST_URL,
			spotify: SPOTIFY_SHOW_URL,
		});
	});

	it("lists only narrated essays, each with links in both directories", () => {
		for (const [slug, links] of Object.entries(EPISODES)) {
			expect(
				narrated.has(slug),
				`${slug} is in podcast-episodes.json but is no narrated essay: a renamed slug?`,
			).toBe(true);
			expect(links.apple, `${slug}: Apple link is not an episode of this show`).toMatch(
				/id1890751890\?i=\d+$/,
			);
			expect(links.spotify, `${slug}: Spotify link is not an episode`).toMatch(
				/open\.spotify\.com\/episode\//,
			);
		}
		const spotify = Object.values(EPISODES).map((links) => links.spotify);
		expect(new Set(spotify).size, "two essays point to the same Spotify episode").toBe(
			spotify.length,
		);
	});
});
