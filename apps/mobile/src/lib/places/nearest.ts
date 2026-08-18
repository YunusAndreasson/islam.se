// Snap an arbitrary coordinate to the closest Swedish populated place in the
// bundled dataset (PLACES). Used in two places:
//   • GPS resolves a raw fix → nearestPlace gives it a human label + a
//     marker location on the map.
//   • The picker offers a "use my GPS-snapped place" entry — same code path,
//     no separate geocoder needed (works offline, no API key).
// Brute-force great-circle distance over ~2,100 places is well under 1 ms on
// a phone, so no spatial index. Keep it that way.
import { isValidLatLng } from '@/lib/coordinates';
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
  if (!isValidLatLng({ latitude: lat, longitude: lon })) {
    throw new RangeError('nearestPlace requires finite latitude/longitude within ±90/±180');
  }
  // Seeded from PLACES[0] rather than tracked as an index: PLACES is a non-empty tuple
  // (see ./data.ts), so element 0 is known to exist and `best` is a SwedishPlace the whole
  // way through — the "always returns a match" contract holds by construction instead of
  // by a re-read the compiler has to take on faith.
  let best: SwedishPlace = PLACES[0];
  let bestKm = haversineKm(lat, lon, best.lat, best.lon);
  for (const candidate of PLACES) {
    const km = haversineKm(lat, lon, candidate.lat, candidate.lon);
    if (km < bestKm) {
      bestKm = km;
      best = candidate;
    }
  }
  return { place: best, distanceKm: bestKm };
}
