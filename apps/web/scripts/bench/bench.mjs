// The scorecard against ft.com (DESIGN.md, »The Scorecard«).
//
// islam.se shares FT's archetype — warm paper, a serif lead, a rail of titles — so a
// reader makes the comparison whether we invite it or not. This prints where each side
// stands on the rows that can be measured, so "better than FT" is a table and not a
// feeling, and so a change that loses a row is seen before it ships.
//
//   pnpm bench                     # a dist-check (or dist) build, served as Pages would
//   pnpm bench --base https://islam.se
//   pnpm bench --runs 5 --json out.json
//   pnpm bench --quick             # one Lighthouse run per page, no layout trace
//
// Lab data from the machine it runs on: compare runs on one machine, never across two.
// A local build is served over HTTP/1.1 from localhost, so its LCP reads about a second
// higher than production's and its blocking time lower. Use it for before and after on
// the same build server; confirm the absolute figures with --base once a change is live.
// Lighthouse varies run to run (a busy machine cost the front page 15 points once), so
// every Lighthouse figure is a median with its spread, never a single run.
//
// FT's column is the dated file beside this one. ft.com serves a bot check to scripted
// browsers, so it is not re-measured here and must not be: refresh it by hand.
//
// Needs `lighthouse` on PATH (or BENCH_LIGHTHOUSE="pnpm dlx lighthouse") and Chromium
// (CHROME_PATH). Install the Playwright browser with `pnpm exec playwright install chromium`.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium, lighthouse, median, probeInPage, serveDist, spread, WEB } from "./lib.mjs";

const { values: opt } = parseArgs({
	options: {
		base: { type: "string" },
		dist: { type: "string" },
		runs: { type: "string", default: "3" },
		essay: { type: "string", default: "/om-dessa-ord-nar-er/" },
		quick: { type: "boolean", default: false },
		json: { type: "string" },
	},
});

const FT = JSON.parse(readFileSync(new URL("./ft-2026-10-10.json", import.meta.url), "utf8"));
const RUNS = opt.quick ? 1 : Number(opt.runs);
const LAYOUT_RUNS = 9;
const VIEWPORTS = [
	[1280, 720],
	[1366, 768],
	[1440, 900],
	[390, 844],
];

// The front page on both form factors; the shared templates on the phone, where their
// problems are.
const TARGETS = [
	{ key: "home-mobile", path: "/", form: "mobile" },
	{ key: "home-desktop", path: "/", form: "desktop" },
	{ key: "essay-mobile", path: opt.essay, form: "mobile" },
	{ key: "essaer-mobile", path: "/essaer/", form: "mobile" },
	{ key: "svar-mobile", path: "/svar/", form: "mobile" },
];

async function origin() {
	if (opt.base) return { url: opt.base.replace(/\/$/, ""), close: () => undefined };
	const dir = opt.dist ?? (existsSync(resolve(WEB, "dist-check")) ? "dist-check" : "dist");
	if (!existsSync(resolve(WEB, dir, "index.html"))) {
		throw new Error(`No build in ${dir}/. Run \`astro build --outDir dist-check\` first.`);
	}
	console.error(`Serving ${dir}/ with its _headers.`);
	return serveDist(resolve(WEB, dir));
}

async function lighthouseRuns(base) {
	const out = {};
	for (const target of TARGETS) {
		const runs = [];
		for (let i = 0; i < RUNS; i++) {
			console.error(`Lighthouse ${target.key} ${i + 1}/${RUNS}`);
			runs.push(await lighthouse(base + target.path, target.form));
		}
		out[target.key] = runs;
	}
	return out;
}

/** The first screen at the sizes readers have, and the smallest text on the page. */
async function probe(browser, base) {
	const out = {};
	for (const [width, height] of VIEWPORTS) {
		const context = await browser.newContext({
			viewport: { width, height },
			isMobile: width < 600,
			hasTouch: width < 600,
			// Only to let the next line in: the page's own CSP forbids an injected style.
			bypassCSP: true,
		});
		const page = await context.newPage();
		const fonts = [];
		page.on("response", (response) => {
			if (response.url().includes(".woff2")) fonts.push(response);
		});
		await page.goto(`${base}/`, { waitUntil: "load" });
		await page.waitForTimeout(1500);
		let fontBytes = 0;
		for (const response of fonts) fontBytes += (await response.body().catch(() => "")).length;
		// content-visibility leaves the movements below the fold unlaid-out, and text that
		// is not laid out cannot be measured. Counted after the fonts, which it would change.
		await page.addStyleTag({ content: ".home-movement{content-visibility:visible!important}" });
		out[`${width}x${height}`] = {
			...(await page.evaluate(probeInPage)),
			fontFiles: fonts.length,
			fontKB: Math.round(fontBytes / 1024),
		};
		await context.close();
	}
	return out;
}

/** Time spent in layout while the front page loads: the first pass, and all of them. */
async function layoutTrace(browser, base) {
	const first = [];
	const total = [];
	for (let i = 0; i < LAYOUT_RUNS; i++) {
		const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
		const page = await context.newPage();
		const cdp = await context.newCDPSession(page);
		const events = [];
		cdp.on("Tracing.dataCollected", (data) => events.push(...data.value));
		await cdp.send("Tracing.start", {
			transferMode: "ReportEvents",
			traceConfig: { includedCategories: ["devtools.timeline"] },
		});
		await page.goto(`${base}/`, { waitUntil: "load" });
		await page.waitForTimeout(1500);
		const done = new Promise((resolve) => cdp.once("Tracing.tracingComplete", resolve));
		await cdp.send("Tracing.end");
		await done;
		const layouts = events
			.filter((e) => e.ph === "X" && e.name === "Layout")
			.sort((a, b) => a.ts - b.ts);
		first.push(Math.round((layouts[0]?.dur ?? 0) / 1000));
		total.push(Math.round(layouts.reduce((sum, e) => sum + e.dur, 0) / 1000));
		await context.close();
	}
	return { first, total };
}

const pick = (runs, key) => runs.map((r) => r[key]);
const seconds = (ms) => (ms / 1000).toFixed(1);

function verdict(ft, ours, better) {
	if (ft === ours) return "level";
	return (better === "lower" ? ours < ft : ours > ft) ? "ahead" : "BEHIND";
}

function row(label, ft, ours, better, show = String) {
	const value = Array.isArray(ours) ? median(ours) : ours;
	const shown = Array.isArray(ours) && ours.length > 1 ? spread(ours.map(Number)) : show(value);
	return [label, show(ft), shown, verdict(ft, value, better)];
}

function print(rows) {
	const widths = [0, 1, 2, 3].map((i) => Math.max(...rows.map((r) => String(r[i]).length)));
	for (const r of rows) console.log(r.map((cell, i) => String(cell).padEnd(widths[i])).join("  "));
}

const { url: base, close } = await origin();
const browser = await (await chromium()).launch();
try {
	const headers = (await fetch(`${base}/`)).headers;
	const lh = await lighthouseRuns(base);
	const first = await probe(browser, base);
	const layout = opt.quick ? null : await layoutTrace(browser, base);

	const mobile = lh["home-mobile"];
	const desktop = lh["home-desktop"];
	const laptop = first["1280x720"];
	const ft = FT.frontPage;

	console.log(`\nFront page — FT measured ${FT.measuredAt}; ours now, ${RUNS} run(s) per figure\n`);
	print([
		["Measure", "FT", "islam.se", ""],
		row("Performance, mobile", ft.mobile.perf, pick(mobile, "perf"), "higher"),
		row("Performance, desktop", ft.desktop.perf, pick(desktop, "perf"), "higher"),
		row("Blocking time, mobile (ms)", ft.mobile.tbt, pick(mobile, "tbt"), "lower"),
		row("Blocking time, desktop (ms)", ft.desktop.tbt, pick(desktop, "tbt"), "lower"),
		row(
			"Style and layout, mobile (ms)",
			ft.mobile.styleLayout,
			pick(mobile, "styleLayout"),
			"lower",
		),
		row(
			"Style and layout, desktop (ms)",
			ft.desktop.styleLayout,
			pick(desktop, "styleLayout"),
			"lower",
		),
		row("Layout shift, mobile", ft.mobile.cls, pick(mobile, "cls"), "lower"),
		row("LCP, mobile (ms)", ft.mobile.lcp, pick(mobile, "lcp"), "lower"),
		row("Best practices", ft.desktop.bp, median(pick(desktop, "bp")), "higher"),
		row("Accessibility, desktop", ft.desktop.a11y, median(pick(desktop, "a11y")), "higher"),
		row("Accessibility, mobile", ft.mobile.a11y, median(pick(mobile, "a11y")), "higher"),
		row("SEO", ft.desktop.seo, median(pick(desktop, "seo")), "higher"),
		row("Fonts on first load (KB)", ft.desktop.fontKB, laptop.fontKB, "lower"),
		row("Font files on first load", ft.desktop.fontFiles, laptop.fontFiles, "lower"),
		row("Page weight (KB)", ft.desktop.weightKB, median(pick(desktop, "weightKB")), "lower"),
		row("Requests", ft.desktop.requests, median(pick(desktop, "requests")), "lower"),
		row("JavaScript (KB)", ft.desktop.scriptKB, median(pick(desktop, "scriptKB")), "lower"),
		// Under 12 px is where Lighthouse stops calling text legible. A floor, not a contest:
		// FT's scale stops at 12.2 px, ours at 12.0, and both rows read "none".
		row("Text under 12 px (%)", ft.textUnder12Percent, first["1440x900"].under12, "lower"),
		row("HSTS", ft.hsts, headers.has("strict-transport-security"), "higher"),
		row("COOP", ft.coop, headers.has("cross-origin-opener-policy"), "higher"),
		row(
			"Headline and deck above the fold, 1280×720",
			true,
			laptop.headline && laptop.deck,
			"higher",
		),
	]);

	console.log("\nThe first screen\n");
	print([
		["Screen", "headline", "deck", "rail titles", "picture shown", "text under 12 px"],
		...Object.entries(first).map(([size, p]) => [
			size,
			p.headline ? "yes" : "cut",
			p.deck ? "yes" : "cut",
			`${p.indexTitles}/${p.indexShown}`,
			`${p.coverShown} %`,
			`${p.under12} %`,
		]),
	]);

	console.log("\nShared templates, phone (the bar: CLS ≤ 0.01, LCP ≤ 2.5 s, blocking ≤ 200 ms)\n");
	print([
		["Page", "perf", "CLS", "LCP (s)", "blocking (ms)", "fonts", "failing audits"],
		...TARGETS.filter((t) => t.form === "mobile").map((t) => {
			const runs = lh[t.key];
			return [
				t.path,
				median(pick(runs, "perf")),
				median(pick(runs, "cls")),
				seconds(median(pick(runs, "lcp"))),
				median(pick(runs, "tbt")),
				`${median(pick(runs, "fontFiles"))} / ${median(pick(runs, "fontKB"))} KB`,
				[...new Set(runs.flatMap((r) => r.failing))].join(", ") || "none",
			];
		}),
	]);

	if (layout) {
		console.log(
			`\nLayout while the front page loads, median of ${LAYOUT_RUNS}: first pass ${spread(layout.first, " ms")}, all passes ${spread(layout.total, " ms")}`,
		);
	}

	if (opt.json) {
		writeFileSync(
			opt.json,
			JSON.stringify({ base, runs: RUNS, lighthouse: lh, first, layout }, null, "\t"),
		);
	}
} finally {
	await browser.close();
	close();
}
