// Real sun geometry for the map's twilight wash and the chrome's night factor.
//
// We show "night" by how far the sun actually sits below the horizon — its DEPRESSION —
// not by the prayer-time intervals. At Sweden's latitudes in summer the sky between Isha
// and Fajr is usually only nautical/astronomical twilight (a luminous blue), never true
// dark, and the darkness shades smoothly with latitude rather than switching at a line:
//
//   civil twilight   0–6°   below horizon — bright, readable outdoors
//   nautical         6–12°  — the blue hour, horizon fading
//   astronomical     12–18° — mostly dark, a faint glow
//   true night       >18°   — actually black
//
// The maximum depression a place reaches (at solar midnight) is 90° − latitude − declination,
// so on a late-May day Malmö only reaches ~13° (astronomical — a deep luminous blue, never
// black) while Kiruna reaches ~0.7° (barely dusk). Driving the wash by depression gives that
// gradient for free, and dissolves the polar boundary entirely.
//
// The maths is NOAA's low-precision solar position algorithm — accurate to a fraction of a
// degree, far finer than a colour wash needs. Declination and the equation of time vary only
// with the date, so they are computed once on the CPU and handed to the shader as uniforms;
// the per-pixel hour-angle → altitude step happens in the shader (mirrored by altitudeFrom
// here as the CPU twin the unit tests pin — there is no JS-thread consumer of it at runtime).

const DEG = Math.PI / 180;

export interface SolarParams {
  /** Solar declination, radians. */
  declRad: number;
  /** Equation of time, minutes (apparent − mean solar time). */
  eotMin: number;
}

/** Declination + equation of time for the instant's date (both drift slowly over a day). */
export function solarParams(date: Date): SolarParams {
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 0);
  // NOAA's fractional-year angle takes the INTEGER day-of-year plus a separate
  // (hour−12)/24 intra-day term. `date.getTime() − yearStart` already carries the
  // time of day, so it must be floored — otherwise the day fraction is counted
  // twice (≈1.5×), biasing declination/EoT by up to ~0.4° late in the UTC day.
  const dayOfYear = Math.floor((date.getTime() - yearStart) / 86_400_000);
  const hour = date.getUTCHours();
  const g = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (hour - 12) / 24);
  const declRad =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);
  const eotMin =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g));
  return { declRad, eotMin };
}

/** The polar daylight boundary visible on a Nordic map: a latitude north of which a
 *  sun-event-dependent prayer ceases to exist on this date. */
export interface PolarBoundary {
  /** Boundary latitude (°N). */
  lat: number;
  /** 'midnight-sun' (summer: sun never SETS) or 'polar-night' (winter: sun never RISES). */
  kind: 'midnight-sun' | 'polar-night';
}

/**
 * The midnight-sun / polar-night boundary for `date`, or null when it sits off the top of
 * the Swedish map (toward the equinoxes the boundary climbs past the pole).
 *
 * Derivation: a place's sun altitude at solar midnight is −cos(lat+δ); the sun *never sets*
 * once that stays above the −0.833° rise threshold (refraction + half the solar disc), i.e.
 * lat ≥ 90 − 0.833 − δ. By the mirror argument the sun *never rises* (its noon altitude
 * 90 − |lat−δ| stays below −0.833°) once lat ≥ 90 + 0.833 + δ (δ < 0 in winter). This is the
 * exact latitude where adhan stops resolving sunrise/fajr/maghrib/ishaʾ — verified against
 * the engine in polar-boundary.test.ts. Independent of longitude, so it maps to a perfectly
 * horizontal line.
 */
export function polarBoundaryFor(date: Date, maxLat = 71): PolarBoundary | null {
  const declDeg = solarParams(date).declRad / DEG;
  const lat = declDeg >= 0 ? 90 - 0.833 - declDeg : 90 + 0.833 + declDeg;
  if (!Number.isFinite(lat) || lat > maxLat) return null;
  return { lat, kind: declDeg >= 0 ? 'midnight-sun' : 'polar-night' };
}

/**
 * Sun altitude in degrees (negative = below the horizon) at a place and instant. The shader
 * computes the same thing per pixel from (declRad, eotMin, utcMinutes) uniforms — keep the
 * two in step.
 */
export function sunAltitudeDeg(latDeg: number, lonDeg: number, date: Date): number {
  const { declRad, eotMin } = solarParams(date);
  const utcMin = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  return altitudeFrom(latDeg, lonDeg, utcMin, declRad, eotMin);
}

/** NOAA true-solar-time → hour angle → altitude. Mirrored in WASH_SKSL. */
function altitudeFrom(
  latDeg: number,
  lonDeg: number,
  utcMin: number,
  declRad: number,
  eotMin: number,
): number {
  const tst = utcMin + eotMin + 4 * lonDeg; // true solar time, minutes (4 min per ° east)
  let ha = tst / 4 - 180; // hour angle, degrees (0 at solar noon)
  ha -= 360 * Math.floor((ha + 180) / 360); // normalise to (−180, 180]
  const latR = latDeg * DEG;
  const haR = ha * DEG;
  const sinAlt =
    Math.sin(latR) * Math.sin(declRad) + Math.cos(latR) * Math.cos(declRad) * Math.cos(haR);
  return Math.asin(Math.max(-1, Math.min(1, sinAlt))) / DEG;
}

// The depression → darkness ramp now lives with the wash it drives: the GPU shader's `dark`
// term in washShader.ts, mirrored on the CPU by washColorAt() in skia/washColor.ts (tested
// there). This module stays purely the sun's GEOMETRY (declination, EoT, altitude/hour angle).
