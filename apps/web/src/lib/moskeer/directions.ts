import type { Mosque } from "./index";

export interface DirectionsLinks {
	google: string;
	apple: string;
	geo: string;
}

/** Deep links that open the NATIVE Maps app for turn-by-turn on mobile (and the web map
 *  on desktop). Google's `dir/?api=1` and Apple's `maps.apple.com` both hand off to the
 *  installed app; `geo:` is the Android fallback. */
export function directionsLinks(m: Pick<Mosque, "lat" | "lng" | "name">): DirectionsLinks {
	const dest = `${m.lat},${m.lng}`;
	const q = encodeURIComponent(m.name);
	return {
		google: `https://www.google.com/maps/dir/?api=1&destination=${dest}`,
		apple: `https://maps.apple.com/?daddr=${dest}&q=${q}`,
		geo: `geo:${dest}?q=${dest}(${q})`,
	};
}
