// Snap an arbitrary coordinate to the closest Swedish populated place in the
// bundled dataset (PLACES). Used in two places:
//   • GPS resolves a raw fix → nearestPlace gives it a human label + a
//     marker location on the map.
//   • The picker offers a "use my GPS-snapped place" entry — same code path,
//     no separate geocoder needed (works offline, no API key).
// Brute-force great-circle distance over ~2,100 places is well under 1 ms on
// a phone, so no spatial index. Keep it that way.
import { haversineKm, isValidLatLng } from '@/lib/coordinates';
import type { SwedishPlace } from './data';

export { haversineKm } from '@/lib/coordinates';

/** The bundled gazetteer is first needed on a location match or when the picker opens. */
export function getPlaces() {
  const { PLACES } = require('./data') as typeof import('./data');
  return PLACES;
}

/** Preserve the catalogue identity in settings, including across process restarts. */
export function namedPlace(p: SwedishPlace) {
  return { name: p.name, county: p.county, population: p.population, latitude: p.lat, longitude: p.lon };
}

export function placeTitle(place: { name: string; county?: string }) {
  return place.county && getPlaces().filter(p => p.name === place.name).length > 1
    ? `${place.name}, ${place.county}` : place.name;
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
  const places = getPlaces();
  let best: SwedishPlace = places[0];
  let bestKm = haversineKm(lat, lon, best.lat, best.lon);
  for (const candidate of places) {
    const km = haversineKm(lat, lon, candidate.lat, candidate.lon);
    if (km < bestKm) {
      bestKm = km;
      best = candidate;
    }
  }
  return { place: best, distanceKm: bestKm };
}
