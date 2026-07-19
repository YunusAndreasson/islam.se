// The pure core of "which coordinate (and what label) do we compute prayer times
// for, given the user's location settings". Extracted from LocationProvider so the
// exact same manual → cached-GPS → Stockholm fallback runs in two places without
// drifting: the React context (live, inside the app) and the home-screen widget's
// timeline builder (outside React, where there are no hooks). Keeping it framework-
// free also makes the resolution table trivially unit-testable.
import { isValidLatLng } from '../coordinates';
import type { SwedishPlace } from '../places/data';
import { nearestPlace } from '../places/nearest';
import type { LatLng } from '../prayer-times';
import { DEFAULT_COORDS, type LocationMode, type NamedLocation } from '../settings/types';

/** Where the resolved coordinate came from — drives the Inställningar status line. */
export type LocationSource = 'manual' | 'gps' | 'default';

export interface ResolvedLocation {
  /** The coordinate to feed adhan. */
  coords: LatLng;
  /** A human label (city name in manual mode, the snapped tätort in GPS mode,
   *  "Stockholm (standard)" while no fix is in). */
  label: string;
  source: LocationSource;
  /** The Swedish tätort `coords` snaps to. Drives the map marker label. */
  place: SwedishPlace;
}

/**
 * Resolve the prayer-time coordinate from the location-relevant settings plus the
 * current GPS fix (or null if none yet).
 *  – manual  → the chosen city's coordinate, labelled by its name.
 *  – gps     → the raw fix (precise; prayer times drift seconds per km), labelled
 *              by the nearest tätort.
 *  – neither → Stockholm, so the screen and widget are never blank or NaN'd.
 */
export function resolveLocation(
  locationMode: LocationMode,
  manualLocation: NamedLocation | null,
  gpsCoords: LatLng | null,
): ResolvedLocation {
  if (locationMode === 'manual') {
    const loc: NamedLocation =
      manualLocation && isValidLatLng(manualLocation) ? manualLocation : DEFAULT_COORDS;
    const coords = { latitude: loc.latitude, longitude: loc.longitude };
    // In manual mode the chosen tätort IS the place — snap so the marker sits on the
    // canonical centre even if the stored coords drifted (older rounded picker entry).
    const snapped = nearestPlace(coords.latitude, coords.longitude).place;
    return { coords, label: loc.name, source: 'manual', place: snapped };
  }
  if (gpsCoords && isValidLatLng(gpsCoords)) {
    const snapped = nearestPlace(gpsCoords.latitude, gpsCoords.longitude).place;
    return { coords: gpsCoords, label: snapped.name, source: 'gps', place: snapped };
  }
  const fallback = nearestPlace(DEFAULT_COORDS.latitude, DEFAULT_COORDS.longitude).place;
  return {
    coords: { latitude: DEFAULT_COORDS.latitude, longitude: DEFAULT_COORDS.longitude },
    label: `${DEFAULT_COORDS.name} (standard)`,
    source: 'default',
    place: fallback,
  };
}
