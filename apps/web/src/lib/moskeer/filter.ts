// THE MOSQUE DIRECTORY'S FILTER: one rule for the list (scripts/moskeer-view.ts, which
// serves while the map loads and when it never does) and the map (scripts/moskeer-map.ts).
// Each had written its own, and they drifted: the list took a linked ?lan= unchecked, so
// an unknown one left the picker blank over an empty list, and both matched the whole
// query as one string, so »moské blekinge« found nothing where place search finds a place
// by any of its words (lib/bonetider/place-search.ts).
import { fold } from "../search-text";

/** The folded words of what the reader typed. */
export function queryTerms(raw: string): string[] {
	return fold(raw.trim()).split(/\s+/).filter(Boolean);
}

/** Is a place shown: in the chosen län, or none is chosen, and every word of the query
 *  found in its folded haystack. */
export function matchesFilter(
	haystack: string,
	placeLan: string | undefined,
	terms: readonly string[],
	lan: string,
): boolean {
	return (lan === "" || placeLan === lan) && terms.every((term) => haystack.includes(term));
}

/** The filter a link carries (?q=, ?lan=); the län only when the picker offers it. */
export function filterFromUrl(
	search: string,
	lans: readonly string[],
): { raw: string; lan: string } {
	const params = new URLSearchParams(search);
	const lan = params.get("lan") ?? "";
	return { raw: params.get("q") ?? "", lan: lans.includes(lan) ? lan : "" };
}

/** The page's address with the filter in it, so a filtered directory can be linked,
 *  bookmarked and reloaded: the raw typed string, not the folded one (»?q=malmö«). */
export function urlWithFilter(href: string, raw: string, lan: string): string {
	const url = new URL(href);
	if (raw) url.searchParams.set("q", raw);
	else url.searchParams.delete("q");
	if (lan) url.searchParams.set("lan", lan);
	else url.searchParams.delete("lan");
	return url.href;
}
