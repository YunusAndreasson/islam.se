// @ts-check
// Markdown content negotiation for AI agents (a free, Pages-native stand-in for
// Cloudflare's Pro-only "Markdown for Agents").
//
// When a request carries `Accept: text/markdown`, we serve the page's pre-built
// markdown twin (essays: /{slug}.md from src/pages/[slug].md.ts; every other page:
// /<path>/index.md from scripts/generate-markdown.ts) with `Content-Type: text/markdown`.
// Browsers (Accept: text/html,...) are untouched and keep getting HTML.
//
// Invocation is scoped by public/_routes.json so this Function does NOT run on the
// bulk asset paths (/_astro, /og, /audio) — only on page navigations.

const CHARS_PER_TOKEN = 4; // rough estimate for the x-markdown-tokens hint

/** @param {Request} request */
function wantsMarkdown(request) {
	if (request.method !== "GET" && request.method !== "HEAD") return false;
	const accept = request.headers.get("accept") || "";
	return accept.split(",").some((entry) => {
		const [mediaType, ...parameters] = entry.trim().toLowerCase().split(";");
		if (mediaType?.trim() !== "text/markdown") return false;
		const quality = parameters.find((parameter) => parameter.trim().startsWith("q="));
		const weight = quality ? Number(quality.trim().slice(2)) : 1;
		return Number.isFinite(weight) && weight > 0 && weight <= 1;
	});
}

// Where a given page's markdown twin lives, most-specific first.
/** @param {string} pathname */
function twinCandidates(pathname) {
	if (pathname.endsWith("/")) {
		const candidates = [`${pathname}index.md`]; // /foo/ -> /foo/index.md ; / -> /index.md
		if (pathname !== "/") candidates.push(`${pathname.slice(0, -1)}.md`); // /foo/ -> /foo.md (essays)
		return candidates;
	}
	return [`${pathname}.md`, `${pathname}/index.md`];
}

/** @typedef {{ASSETS?: {fetch(request: Request): Promise<Response>}}} AssetEnvironment */

/** @param {AssetEnvironment} env
 * @param {URL} assetUrl */
async function fetchAsset(env, assetUrl) {
	// ASSETS bypasses Functions; an origin fetch can re-enter this middleware.
	if (!env.ASSETS) return null;
	try {
		return await env.ASSETS.fetch(
			new Request(assetUrl, {
				method: "GET",
				headers: { accept: "*/*" },
				redirect: "manual",
			}),
		);
	} catch {
		// Markdown is an alternate representation; an asset failure must not hide HTML.
		return null;
	}
}

/** Set a pathname without interpreting a leading // as a different host.
 * @param {string} pathname
 * @param {string} origin */
function pathUrl(pathname, origin) {
	const url = new URL(origin);
	url.pathname = pathname;
	return url;
}

/** @param {Headers} headers */
function appendVary(headers) {
	const existing = headers.get("vary");
	if (!existing) {
		headers.set("vary", "Accept");
		return;
	}
	const has = existing
		.toLowerCase()
		.split(",")
		.map((s) => s.trim())
		.includes("accept");
	if (!has && existing.trim() !== "*") headers.set("vary", `${existing}, Accept`);
}

// A markdown twin fetched directly by its own URL (/slug.md, /path/index.md) is a
// duplicate of an HTML page. Point search engines at that page with an HTTP canonical
// rather than noindex, so AI agents that ask for the .md keep getting it.
/** @param {string} pathname */
function htmlTwinOf(pathname) {
	if (pathname.endsWith("/index.md")) return pathname.slice(0, -"index.md".length);
	if (pathname.endsWith(".md")) return `${pathname.slice(0, -".md".length)}/`;
	return null;
}

/** @param {{request: Request, next(): Promise<Response>, env: AssetEnvironment}} context */
export async function onRequest(context) {
	const { request, next, env } = context;
	const isGetLike = request.method === "GET" || request.method === "HEAD";

	if (wantsMarkdown(request)) {
		const url = new URL(request.url);
		for (const candidate of twinCandidates(url.pathname)) {
			const asset = await fetchAsset(env, pathUrl(candidate, url.origin));
			// Pages can answer missing assets with an HTML fallback and status 200.
			if (
				!(
					asset?.ok &&
					/^text\/(?:markdown|plain)(?:;|$)/i.test(asset.headers.get("content-type") || "")
				)
			)
				continue;

			const body = await asset.text();
			const headers = new Headers({
				"content-type": "text/markdown; charset=utf-8",
				vary: "Accept",
				"x-markdown-tokens": String(Math.ceil(body.length / CHARS_PER_TOKEN)),
				"x-content-type-options": "nosniff",
				"referrer-policy": "strict-origin-when-cross-origin",
				// This response is built here, so public/_headers does not reach it.
				"strict-transport-security": "max-age=31536000",
				link: '</llms.txt>; rel="alternate"; type="text/plain"; title="llms.txt"',
				"cache-control": "public, max-age=0, must-revalidate",
			});
			return new Response(request.method === "HEAD" ? null : body, { status: 200, headers });
		}
	}

	// Markdown wasn't requested, or this page has no twin. Serve HTML/asset as usual,
	// but tag every HTML page as negotiable so a shared cache keys on Accept and never
	// serves HTML to a markdown request (or vice versa).
	const res = await next();
	const htmlTwin = isGetLike && res.ok ? htmlTwinOf(new URL(request.url).pathname) : null;
	if (htmlTwin) {
		const headers = new Headers(res.headers);
		headers.append(
			"link",
			`<${pathUrl(htmlTwin, new URL(request.url).origin).href}>; rel="canonical"`,
		);
		return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
	}
	if (!(isGetLike && (res.headers.get("content-type") || "").includes("text/html"))) return res;
	const headers = new Headers(res.headers);
	appendVary(headers);
	return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
