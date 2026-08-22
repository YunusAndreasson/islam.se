// /nyheter/ — the built page, with the live list injected at the edge.
//
// The news itself is not a set of pages on this site: there is no URL per item,
// no sitemap entry, no OG card. That is deliberate — a few thousand
// machine-translated third-party news pages a year would be exposure for the
// whole domain, and the doctrinal pages are what this site is for.
//
// But a page whose entire content arrives by `fetch()` after load is a page a
// crawler sees empty, so this Function renders the current list into the real
// built HTML. Nothing about the layout is reimplemented here: it fetches the
// page Astro built — head, fonts, theme script, mast, footer and all — and
// rewrites one empty `<ol>` inside it. The only thing that lives in this file
// is the fetch and the injection.
//
// Every failure path returns the built page untouched, and the client script
// fills the list instead. A news band is never worth a 500 on a reference site.

import { FEED_URL, FONSTER_H, inomFonster, listaHtml, statusHtml } from "./_nyheter.js";

/** Long enough that a slow origin cannot hold a page render, short enough that
 *  the reader never notices. The list is progressive enhancement: if this
 *  budget is missed the client fills in a moment later. */
const FEED_TIMEOUT_MS = 2500;

/** The edge holds a render for five minutes. zuhd publishes five times a day,
 *  so this is two orders of magnitude tighter than the content actually moves —
 *  it is sized for "a reader who reloads sees the same thing", not for freshness. */
const PAGE_TTL = "public, max-age=300, stale-while-revalidate=3600";

async function hamtaSidan(context) {
	const { env, request } = context;
	const url = new URL(request.url);
	// ASSETS serves the built file directly, bypassing Functions. A plain
	// `fetch()` of our own origin would re-enter this handler and loop, so
	// there is deliberately no fetch fallback here.
	if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
		return env.ASSETS.fetch(
			new Request(new URL("/nyheter/", url.origin), { headers: request.headers }),
		);
	}
	return context.next();
}

/**
 * @param {string} url  `env.NYHETER_FEED` when set, so the endpoint can be
 *   repointed — at a local file while developing, or at a mirror — without a
 *   deploy. Unset in production, which is the constant in `_nyheter.js`.
 */
async function hamtaFlodet(url) {
	const styr = new AbortController();
	const timer = setTimeout(() => styr.abort(), FEED_TIMEOUT_MS);
	try {
		const res = await fetch(url, {
			signal: styr.signal,
			headers: { accept: "application/json" },
			// zuhd sets its own cache headers; this makes the edge honour them for
			// us so a busy hour is one origin fetch, not one per reader.
			cf: { cacheTtl: 300, cacheEverything: true },
		});
		if (!res.ok) return null;
		const data = await res.json();
		return Array.isArray(data?.artiklar) ? data.artiklar : null;
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

export async function onRequest(context) {
	const { request } = context;
	if (request.method !== "GET" && request.method !== "HEAD") return context.next();

	// ⚠️ hamtaSidan is wrapped because Promise.all rejects on the first rejection, and a
	// rejection here becomes a Cloudflare 500 on /nyheter/. hamtaFlodet swallows its own
	// failures; this one did not, so an ASSETS hiccup would have taken the page down —
	// against this file's own rule that a news band is never worth a 500 on a reference site.
	const [sida, artiklar] = await Promise.all([
		hamtaSidan(context).catch(() => null),
		hamtaFlodet(context.env?.NYHETER_FEED || FEED_URL),
	]);
	if (!sida) return context.next();

	if (!(sida?.ok && (sida.headers.get("content-type") || "").includes("text/html"))) {
		return sida ?? context.next();
	}
	// No payload, or nothing inside the day: leave the built page as it is. Its
	// list is empty and its fallback copy is already in the markup, so the page
	// is coherent on its own — and the client script still gets its turn.
	if (!artiklar) return sida;

	const nu = Date.now();
	const iFonster = inomFonster(artiklar, nu, FONSTER_H);
	if (iFonster.length === 0) return sida;

	const headers = new Headers(sida.headers);
	headers.set("cache-control", PAGE_TTL);
	// ⚠️ HTMLRewriter lengthens the body, so the upstream entity headers no longer describe
	// it. Carrying content-length forward asserts the old byte count over the new bytes, and
	// content-encoding claims an encoding the rewritten stream does not have.
	headers.delete("content-length");
	headers.delete("content-encoding");

	const rewritten = new HTMLRewriter()
		.on("#nyheter-lista", {
			element(el) {
				el.setInnerContent(listaHtml(iFonster, { variant: "full", now: nu }), { html: true });
				// The client reads this to know the list is already rendered, so it
				// re-labels relative times instead of re-fetching and re-painting.
				el.setAttribute("data-nyheter-kalla", "edge");
				el.removeAttribute("aria-busy");
			},
		})
		// The section is authored hidden so a JS-only render never leaves an empty
		// frame on the page. Once the edge has filled it, it is real content.
		// How much is here and how fresh it is. Rendered at the edge with the list
		// rather than left to the client: it is the first thing the reader looks at
		// on a news page, and a count that pops in a second after the notices it
		// counts is worse than one that was always there.
		.on("#nyheter-status", {
			element(el) {
				el.setInnerContent(statusHtml(iFonster, nu), { html: true });
				el.removeAttribute("hidden");
			},
		})
		.on("#nyheter-sektion", {
			element(el) {
				el.removeAttribute("hidden");
			},
		})
		.on("#nyheter-tom", {
			element(el) {
				el.setAttribute("hidden", "");
			},
		})
		.transform(new Response(sida.body, { status: sida.status, headers }));

	return rewritten;
}
