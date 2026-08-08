/** Last `/`-separated segment of a path or glob key, extension stripped when
 *  `stripExt` is given ("../assets/images/foo.webp" → "foo"). Every caller's input
 *  is machine-generated (an `import.meta.glob` key or a site-relative URL), so it
 *  always contains a "/" — no fallback needed for the segment to be missing. */
export function basename(path: string, stripExt?: RegExp): string {
	const name = path.slice(path.lastIndexOf("/") + 1);
	return stripExt ? name.replace(stripExt, "") : name;
}
