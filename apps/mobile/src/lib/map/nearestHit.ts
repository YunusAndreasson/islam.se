// Which place a tap on a native map layer meant — shared by every tappable POI layer
// (mosques, burial grounds).
//
// THE BUG THIS FIXES: MosqueLayer used to take `features[0]`, and MapLibre's hit test
// returns EVERY feature whose rendered symbol meets a box around the touch point — in
// whatever order the query produced them, which is not distance order. So in Malmö (twelve
// mosques) or Rinkeby–Tensta, a tap could open a card for a mosque a centimetre from the
// finger rather than the one under it, and the two are indistinguishable to the reader: the
// card is confident, and the only clue is a name they did not aim at. The wider the hitbox
// the more often it happened, and at the zoom where the glyphs first appear the box covers
// kilometres of ground.
//
// The press event already carries where the finger actually landed, so the nearest hit is
// simply the right answer. Ties (two places at the same coordinates — the mosque dataset has
// near duplicates, see the sync guard's 150 m warning) keep the first, which is source order
// and therefore stable.
import type { LonLat } from '@/lib/coordinates';
import { haversineKm } from '@/lib/places/nearest';

/**
 * @param features The features MapLibre hit-tested, from the source's press event.
 * @param at The touch point, `[lon, lat]` — `event.nativeEvent.lngLat`.
 * @param byId The layer's records, keyed by the `id` each feature carries.
 */
export function nearestHit<T extends { readonly lat: number; readonly lng: number }>(
  features: readonly GeoJSON.Feature[] | undefined,
  at: LonLat,
  byId: ReadonlyMap<string, T>,
): T | undefined {
  if (!features?.length) return undefined;
  let best: T | undefined;
  let bestKm = Number.POSITIVE_INFINITY;
  for (const feature of features) {
    const id = feature.properties?.id;
    if (typeof id !== 'string') continue;
    const record = byId.get(id);
    if (!record) continue;
    // Measured against the RECORD's own coordinates, not the feature geometry's: they are
    // the same point (the layer's feature collection builds one from the other) and this
    // way a malformed or clustered geometry cannot decide which card opens.
    const km = haversineKm(at[1], at[0], record.lat, record.lng);
    if (km < bestKm) {
      bestKm = km;
      best = record;
    }
  }
  return best;
}
