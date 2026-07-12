/** Memoize a zero-arg async builder so it runs once per build and every caller
 *  awaits the same shared promise. Content is immutable during a build but the
 *  builders (articles, tänkare, the citation index) are each called many times
 *  across the 2000+ generated pages — without this they'd rebuild on every call.
 *  The promise (not the resolved value) is cached, so concurrent first callers
 *  share the one in-flight build instead of racing to start their own. */
export function memoize<T>(build: () => Promise<T>): () => Promise<T> {
	let cache: Promise<T> | null = null;
	return () => (cache ??= build());
}
