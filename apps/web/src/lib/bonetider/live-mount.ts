import type { NamedLocation } from "./settings";

/** The attributes scripts/bonetider-field.ts reads to keep a build-time readout live: the
 *  place it was built for, and `data-fixed` 0, which lets the reader's own saved place
 *  replace it. The mast's chip, the front page's day line and its sentence wrote these out
 *  by hand; the script falls back to Stockholm for any that is missing, so a drifted copy
 *  failed quietly. */
export function liveMountAttrs(place: NamedLocation): Record<`data-${string}`, string | number> {
	return {
		"data-name": place.name,
		"data-lat": place.latitude,
		"data-lon": place.longitude,
		"data-fixed": "0",
	};
}
