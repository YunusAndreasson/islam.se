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

function wantsMarkdown(request) {
	if (request.method !== "GET" && request.method !== "HEAD") return false;
	const accept = request.headers.get("accept") || "";
	return /\btext\/markdown\b/i.test(accept);
}

// Where a given page's markdown twin lives, most-specific first.
function twinCandidates(pathname) {
	if (pathname.endsWith("/")) {
		const candidates = [`${pathname}index.md`]; // /foo/ -> /foo/index.md ; / -> /index.md
		if (pathname !== "/") candidates.push(`${pathname.slice(0, -1)}.md`); // /foo/ -> /foo.md (essays)
		return candidates;
	}
	return [`${pathname}.md`, `${pathname}/index.md`];
}

function fetchAsset(env, assetUrl) {
	const req = new Request(assetUrl, { method: "GET", headers: { accept: "*/*" } });
	if (env.ASSETS && typeof env.ASSETS.fetch === "function") return env.ASSETS.fetch(req);
	return fetch(req);
}

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
	if (!has) headers.set("vary", `${existing}, Accept`);
}

export async function onRequest(context) {
	const { request, next, env } = context;
	const isGetLike = request.method === "GET" || request.method === "HEAD";

	if (wantsMarkdown(request)) {
		const url = new URL(request.url);
		for (const candidate of twinCandidates(url.pathname)) {
			const asset = await fetchAsset(env, new URL(candidate, url.origin));
			if (!asset.ok) continue;

			const body = await asset.text();
			const headers = new Headers({
				"content-type": "text/markdown; charset=utf-8",
				vary: "Accept",
				"x-markdown-tokens": String(Math.ceil(body.length / CHARS_PER_TOKEN)),
				"x-content-type-options": "nosniff",
				"referrer-policy": "strict-origin-when-cross-origin",
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
	if (!(isGetLike && (res.headers.get("content-type") || "").includes("text/html"))) return res;
	const headers = new Headers(res.headers);
	appendVary(headers);
	return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
