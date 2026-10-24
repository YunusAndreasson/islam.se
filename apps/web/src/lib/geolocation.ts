// What a »use my location« button says while it waits and when it fails. Two buttons ask
// for the reader's position, the prayer times' (bonetider-field.ts) and the mosque map's
// (moskeer-map.ts); they called it »plats« and »position«, and only one of them told a
// reader who had refused access why nothing happened.

export const LOCATING = "Hämtar din plats …";

/** `code` is the GeolocationPositionError's: 1 is PERMISSION_DENIED. Either way the
 *  search beside the button is the way on. */
export function locationFailed(code: number): string {
	return code === 1
		? "Platsåtkomst nekades. Sök efter din ort i stället."
		: "Kunde inte hitta din plats. Sök efter din ort i stället.";
}
