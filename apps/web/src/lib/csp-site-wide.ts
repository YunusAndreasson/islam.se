// Makes the Content-Security-Policy's hash lists site-wide, after the build.
//
// Astro emits the policy per page, as a <meta>, hashing the inline <style> and <script>
// elements THAT page carries. A meta policy is fixed for the life of the document, and
// <ClientRouter /> never replaces the document: it swaps the next page's head and body
// into the one already open. So every inline stylesheet or script the next page brings
// is judged by the policy of the page the reader FIRST landed on — and refused unless
// that page happened to carry the same bytes. Measured on a build: a click from /om/ to
// /essaer/ rendered /essaer/ with no stylesheet at all, and ~80 % of random page pairs
// lost styles the same way. Astro documents ClientRouter as unsupported under CSP; this
// is the missing half.
//
// The fix is the one astro.config.ts already said it wanted — "the hash set is site-wide
// by design" — made true: collect every inline hash the build emitted and give every
// page all of them. The set is small (tens of hashes, the site has few distinct inline
// blocks), deterministic, and appending is idempotent, so the nightly incremental
// deploy still uploads only the files whose bytes really changed.

import { createHash } from "node:crypto";

const META = /<meta http-equiv="content-security-policy" content="([^"]*)">/;

function sha256(text: string): string {
	return `sha256-${createHash("sha256").update(text, "utf8").digest("base64")}`;
}

/** Hashes of the inline <style> and executable inline <script> elements in one page.
 *  JSON islands (application/ld+json, application/json) are data, never executed, so
 *  the browser does not check them against script-src. */
export function inlineHashes(html: string): { styles: string[]; scripts: string[] } {
	const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((m) =>
		sha256(m[1] ?? ""),
	);
	const scripts: string[] = [];
	for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
		const attrs = m[1] ?? "";
		const body = m[2] ?? "";
		if (/\bsrc=/.test(attrs) || /type="application\/(ld\+)?json"/.test(attrs) || body === "")
			continue;
		scripts.push(sha256(body));
	}
	return { styles, scripts };
}

/** Appends to one directive every hash it does not already list, in the given order. */
function widenDirective(policy: string, name: string, hashes: readonly string[]): string {
	return policy
		.split(";")
		.map((directive) => {
			const [head] = directive.trim().split(/\s+/);
			if (head !== name) return directive;
			const missing = hashes.filter((h) => !directive.includes(`'${h}'`));
			return missing.length ? `${directive} ${missing.map((h) => `'${h}'`).join(" ")}` : directive;
		})
		.join(";");
}

/** The page with its policy widened to the site-wide hash sets. Unchanged when the page
 *  has no policy or already lists everything. `styles`/`scripts` must be sorted by the
 *  caller so every page gets the same order and a rebuild the same bytes. */
export function widenPolicy(
	html: string,
	styles: readonly string[],
	scripts: readonly string[],
): string {
	const match = META.exec(html);
	if (!match?.[1]) return html;
	const policy = match[1];
	const widened = widenDirective(
		widenDirective(policy, "style-src", styles),
		"script-src",
		scripts,
	);
	if (widened === policy) return html;
	const tag = match[0].replace(policy, () => widened);
	return html.replace(match[0], () => tag);
}
