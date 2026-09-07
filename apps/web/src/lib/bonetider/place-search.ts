import { fold } from "../search-text";

export interface PlaceSearchEntry {
	name: string;
	county: string;
	href: string;
}

/** Normalize the directory once; accents and county qualifiers work across every query. */
export function createPlaceSearch(entries: readonly PlaceSearchEntry[]) {
	const prepared = entries.map((entry) => ({
		entry,
		name: fold(entry.name),
		text: fold(`${entry.name} ${entry.county}`),
	}));
	return (query: string): PlaceSearchEntry[] => {
		const q = fold(query.trim());
		if (!q) return [];
		const words = q.split(/\s+/);
		return prepared
			.filter((p) => words.every((word) => p.text.includes(word)))
			.map((p) => ({ ...p, rank: p.name === q ? 0 : p.name.startsWith(q) ? 1 : 2 }))
			.sort((a, b) => a.rank - b.rank || a.entry.name.localeCompare(b.entry.name, "sv"))
			.map((p) => p.entry);
	};
}
