/** Great-circle distance in km between two lat/lon points (haversine). Shared by
 *  the bönetider "nearby towns" neighbour index and the moskeer proximity search,
 *  which previously kept byte-identical copies. */
export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
	const R = 6371;
	const dLat = ((bLat - aLat) * Math.PI) / 180;
	const dLon = ((bLon - aLon) * Math.PI) / 180;
	const la1 = (aLat * Math.PI) / 180;
	const la2 = (bLat * Math.PI) / 180;
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
	return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface LatLon {
	lat: number;
	lon: number;
}

// »Nearest« is always by great-circle distance, never by flat lat/lon: a degree of
// longitude shrinks fast toward northern Sweden (43 km at Kiruna against 111 for a degree
// of latitude), so a flat comparison misjudges which town or mosque is closest up there.
// Four places kept their own loop for this; a place passes itself as its point.

/** `items` nearest first, each with its distance in km from `from`. */
export function byDistance<T>(
	items: readonly T[],
	from: LatLon,
	at: (item: T) => LatLon,
): { item: T; km: number }[] {
	return items
		.map((item) => {
			const p = at(item);
			return { item, km: haversineKm(from.lat, from.lon, p.lat, p.lon) };
		})
		.sort((a, b) => a.km - b.km);
}

/** The item nearest `from`, in one pass; undefined for an empty list. */
export function nearest<T>(
	items: readonly T[],
	from: LatLon,
	at: (item: T) => LatLon,
): T | undefined {
	let best: T | undefined;
	let bestKm = Number.POSITIVE_INFINITY;
	for (const item of items) {
		const p = at(item);
		const km = haversineKm(from.lat, from.lon, p.lat, p.lon);
		if (km < bestKm) {
			bestKm = km;
			best = item;
		}
	}
	return best;
}
