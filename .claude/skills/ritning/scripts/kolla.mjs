// kolla.mjs — measure every drawing (.ritning) on the given pages, in both themes, at a
// wide and a phone width, and shoot each for a look.
//
//   node .claude/skills/ritning/scripts/kolla.mjs / /tankare/ /vad-ar-islam/
//
// Against the dev server by default — RESTART it first after rewriting a component
// (`pnpm dev:stop && pnpm dev:bg` in apps/web): it paints the old component CSS and the
// numbers lie. BASE=http://127.0.0.1:4399 for a static build. Playwright is borrowed
// from the sibling zuhd.news checkout (PLAYWRIGHT=… to point elsewhere).
//
// Per drawing it prints: which image the theme shows and how it blends; whether the
// drawing's own ground equals the ground under it (a mismatch shows as a square); the
// painted drawing's box; and the first and last line of the words in the same grid, so
// »as tall as its words« and the line it stands on can be read straight off.
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";

const PW = process.env.PLAYWRIGHT ?? "/home/yunus/Work/zuhd.news/node_modules/playwright/index.mjs";
const { chromium } = await import(PW);
const BASE = process.env.BASE ?? "http://localhost:4321";
const OUT = `${process.env.RITNING_WORK ?? `${homedir()}/.cache/islam-se-ritningar`}/_kolla`;
const pages = process.argv.slice(2);
if (!pages.length) {
	console.error("kolla.mjs <sökväg> [<sökväg> …]");
	process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch();
for (const theme of ["light", "dark"])
	for (const w of [1440, 390]) {
		const ctx = await b.newContext({
			viewport: { width: w, height: 900 },
			deviceScaleFactor: 1,
			isMobile: w < 600,
			colorScheme: theme,
		});
		for (const u of pages) {
			const p = await ctx.newPage();
			p.setDefaultTimeout(60000);
			await p.goto(BASE + u, { waitUntil: "load" });
			await p.waitForTimeout(800);
			const n = await p.locator(".ritning").count();
			for (let k = 0; k < n; k++) {
				// A movement under content-visibility is not laid out until near the viewport:
				// scroll to it first, or the drawing measures 0×0 and its lazy image never loads.
				await p.evaluate((k) => {
					const r = document.querySelectorAll(".ritning")[k];
					(r.closest(".home-movement, section, header") ?? r).scrollIntoView({ block: "center" });
					r.scrollIntoView({ block: "center" });
				}, k);
				await p.waitForTimeout(1200);
				const m = await p.evaluate((k) => {
					const span = document.querySelectorAll(".ritning")[k],
						cell = span.parentElement,
						grid = cell.parentElement;
					const img = [...span.querySelectorAll("img")].find(
						(i) => getComputedStyle(i).display !== "none",
					);
					if (!img) return { fel: "ingen bild visas" };
					let e = span.parentElement,
						ground = null;
					while (e) {
						const c = getComputedStyle(e).backgroundColor;
						if (c !== "rgba(0, 0, 0, 0)") {
							ground = c;
							break;
						}
						e = e.parentElement;
					}
					const ir = img.getBoundingClientRect(),
						fit = getComputedStyle(img).objectFit === "contain";
					const ar = img.naturalWidth / img.naturalHeight || 1;
					const pw = fit ? Math.min(ir.width, ir.height * ar) : ir.width,
						ph = fit ? Math.min(ir.height, ir.width / ar) : ir.height;
					const left =
						fit && getComputedStyle(img).objectPosition.startsWith("100%")
							? ir.right - pw
							: ir.left;
					// The words: every text line in the same grid, outside the drawing's cell.
					const rects = [];
					const walk = document.createTreeWalker(grid, NodeFilter.SHOW_TEXT);
					while (walk.nextNode()) {
						const t = walk.currentNode;
						if (!t.textContent.trim() || cell.contains(t)) continue;
						const rg = document.createRange();
						rg.selectNodeContents(t);
						for (const r of rg.getClientRects()) if (r.height) rects.push(r);
					}
					const top = Math.min(...rects.map((r) => r.top)),
						bottom = Math.max(...rects.map((r) => r.bottom)),
						textLeft = Math.min(...rects.map((r) => r.left)),
						textRight = Math.max(...rects.map((r) => r.right));
					const R = (v) => Math.round(v);
					return {
						var: (cell.className || span.className)
							.toString()
							.split(" ")
							.filter((c) => !c.startsWith("astro"))[0],
						bild: `${img.className.split(" ")[0]}/${getComputedStyle(img).mixBlendMode}/${img.complete && img.naturalWidth ? "laddad" : "EJ LADDAD"}`,
						grund:
							getComputedStyle(span).backgroundColor === ground
								? "ok"
								: `FEL ${getComputedStyle(span).backgroundColor} på ${ground}`,
						ritad: `x ${R(left)}–${R(left + pw)}, y ${R(ir.top)}–${R(ir.top + ph)} (${R(pw)}×${R(ph)})`,
						orden: `x ${R(textLeft)}–${R(textRight)}, y ${R(top)}–${R(bottom)}`,
						scrollY: R(scrollY),
					};
				}, k);
				console.log(theme.padEnd(5), String(w).padEnd(4), u.padEnd(22), JSON.stringify(m));
				const box = await p
					.locator(".ritning")
					.nth(k)
					.evaluate((s) => {
						const r = s.parentElement.parentElement.getBoundingClientRect();
						return {
							x: Math.max(0, r.left - 24),
							y: Math.max(0, r.top - 24),
							width: Math.min(innerWidth, r.width + 48),
							height: Math.min(900, r.height + 48),
						};
					});
				if (box.width > 0 && box.height > 0)
					await p
						.screenshot({
							path: `${OUT}/${u.replaceAll("/", "_") || "_"}${k}-${theme}-${w}.png`,
							clip: box,
						})
						.catch(() => {
							// A clip outside the page (a drawing below the fold on a phone) is no finding; the numbers above are.
						});
			}
			await p.close();
		}
		await ctx.close();
	}
await b.close();
console.log(`skärmbilder: ${OUT}/`);
