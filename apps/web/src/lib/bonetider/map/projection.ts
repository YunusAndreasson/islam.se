// Closed-form Web Mercator (EPSG:3857, 512 px tiles) — geographic [lon, lat] → a
// normalised [0, 1] Mercator square. The Bönetider canvas fits Sweden's Mercator bbox
// into the card, so it only needs lon/lat → mercator and the inverse in y (the x inverse
// is a trivial linear map the renderer does inline). Ported from the app
// (src/lib/map/projection.ts), trimmed to what the web canvas uses.
const DEG = Math.PI / 180;
/** The Mercator latitude limit — beyond this, y → ±∞. */
const MAX_LAT = 85.05112878;

/** Longitude → normalised Mercator x in [0, 1]. */
export function mercX(lon: number): number {
	return (lon + 180) / 360;
}

/** Latitude → normalised Mercator y in [0, 1] (0 = north pole side, 1 = south). */
export function mercY(lat: number): number {
	const clamped = lat > MAX_LAT ? MAX_LAT : lat < -MAX_LAT ? -MAX_LAT : lat;
	const phi = clamped * DEG;
	return 0.5 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / (2 * Math.PI);
}

/** Normalised Mercator y → latitude (inverse Gudermannian). */
export function invMercY(my: number): number {
	const t = Math.exp((0.5 - my) * 2 * Math.PI);
	const phi = 2 * (Math.atan(t) - Math.PI / 4);
	return phi / DEG;
}
