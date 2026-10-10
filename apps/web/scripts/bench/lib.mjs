// Shared pieces of the benchmark (see bench.mjs for what it measures and why).
import { execFile } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { promisify } from "node:util";
import { brotliCompressSync } from "node:zlib";

const run = promisify(execFile);

export const WEB = new URL("../../", import.meta.url).pathname;

export const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** »674 (460–948)«: the median, with the spread it was taken from. */
export const spread = (xs, unit = "") =>
	xs.length > 1
		? `${median(xs)}${unit} (${Math.min(...xs)}–${Math.max(...xs)})`
		: `${xs[0]}${unit}`;

// The repo carries no browser driver by choice. Playwright is borrowed from the sibling
// checkout, the same way the one-off probes here have always done it.
export async function chromium() {
	const path =
		process.env.BENCH_PLAYWRIGHT ??
		new URL("../../../../../zuhd.news/node_modules/playwright/index.mjs", import.meta.url).pathname;
	if (!existsSync(path)) {
		throw new Error(
			`Playwright not found at ${path}. Set BENCH_PLAYWRIGHT to a playwright/index.mjs.`,
		);
	}
	return (await import(path)).chromium;
}

const TYPES = {
	".html": "text/html; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".json": "application/json",
	".svg": "image/svg+xml",
	".xml": "application/xml",
	".txt": "text/plain; charset=utf-8",
	".md": "text/markdown; charset=utf-8",
	".webmanifest": "application/manifest+json",
	".woff2": "font/woff2",
	".avif": "image/avif",
	".webp": "image/webp",
	".png": "image/png",
	".jpg": "image/jpeg",
	".ico": "image/x-icon",
	".mp3": "audio/mpeg",
};
const TEXT = /^(text\/|application\/(json|xml|manifest\+json)|image\/svg)/;

/** Cloudflare Pages' `_headers`: a path pattern, then indented `Name: value` lines. */
function parseHeaders(text) {
	const rules = [];
	for (const line of text.split("\n")) {
		if (!line.trim() || line.trim().startsWith("#")) continue;
		if (/^\s/.test(line)) {
			const at = line.indexOf(":");
			rules
				.at(-1)
				?.headers.push([line.slice(0, at).trim().toLowerCase(), line.slice(at + 1).trim()]);
		} else {
			const source = line
				.trim()
				.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
				.replace(/\*/g, ".*")
				.replace(/:[a-z]+/gi, "[^/]+");
			rules.push({ re: new RegExp(`^${source}$`), headers: [] });
		}
	}
	return rules;
}

/**
 * Serves a build the way Pages does, as far as a measurement needs: the `_headers`
 * rules (every matching rule applies, duplicates comma-joined) and brotli on text.
 * Without the compression every weight figure would be the raw size, three to five
 * times what production sends.
 */
export function serveDist(dir) {
	const root = normalize(dir);
	const headersFile = join(root, "_headers");
	const rules = existsSync(headersFile) ? parseHeaders(readFileSync(headersFile, "utf8")) : [];
	const compressed = new Map();

	/** The file a path names, a directory's index, or the 404 page. */
	const locate = (path) => {
		const file = normalize(join(root, path));
		if (!file.startsWith(root)) return null;
		const target =
			existsSync(file) && statSync(file).isDirectory() ? join(file, "index.html") : file;
		return existsSync(target)
			? { file: target, status: 200 }
			: { file: join(root, "404.html"), status: 404 };
	};

	const headersFor = (path, type) => {
		const headers = { "content-type": type };
		for (const rule of rules.filter((r) => r.re.test(path))) {
			for (const [name, value] of rule.headers) {
				headers[name] = headers[name] ? `${headers[name]}, ${value}` : value;
			}
		}
		return headers;
	};

	const server = createServer((req, res) => {
		const path = decodeURIComponent(new URL(req.url ?? "/", "http://bench").pathname);
		const hit = locate(path);
		if (!hit) {
			res.writeHead(403).end();
			return;
		}
		const type = TYPES[extname(hit.file)] ?? "application/octet-stream";
		const headers = headersFor(path, type);
		let body = readFileSync(hit.file);
		if (TEXT.test(type) && /\bbr\b/.test(req.headers["accept-encoding"] ?? "")) {
			if (!compressed.has(hit.file)) compressed.set(hit.file, brotliCompressSync(body));
			body = compressed.get(hit.file);
			headers["content-encoding"] = "br";
		}
		res.writeHead(hit.status, headers).end(body);
	});

	return new Promise((resolve) => {
		server.listen(0, "127.0.0.1", () => {
			resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() });
		});
	});
}

const kb = (bytes) => Math.round(bytes / 1024);

/** One Lighthouse run, reduced to the figures the scorecard prints. */
export async function lighthouse(url, formFactor) {
	const [cmd, ...pre] = (process.env.BENCH_LIGHTHOUSE ?? "lighthouse").split(" ");
	const args = [
		...pre,
		url,
		"--quiet",
		"--output=json",
		"--output-path=stdout",
		"--chrome-flags=--headless=new",
	];
	if (formFactor === "desktop") args.push("--preset=desktop");
	const { stdout } = await run(cmd, args, { maxBuffer: 256 * 1024 * 1024 });
	const report = JSON.parse(stdout);
	const audits = report.audits;
	const items = (id) => audits[id]?.details?.items ?? [];
	const requests = items("network-requests");
	const ofType = (type) => requests.filter((r) => r.resourceType === type);
	const transfer = (list) => kb(list.reduce((sum, r) => sum + (r.transferSize ?? 0), 0));

	// A weighted audit that scored under 0.9: the ones that cost the category points.
	const failing = [];
	for (const category of ["accessibility", "best-practices", "seo"]) {
		for (const ref of report.categories[category].auditRefs) {
			const audit = audits[ref.id];
			const scored = !["notApplicable", "informative", "manual"].includes(audit?.scoreDisplayMode);
			if (ref.weight > 0 && scored && audit.score !== null && audit.score < 0.9)
				failing.push(ref.id);
		}
	}

	return {
		perf: Math.round(report.categories.performance.score * 100),
		a11y: Math.round(report.categories.accessibility.score * 100),
		bp: Math.round(report.categories["best-practices"].score * 100),
		seo: Math.round(report.categories.seo.score * 100),
		lcp: Math.round(audits["largest-contentful-paint"].numericValue),
		tbt: Math.round(audits["total-blocking-time"].numericValue),
		cls: Number(audits["cumulative-layout-shift"].numericValue.toFixed(3)),
		styleLayout: Math.round(
			items("mainthread-work-breakdown").find((i) => i.group === "styleLayout")?.duration ?? 0,
		),
		longestTask: Math.round(Math.max(0, ...items("long-tasks").map((t) => t.duration))),
		requests: requests.length,
		weightKB: transfer(requests),
		scriptKB: transfer(ofType("Script")),
		fontFiles: ofType("Font").length,
		fontKB: transfer(ofType("Font")),
		failing,
	};
}

/** Measured in the page. Kept as one function so it can be handed to `page.evaluate`. */
export function probeInPage() {
	const visible = (el) => {
		const box = el.getBoundingClientRect();
		const style = getComputedStyle(el);
		return (
			box.width > 0 &&
			box.height > 0 &&
			style.visibility !== "hidden" &&
			!el.closest("dialog:not([open]), [hidden], .sr-only")
		);
	};
	const fold = innerHeight;
	const box = (selector) => document.querySelector(selector)?.getBoundingClientRect();
	const above = (rect) => Boolean(rect) && rect.bottom <= fold;

	let chars = 0;
	let small = 0;
	let smallest = Number.POSITIVE_INFINITY;
	const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
	while (walker.nextNode()) {
		const text = walker.currentNode.nodeValue.trim();
		const el = walker.currentNode.parentElement;
		if (!(text && el && visible(el))) continue;
		const size = Number.parseFloat(getComputedStyle(el).fontSize);
		chars += text.length;
		if (size < 11.95) small += text.length;
		smallest = Math.min(smallest, size);
	}

	const cover = box(".feature-media");
	// The rail shows six titles on a wide screen and three in one column.
	const index = [...document.querySelectorAll(".feature-also-lista > li")].filter(visible);
	return {
		headline: above(box(".feature-title")),
		deck: above(box(".feature-lead")),
		indexTitles: index.filter((li) => above(li.getBoundingClientRect())).length,
		indexShown: index.length,
		coverShown: cover
			? Math.round((Math.max(0, Math.min(fold, cover.bottom) - cover.top) / cover.height) * 100)
			: 0,
		under12: Number(((small / chars) * 100).toFixed(1)),
		smallest: Number(smallest.toFixed(1)),
	};
}
