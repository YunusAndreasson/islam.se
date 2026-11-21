// The show cover under a name that changes with its content. Build-time only (node:fs).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PODCAST_COVER } from "./podcast";

// Apple Podcasts kept the old khatam mark from August to at least 2026-11-21, after
// podcast-cover.jpg had become the blue-and-gold disc. A `?v=<hash>` on the URL (from
// 2026-10) did not help, and a feed refresh in Podcasts Connect did not either: Apple
// reread the feed, took the new show title, and kept the old picture, so it does not
// treat a new query string as a new image. A new file name does. Spotify picked up the
// change either way.

/** The cover's bytes, read from public/ relative to the app root (see podcast.xml.ts). */
export function podcastCoverBytes(): Buffer {
	return readFileSync(join(process.cwd(), "public", PODCAST_COVER));
}

/** The first 8 hex characters of the cover's SHA-256: part of its served file name. */
export function podcastCoverVersion(): string {
	return createHash("sha256").update(podcastCoverBytes()).digest("hex").slice(0, 8);
}

/** Where the feed points directories for the show art: /podcast-cover-<version>.jpg. */
export function podcastCoverPath(): string {
	return `/podcast-cover-${podcastCoverVersion()}.jpg`;
}
