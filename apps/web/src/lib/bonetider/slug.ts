// Swedish-aware slugify for URL segments. The Swedish letters get their conventional
// ASCII forms (å/ä → a, ö → o, like how people type a search), then any remaining
// diacritics are stripped via NFD, and everything else collapses to single hyphens.
//   "Härnösand"        → "harnosand"
//   "Västra Götaland"  → "vastra-gotaland"
//   "Mariefred"        → "mariefred"
// Kept tiny + pure so the city-page getStaticPaths and the ⌘K palette index can share
// one canonical slug for every place.
export function slugify(input: string): string {
	return (
		input
			.toLowerCase()
			.replace(/å/g, "a")
			.replace(/ä/g, "a")
			.replace(/ö/g, "o")
			.replace(/ø/g, "o")
			.replace(/æ/g, "ae")
			.replace(/ü/g, "u")
			// Drop any other combining diacritics (é, è, ï, …) after decomposition.
			.normalize("NFD")
			.replace(/[̀-ͯ]/g, "")
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
	);
}
