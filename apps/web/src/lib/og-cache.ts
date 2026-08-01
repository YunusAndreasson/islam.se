import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Disk cache for the satori OG cards. Measured 2026-07-27: 339 cards cost 20.8 s of a
// ~90 s build, and the 53 essay cards are 206 ms each because sharp's `position:
// "attention"` crop analyses the whole hero photo. None of it changes between builds
// unless the card's inputs do.
//
// Lives under node_modules/.astro so it is already gitignored and already wiped by the
// usual "delete node_modules" reset.
const DIR = join(process.cwd(), "node_modules/.astro/og-cache");

// Every SOURCE file a card is built from, plus the RENDERERS: satori turns the tree into
// SVG and sharp rasterises it, so bumping either changes the bytes just as surely as
// editing the layout does. Hashing them all means a version bump or a design edit
// invalidates every cached card automatically — the alternative is a manual version
// constant that someone forgets to bump and then ships stale cards for weeks.
//
// ⚠️ The endpoints are in here because most of the card COPY lives in them, not in og.ts:
// bonetider/og.png.ts holds its own title and framing behind the constant cache key
// "bonetider-hub", [stad]/og.png.ts holds the "Fajr · Dhuhr · …" template, and og/[slug]'s
// kicker comes from amnen.ts while its key only names article.category. Editing any of
// those changed nothing a per-card key could see, so the old PNG was re-served
// indefinitely — now with a 24 h `/og/*` cache header in front of it.
function cardSources(): string[] {
	const files = ["src/lib/og.ts", "src/lib/og-endpoints.ts", "src/lib/amnen.ts"].map((f) =>
		join(process.cwd(), f),
	);
	const pages = join(process.cwd(), "src/pages");
	for (const entry of readdirSync(pages, { recursive: true, withFileTypes: true })) {
		if (entry.isFile() && /^og.*\.png\.ts$/.test(entry.name)) {
			files.push(join(entry.parentPath, entry.name));
		}
	}
	// Sorted so the digest does not depend on directory order. Contents only — an absolute
	// path in the hash would give every checkout its own generation.
	return files.sort();
}

const layoutHash = (() => {
	try {
		const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
		const renderers = ["satori", "sharp"]
			.map((n) => `${n}@${pkg.dependencies?.[n] ?? pkg.devDependencies?.[n] ?? "?"}`)
			.join(",");
		const hash = createHash("sha256");
		for (const file of cardSources()) hash.update(readFileSync(file));
		return hash.update(renderers).digest("hex").slice(0, 12);
	} catch {
		// Nothing to read (unexpected) — fall back to a per-process value so the cache
		// still works within a build but never persists a card built from unknown code.
		return `nolayout-${process.pid}`;
	}
})();

// Cards live in a per-layout directory so a layout change can drop the previous
// generation wholesale. Without this the cache only ever grows: every edit to og.ts
// orphans another 339 PNGs that nothing will ever read again.
const GEN_DIR = join(DIR, layoutHash);
let pruned = false;

function pruneOldGenerations(): void {
	if (pruned) return;
	pruned = true;
	try {
		for (const entry of readdirSync(DIR, { withFileTypes: true })) {
			if (entry.isDirectory() && entry.name !== layoutHash) {
				rmSync(join(DIR, entry.name), { recursive: true, force: true });
			}
		}
	} catch {
		// No cache dir yet, or it is not ours to tidy. Never fail a build over this.
	}
}

/** Cache a rendered card under a caller-supplied key. The key must name every input
 *  that changes the image — see the call sites in src/pages/**\/og*.png.ts. */
export async function ogCached(key: string, render: () => Promise<Buffer>): Promise<Buffer> {
	pruneOldGenerations();
	const name = createHash("sha256").update(key).digest("hex").slice(0, 20);
	const file = join(GEN_DIR, `${name}.png`);
	try {
		if (existsSync(file)) return readFileSync(file);
	} catch {
		// Unreadable cache entry — fall through and re-render.
	}
	const png = await render();
	try {
		mkdirSync(GEN_DIR, { recursive: true });
		writeFileSync(file, png);
	} catch {
		// A cache that cannot be written must not fail the build.
	}
	return png;
}
