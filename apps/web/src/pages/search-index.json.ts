import { buildPaletteIndex } from "../lib/palette";

// The command palette's search index, as its own file rather than a JSON island in
// every document. Inlined it measured 47 311 B of each page's HTML — re-sent on every
// navigation and never cacheable on its own — for a pane that only exists once the
// reader types. The palette's browse menu stays server-rendered markup, so nothing
// crawlable moved here.
export async function GET() {
	const index = await buildPaletteIndex();
	return new Response(JSON.stringify(index), {
		headers: { "content-type": "application/json; charset=utf-8" },
	});
}
