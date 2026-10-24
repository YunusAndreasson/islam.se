/** Last `/`-separated segment of a path or glob key, extension stripped when
 *  `stripExt` is given ("../assets/images/foo.webp" → "foo"). Every caller's input
 *  is machine-generated (an `import.meta.glob` key or a site-relative URL), so it
 *  always contains a "/" — no fallback needed for the segment to be missing. */
export function basename(path: string, stripExt?: RegExp): string {
	const name = path.slice(path.lastIndexOf("/") + 1);
	return stripExt ? name.replace(stripExt, "") : name;
}

/** A page's address in the form it is served at: the trailing slash Cloudflare would
 *  otherwise 308 to. A file (a dot in the last segment), a query or a fragment is left as
 *  given. The breadcrumbs linked »/tradar« and »/om« as written, one redirect per click;
 *  the JSON-LD had normalised the same addresses all along. */
export function withTrailingSlash(url: string): string {
	if (/[?#]/.test(url) || url.endsWith("/") || basename(url).includes(".")) return url;
	return `${url}/`;
}
