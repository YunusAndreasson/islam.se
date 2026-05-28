// Snap an arbitrary coordinate to the closest Swedish populated place in the
// bundled dataset (PLACES). Used in two places:
//   • GPS resolves a raw fix → nearestPlace gives it a human label + a
//     marker location on the map.
//   • The picker offers a "use my GPS-snapped place" entry — same code path,
//     no separate geocoder needed (works offline, no API key).
// Brute-force great-circle distance over ~2,100 places is well under 1 ms on
// a phone, so no spatial index. Keep it that way.
import { PLACES, type SwedishPlace } from './data';

const EARTH_KM = 6371.0088;

/** Great-circle (haversine) distance in km between two lat/lon pairs. */
export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad;
  const dLon = (bLon - aLon) * toRad;
  const lat1 = aLat * toRad;
  const lat2 = bLat * toRad;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface NearestPlaceMatch {
  readonly place: SwedishPlace;
  /** Great-circle distance from the input coordinate, in km. */
  readonly distanceKm: number;
}

/** Closest place in PLACES to (lat, lon). Always returns a match — the dataset is non-empty. */
export function nearestPlace(lat: number, lon: number): NearestPlaceMatch {
  let bestIdx = 0;
  let bestKm = Number.POSITIVE_INFINITY;
  for (let i = 0; i < PLACES.length; i++) {
    const p = PLACES[i];
    const km = haversineKm(lat, lon, p.lat, p.lon);
    if (km < bestKm) {
      bestKm = km;
      bestIdx = i;
    }
  }
  return { place: PLACES[bestIdx], distanceKm: bestKm };
}
