// The pure core of "which coordinate (and what label) do we compute prayer times
// for, given the user's location settings". Extracted from LocationProvider so the
// exact same manual → cached-GPS → Stockholm fallback runs in two places without
// drifting: the React context (live, inside the app) and the home-screen widget's
// timeline builder (outside React, where there are no hooks). Keeping it framework-
// free also makes the resolution table trivially unit-testable.
import { isValidLatLng } from '@/lib/coordinates';
import type { SwedishPlace } from '@/lib/places/data';
import { nearestPlace } from '@/lib/places/nearest';
import type { LatLng } from '@/lib/prayer-times';
import { DEFAULT_COORDS, type LocationMode, type NamedLocation } from '@/lib/settings/types';

/** Where the resolved coordinate came from — drives the Inställningar status line. */
export type LocationSource = 'manual' | 'gps' | 'default';

export interface ResolvedLocation {
  /** The coordinate to feed adhan. */
  coords: LatLng;
  /** A human label (city name in manual mode, the snapped tätort in GPS mode,
   *  "Stockholm (standard)" while no fix is in). */
  label: string;
  source: LocationSource;
  /** A nearby Swedish tätort, when the fix is close enough to name honestly. */
  place: SwedishPlace | null;
}

// Offline GPS labels come from the bundled Swedish place list. Beyond this distance the
// nearest entry is not a useful description (a California fix previously became
// "Karesuando"), so keep the precise coordinate but call it simply "Din plats".
const MAX_PLACE_LABEL_DISTANCE_KM = 100;

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
    const nearest = nearestPlace(gpsCoords.latitude, gpsCoords.longitude);
    if (nearest.distanceKm <= MAX_PLACE_LABEL_DISTANCE_KM) {
      return { coords: gpsCoords, label: nearest.place.name, source: 'gps', place: nearest.place };
    }
    return { coords: gpsCoords, label: 'Din plats', source: 'gps', place: null };
  }
  const fallback = nearestPlace(DEFAULT_COORDS.latitude, DEFAULT_COORDS.longitude).place;
  return {
    coords: { latitude: DEFAULT_COORDS.latitude, longitude: DEFAULT_COORDS.longitude },
    label: `${DEFAULT_COORDS.name} (standard)`,
    source: 'default',
    place: fallback,
  };
}
