import type { GeolocateControl } from "maplibre-gl";

// What a »use my location« button says while it waits and when it fails. Two buttons ask
// for the reader's position, the prayer times' (bonetider-field.ts) and the mosque map's
// (moskeer-map.ts); they called it »plats« and »position«, and only one of them told a
// reader who had refused access why nothing happened.

export const LOCATING = "Hämtar din plats …";

/** `code` is the GeolocationPositionError's: 1 is PERMISSION_DENIED. Either way the
 *  search beside the button is the way on. */
export function locationFailed(code?: number): string {
	return code === 1
		? "Platsåtkomst nekades. Sök efter din ort i stället."
		: "Kunde inte hitta din plats. Sök efter din ort i stället.";
}

/** MapLibre only emits a result event if its one-shot geolocation request actually starts. */
export function requestMapLocation(
	control: Pick<GeolocateControl, "trigger">,
	button: Pick<HTMLButtonElement, "ariaBusy">,
	status: Pick<HTMLElement, "textContent"> | null,
): void {
	if (button.ariaBusy === "true") return;
	button.ariaBusy = "true";
	if (status) status.textContent = LOCATING;
	try {
		if (control.trigger()) return;
	} catch {
		// A browser without navigator.geolocation can throw synchronously.
	}
	button.ariaBusy = null;
	if (status) status.textContent = locationFailed();
}
