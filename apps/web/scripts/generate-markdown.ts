import { access, readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeHtmlMarkdown } from "node-html-markdown";

// Post-build: give every HTML page a markdown twin so the edge `_middleware`
// can answer `Accept: text/markdown` with real markdown (see functions/_middleware.js).
//
// Essays already ship a hand-authored, cleaner twin at /{slug}.md (src/pages/[slug].md.ts)
// — we SKIP those and only generate for the pages that lack one (home, bönetider,
// taxonomy, info pages). Markdown is built from the page's own <main>, so it is the
// same content as the HTML (parity, not cloaking).

const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
const SITE = "https://islam.se";

async function exists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

async function* walkIndexHtml(dir: string): AsyncGenerator<string> {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) yield* walkIndexHtml(full);
		else if (entry.isFile() && entry.name === "index.html") yield full;
	}
}

// Pull the <main> region and drop sub-trees that only produce markdown noise
// (scripts, styles, inline SVG icons, the bönetider <canvas>, no-JS fallbacks).
function extractMain(html: string): string {
	const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
	const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
	const fragment = main?.[1] ?? body?.[1] ?? html;
	return fragment
		.replace(/<script\b[\s\S]*?<\/script>/gi, "")
		.replace(/<style\b[\s\S]*?<\/style>/gi, "")
		.replace(/<svg\b[\s\S]*?<\/svg>/gi, "")
		.replace(/<canvas\b[\s\S]*?<\/canvas>/gi, "")
		.replace(/<noscript\b[\s\S]*?<\/noscript>/gi, "");
}

let generated = 0;
let skipped = 0;

for await (const htmlPath of walkIndexHtml(DIST)) {
	const relDir = relative(DIST, htmlPath).replace(/\/?index\.html$/, ""); // "" for the homepage
	const essayTwin = join(DIST, `${relDir}.md`); // hand-authored essay twin, e.g. dist/alis-princip.md
	const dirTwin = join(DIST, relDir, "index.md");

	if (relDir && (await exists(essayTwin))) {
		skipped++;
		continue;
	}
	if (await exists(dirTwin)) {
		skipped++;
		continue;
	}

	const html = await readFile(htmlPath, "utf8");
	const markdown = NodeHtmlMarkdown.translate(extractMain(html)).trim();
	if (!markdown) {
		skipped++;
		continue;
	}

	const route = `/${relDir ? `${relDir}/` : ""}`;
	const out = `> Källa: ${SITE}${route}\n\n${markdown}\n`;
	await writeFile(dirTwin, out, "utf8");
	generated++;
}

console.log(`markdown twins: ${generated} generated, ${skipped} skipped (hand-authored/existing)`);
