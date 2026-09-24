// Announce new and edited pages to IndexNow after a deploy. Runs from the root `ship`
// script once wrangler has published dist/. IndexNow feeds Bing — and through it ChatGPT
// search, Copilot and DuckDuckGo — which otherwise only learns about an edit on its next
// sitemap poll.
//
//   npx tsx scripts/indexnow.ts            submit changed URLs
//   npx tsx scripts/indexnow.ts --dry-run  list them, send nothing, keep the state
//
// Never fails the deploy: every error is logged and the script exits 0. State (last ping,
// URLs already announced) lives in .indexnow-state.json beside this app, untracked.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { INDEXNOW_KEY, type IndexNowState, parseSitemap, selectChanged } from "../src/lib/indexnow";

const ROOT = join(import.meta.dirname, "..");
const DIST = join(ROOT, "dist");
const STATE_FILE = join(ROOT, ".indexnow-state.json");
const ENDPOINT = "https://api.indexnow.org/indexnow";
const BATCH = 10_000; // IndexNow's per-request ceiling
const dryRun = process.argv.includes("--dry-run");

async function main() {
	const sitemaps = readdirSync(DIST).filter((f) => /^sitemap-(?!index|images).*\.xml$/.test(f));
	if (sitemaps.length === 0) {
		console.warn("indexnow: no sitemaps in dist/ — skipped");
		return;
	}
	const urls = sitemaps.flatMap((f) => parseSitemap(readFileSync(join(DIST, f), "utf8")));
	const state: IndexNowState | null = existsSync(STATE_FILE)
		? JSON.parse(readFileSync(STATE_FILE, "utf8"))
		: null;
	const changed = selectChanged(urls, state);
	const startedAt = new Date().toISOString();

	if (changed.length === 0) {
		console.log("indexnow: nothing changed since the last ping");
		return;
	}
	if (dryRun) {
		console.log(`indexnow (dry run): ${changed.length} URL(s)\n${changed.join("\n")}`);
		return;
	}

	for (let i = 0; i < changed.length; i += BATCH) {
		const res = await fetch(ENDPOINT, {
			method: "POST",
			headers: { "content-type": "application/json; charset=utf-8" },
			body: JSON.stringify({
				host: "islam.se",
				key: INDEXNOW_KEY,
				keyLocation: `https://islam.se/${INDEXNOW_KEY}.txt`,
				urlList: changed.slice(i, i + BATCH),
			}),
		});
		// 200 = accepted, 202 = accepted, key validation pending (normal on first use).
		if (res.status !== 200 && res.status !== 202) {
			console.warn(
				`indexnow: HTTP ${res.status} ${await res.text()} — state not saved, will retry next deploy`,
			);
			return;
		}
	}

	const seen = new Set([...(state?.seen ?? []), ...changed]);
	writeFileSync(
		STATE_FILE,
		`${JSON.stringify({ lastPing: startedAt, seen: [...seen].sort() }, null, "\t")}\n`,
	);
	console.log(`indexnow: submitted ${changed.length} URL(s)`);
}

main().catch((error) =>
	console.warn(`indexnow: ${error instanceof Error ? error.message : error} — skipped`),
);
