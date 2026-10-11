// shots.mjs <path> … — look at every photograph in its page, at desktop and phone width.
//
//   node .claude/skills/article-photographs/scripts/shots.mjs /om-dessa-ord-nar-er/ /svar/vad-ar-hajj/
//
// For each figure in the text it scrolls the figure to the middle of the screen and
// shoots the viewport, so the picture is seen with the paragraph above it and the one
// below. It prints the rendition the browser chose, the width it is shown at, and
// whether the page scrolls sideways. Then READ the screenshots: is the figure on top of
// a pull quote or a second figure, does it split a thought, does the caption sit under it.
//
// Against the dev server by default (BASE=http://localhost:4321; read the port from
// `pnpm dev:status`). The dev server is shared: never restart one you did not start.
// It keeps the rehype plugins it started with, so what a pull quote does next to a
// figure is judged in a build (check.py), not here. Playwright is borrowed from the
// sibling zuhd.news checkout (PLAYWRIGHT=… to point elsewhere).
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";

const PW = process.env.PLAYWRIGHT ?? "/home/yunus/Work/zuhd.news/node_modules/playwright/index.mjs";
const { chromium } = await import(PW);
const BASE = process.env.BASE ?? "http://localhost:4321";
const OUT = `${process.env.BILDER_WORK ?? `${homedir()}/.cache/islam-se-bilder`}/_shots`;
const pages = process.argv.slice(2);
if (!pages.length) {
	console.error("shots.mjs <path> [<path> …]");
	process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
for (const [width, height] of [
	[1280, 1100],
	[390, 844],
]) {
	const ctx = await browser.newContext({
		viewport: { width, height },
		deviceScaleFactor: 1,
		colorScheme: "light",
	});
	const page = await ctx.newPage();
	for (const path of pages) {
		await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 120000 });
		const figures = page.locator("figure.prose-figure:has(img)");
		const count = await figures.count();
		if (count === 0) console.log(`${width} ${path}: no figures in the text`);
		for (let k = 0; k < count; k++) {
			const fig = figures.nth(k);
			await fig.evaluate((el) => el.scrollIntoView({ block: "center" }));
			await page.waitForTimeout(700);
			const info = await fig.evaluate((el) => {
				const img = el.querySelector("img");
				const name = /([a-z0-9-]+)\.webp/.exec(decodeURIComponent(img.currentSrc))?.[1] ?? "?";
				return {
					name,
					// The dev server names the width in the URL; a build names only a hash.
					chosen: /[?&]w=(\d+)/.exec(img.currentSrc)?.[1] ?? "?",
					shown: Math.round(img.getBoundingClientRect().width),
					sideways: document.documentElement.scrollWidth > window.innerWidth,
				};
			});
			const file = `${OUT}/${width}-${path.replace(/\W+/g, "_")}${k + 1}-${info.name}.png`;
			await page.screenshot({ path: file });
			console.log(
				`${width} ${path} ${info.name}: the ${info.chosen}w file, shown ${info.shown}px wide${info.sideways ? "  ✗ THE PAGE SCROLLS SIDEWAYS" : ""}\n    ${file}`,
			);
		}
	}
	await ctx.close();
}
await browser.close();
