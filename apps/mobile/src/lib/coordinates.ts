// The app's coordinate vocabulary. Two shapes exist and they disagree about order,
// which is the whole reason this module is worth having.
import type { LatLng } from './prayer-times';

/**
 * A map point as `[longitude, latitude]` — GeoJSON, MapLibre and Mercator order, which
 * is the REVERSE of how `LatLng` spells the same point.
 *
 * The labels do not make TypeScript reject a swapped pair (tuple labels are
 * documentation, not identity), and they cannot: both members are plain numbers. What
 * they do is put the intended order on hover at every call site, and — more usefully —
 * give the conversion between the two shapes a name. A swap is not a crash. Sweden's
 * coordinates transposed land in Somalia, so a swapped pair renders a perfectly
 * confident line in the wrong hemisphere, and the only cheap defence is to write the
 * ordering ONCE, here, instead of hand-spelling `[c.longitude, c.latitude]` at each of
 * the boundaries where the two shapes meet.
 */
export type LonLat = [lon: number, lat: number];

/** `LatLng` → the `[lon, lat]` order MapLibre, GeoJSON and the Mercator helpers want. */
export function lonLatOf(c: LatLng): LonLat {
  return [c.longitude, c.latitude];
}

/** `[lon, lat]` → the `{ latitude, longitude }` shape adhan and the prayer maths want. */
export function latLngOf(p: LonLat): LatLng {
  return { latitude: p[1], longitude: p[0] };
}

/** True only for finite coordinates that lie on the globe. */
export function isValidLatLng(value: unknown): value is LatLng {
  if (typeof value !== 'object' || value === null) return false;
  const { latitude, longitude } = value as Record<string, unknown>;
  return (
    typeof latitude === 'number' &&
    Number.isFinite(latitude) &&
    Math.abs(latitude) <= 90 &&
    typeof longitude === 'number' &&
    Number.isFinite(longitude) &&
    Math.abs(longitude) <= 180
  );
}
