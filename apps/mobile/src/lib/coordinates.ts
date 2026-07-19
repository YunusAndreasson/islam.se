import type { LatLng } from './prayer-times';

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
