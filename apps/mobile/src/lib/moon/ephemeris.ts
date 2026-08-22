// Where the Moon actually is, for the reader's own place.
//
// THE ONLY FILE IN THE APP THAT IMPORTS `astronomy-engine`. Everything above this speaks the
// app's own vocabulary — degrees, Dates, LatLng — so the library stays a swappable
// implementation detail rather than a shape the screens are written against.
//
// Why a library at all, in a codebase that hand-rolls its sun (lib/solar/sun.ts) and its
// calendar (lib/hijri.ts). Those two are closed-form and stay honest at a fraction of a
// degree, which is all a colour wash or a date needs. The Moon here is asked much harder
// questions: a TOPOCENTRIC position (the Moon is close enough that parallax moves it by up
// to a degree — more than the whole crescent-visibility margin), rise and set at 68°N where
// the naive hour-angle solution simply has no root, and the instant of conjunction to the
// minute. astronomy-engine answers all three to ~1 arcminute, is MIT, has no dependencies
// and touches no platform API, so it runs under Hermes and under Jest unchanged.
//
// Cost, stated so nobody has to go and measure it: 421 KB of source, 135 KB minified. That
// is real, and it is the smaller half of the bundled Material Symbols font this app already
// ships for its icons.
import * as Astronomy from 'astronomy-engine';

import type { LatLng } from '@/lib/prayer-times';

const DAY_MS = 86_400_000;
const DEG = Math.PI / 180;

/** Search windows. A synodic month is 29.53 days, so 45 either side always brackets a
 *  conjunction with room to spare — the searches below are bisections, not scans, so a
 *  generous window costs almost nothing. */
const LUNATION_WINDOW_DAYS = 45;

const observerFor = (coords: LatLng): Astronomy.Observer =>
  new Astronomy.Observer(coords.latitude, coords.longitude, 0);

/** 0–360. */
function norm360(deg: number): number {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

/** Topocentric horizontal position of a body, refraction included — what the eye sees,
 *  not where the geometry puts it. */
function horizonOf(body: Astronomy.Body, at: Date, observer: Astronomy.Observer): Astronomy.HorizontalCoordinates {
  const eq = Astronomy.Equator(body, at, observer, true, true);
  return Astronomy.Horizon(at, observer, eq.ra, eq.dec, 'normal');
}

/**
 * The angle from straight up to the middle of the Moon's bright limb, in degrees CLOCKWISE,
 * for someone standing here and looking at it. This is the whole "Nordic tilt": the same
 * three-day crescent is a shallow bowl over Mecca and stands nearly on end over Kiruna, and
 * a moon drawn with its horns in a fixed place is wrong everywhere except by accident.
 *
 * It is computed in the LOCAL HORIZONTAL frame rather than through the usual equatorial
 * bright-limb position angle minus the parallactic angle (Meeus 48.5 + 14.1). Same answer,
 * but this form is checkable by eye and by test: the bright limb points AT THE SUN, so the
 * angle is just the bearing from the Moon to the Sun across the sky dome. Facing the Moon,
 * azimuth increases to your right, and up is up — which is already React Native's rotation
 * convention, so the value can be handed straight to a transform with no sign to get wrong.
 */
function brightLimbAngle(
  moon: Astronomy.HorizontalCoordinates,
  sun: Astronomy.HorizontalCoordinates,
): number {
  const dAz = (sun.azimuth - moon.azimuth) * DEG;
  const am = moon.altitude * DEG;
  const as = sun.altitude * DEG;
  const y = Math.cos(as) * Math.sin(dAz);
  const x = Math.cos(am) * Math.sin(as) - Math.sin(am) * Math.cos(as) * Math.cos(dAz);
  return norm360(Math.atan2(y, x) / DEG);
}

/** How the Moon LOOKS from one place at one instant — everything a drawing of it needs, and
 *  nothing that costs a search. Split out from {@link MoonSky} because the map's nav disc
 *  wants exactly this and nothing else, and the age it does not want is the expensive half. */
export interface MoonAppearance {
  /** Fraction of the disc lit, 0–1. */
  illumination: number;
  /** 0–360°: the Moon's elongation from the Sun in ecliptic longitude. 0 = new, 90 = first
   *  quarter, 180 = full, 270 = last quarter. Monotonic through the month, which is what
   *  makes it the right thing to band on — the illuminated fraction is not (it rises and
   *  falls, so 60 % happens twice). */
  phaseAngle: number;
  waxing: boolean;
  /** Degrees clockwise from screen-up to the bright limb, as seen from here. */
  limbAngle: number;
  /** Topocentric azimuth (0 = north, 90 = east) and altitude, degrees, refraction included. */
  azimuth: number;
  altitude: number;
  /** Apparent angular diameter, degrees. Feeds the crescent-width term in lib/moon/visibility. */
  diameterDeg: number;
}

/** The Moon as it stands over one place at one instant, with its age. */
export interface MoonSky extends MoonAppearance {
  /** Days since the last conjunction — the Moon's real age, against which the arithmetic
   *  calendar can be seen to have drifted. */
  ageDays: number;
}

/**
 * Everything a drawing needs: four library calls, no searches.
 *
 * The age is what costs — {@link lastNewMoon} walks conjunctions and is over half the work of
 * a full {@link moonSky}. The map's nav disc reads only the phase, the tilt and nothing else,
 * and it renders on the app's home screen, so it takes this instead.
 */
export function moonAppearance(coords: LatLng, at: Date): MoonAppearance {
  const observer = observerFor(coords);
  const illum = Astronomy.Illumination(Astronomy.Body.Moon, at);
  const phaseAngle = Astronomy.MoonPhase(at);
  const moon = horizonOf(Astronomy.Body.Moon, at, observer);
  const sun = horizonOf(Astronomy.Body.Sun, at, observer);
  return {
    illumination: illum.phase_fraction,
    phaseAngle,
    waxing: phaseAngle < 180,
    limbAngle: brightLimbAngle(moon, sun),
    azimuth: moon.azimuth,
    altitude: moon.altitude,
    diameterDeg: Astronomy.Libration(at).diam_deg,
  };
}

export function moonSky(coords: LatLng, at: Date): MoonSky {
  return {
    ...moonAppearance(coords, at),
    ageDays: (at.getTime() - lastNewMoon(at).getTime()) / DAY_MS,
  };
}

/** Phase alone — no observer, no age search, two library calls. The month sheet draws thirty
 *  small moons at once and wants none of the rest: a calendar square shows WHICH moon the day
 *  had, and the tilt of a moon in a grid cell is meaningless because the cell is not the sky.
 *  Full moonSky() thirty times would be forty milliseconds of work for nothing. */
export function moonPhaseAt(at: Date): { illumination: number; phaseAngle: number } {
  return {
    illumination: Astronomy.Illumination(Astronomy.Body.Moon, at).phase_fraction,
    phaseAngle: Astronomy.MoonPhase(at),
  };
}

/** The conjunction at or before `at`. Walked forward from a window that certainly starts
 *  before it, rather than searched backwards, because the search takes a forward window and
 *  a negative one is not the same question. */
export function lastNewMoon(at: Date): Date {
  let cursor = Astronomy.SearchMoonPhase(0, new Date(at.getTime() - LUNATION_WINDOW_DAYS * DAY_MS), LUNATION_WINDOW_DAYS + 5);
  let found = cursor;
  while (cursor && cursor.date.getTime() <= at.getTime()) {
    found = cursor;
    cursor = Astronomy.SearchMoonPhase(0, new Date(cursor.date.getTime() + DAY_MS), LUNATION_WINDOW_DAYS);
  }
  // `found` can only be null if no conjunction exists in a 50-day window, which is
  // arithmetically impossible; the fallback keeps the type honest rather than throwing on a
  // screen whose whole job is to keep drawing.
  return found ? found.date : at;
}

/** The four named instants of the Swedish almanac, next after `from`. */
export interface NextPhases {
  newMoon: Date | null;
  firstQuarter: Date | null;
  full: Date | null;
  lastQuarter: Date | null;
}

export function nextPhases(from: Date): NextPhases {
  const at = (targetLon: number): Date | null =>
    Astronomy.SearchMoonPhase(targetLon, from, LUNATION_WINDOW_DAYS)?.date ?? null;
  return { newMoon: at(0), firstQuarter: at(90), full: at(180), lastQuarter: at(270) };
}

/**
 * Moonrise and moonset for one civil day at one place.
 *
 * A MISSING RISE OR SET IS NORMAL AND IS NOT A POLAR CASE. The Moon's day is 24 h 50 min
 * long, so it slips later every day and roughly once a month a civil day genuinely contains
 * no moonrise — in Malmö as much as in Kiruna. Only when BOTH are missing has the Moon
 * stopped crossing the horizon at all, and then the altitude at midday says which side it is
 * stuck on. Conflating the two is how an app ends up announcing the midnight sun in Skåne.
 */
export interface MoonRiseSet {
  rise: Date | null;
  set: Date | null;
  /** Above the horizon for the whole day. */
  alwaysUp: boolean;
  /** Below it for the whole day. */
  alwaysDown: boolean;
}

export function moonRiseSet(coords: LatLng, dayStart: Date, dayLengthMs = DAY_MS): MoonRiseSet {
  const observer = observerFor(coords);
  const days = dayLengthMs / DAY_MS;
  const rise = Astronomy.SearchRiseSet(Astronomy.Body.Moon, observer, +1, dayStart, days);
  const set = Astronomy.SearchRiseSet(Astronomy.Body.Moon, observer, -1, dayStart, days);
  const within = (t: Astronomy.AstroTime | null): Date | null =>
    t && t.date.getTime() < dayStart.getTime() + dayLengthMs ? t.date : null;
  const riseAt = within(rise);
  const setAt = within(set);
  if (riseAt || setAt) return { rise: riseAt, set: setAt, alwaysUp: false, alwaysDown: false };
  const midday = new Date(dayStart.getTime() + dayLengthMs / 2);
  const up = horizonOf(Astronomy.Body.Moon, midday, observer).altitude > 0;
  return { rise: null, set: null, alwaysUp: up, alwaysDown: !up };
}

/** Sunset here, or null on a day the sun does not set (which is most of a Kiruna summer). */
export function sunsetAt(coords: LatLng, dayStart: Date, dayLengthMs = DAY_MS): Date | null {
  const t = Astronomy.SearchRiseSet(
    Astronomy.Body.Sun,
    observerFor(coords),
    -1,
    dayStart,
    dayLengthMs / DAY_MS,
  );
  return t && t.date.getTime() < dayStart.getTime() + dayLengthMs ? t.date : null;
}

/** Elongation, altitudes and apparent size at one instant — the raw geometry the pure
 *  visibility test in ./visibility consumes. Kept here because only this file may ask the
 *  library; kept a plain record so the test can hand-write one. */
export interface SkyGeometry {
  moonAltitude: number;
  moonAzimuth: number;
  sunAltitude: number;
  sunAzimuth: number;
  /** Topocentric elongation Moon–Sun, degrees (the "arc of light"). */
  elongation: number;
  /** Apparent semi-diameter of the Moon, degrees. */
  semiDiameter: number;
}

export function skyGeometry(coords: LatLng, at: Date): SkyGeometry {
  const observer = observerFor(coords);
  const moon = horizonOf(Astronomy.Body.Moon, at, observer);
  const sun = horizonOf(Astronomy.Body.Sun, at, observer);
  // Topocentric elongation across the sky dome, from the two horizontal positions — the
  // same spherical separation the eye judges, and consistent with the limb angle above.
  const am = moon.altitude * DEG;
  const as = sun.altitude * DEG;
  const dAz = (sun.azimuth - moon.azimuth) * DEG;
  const cosSep = Math.sin(am) * Math.sin(as) + Math.cos(am) * Math.cos(as) * Math.cos(dAz);
  return {
    moonAltitude: moon.altitude,
    moonAzimuth: moon.azimuth,
    sunAltitude: sun.altitude,
    sunAzimuth: sun.azimuth,
    elongation: Math.acos(Math.min(1, Math.max(-1, cosSep))) / DEG,
    semiDiameter: Astronomy.Libration(at).diam_deg / 2,
  };
}

/** A lunar eclipse worth going outside for, and whether it can be seen from here. */
export interface EclipseNote {
  peak: Date;
  /** PENUMBRAL IS DELIBERATELY NOT A CASE. The Moon passing through the Earth's outer shadow
   *  dims it by an amount most people cannot see at all — there is nothing to look at, and
   *  the copy attached to an eclipse names ṣalāt al-khusūf, which belongs to an eclipse the
   *  reader can actually witness. Filtering them out at this boundary is what keeps the
   *  screen from prescribing a prayer for a sky that looks entirely ordinary. */
  kind: 'partial' | 'total';
  /** Peak fraction of the disc inside the umbra, 0–1 — how much of it actually goes dark. */
  obscuration: number;
  /** The Moon is above the horizon here at peak — the only thing that makes it OURS. */
  visibleHere: boolean;
}

/** The next partial or total lunar eclipse within `withinDays`, or null. Reported whether or
 *  not it is visible from here: an eclipse nobody here can see is still a true thing to say,
 *  and the copy needs the flag to say it honestly rather than promising an empty sky. */
export function nextLunarEclipse(coords: LatLng, from: Date, withinDays: number): EclipseNote | null {
  const observer = observerFor(coords);
  const limit = from.getTime() + withinDays * DAY_MS;
  let e = Astronomy.SearchLunarEclipse(from);
  // Prefer one that is actually visible here; fall back to the first in the window.
  let firstInWindow: EclipseNote | null = null;
  for (let i = 0; i < 12 && e.peak.date.getTime() <= limit; i++) {
    if (e.kind === Astronomy.EclipseKind.Partial || e.kind === Astronomy.EclipseKind.Total) {
      const note: EclipseNote = {
        peak: e.peak.date,
        kind: e.kind === Astronomy.EclipseKind.Total ? 'total' : 'partial',
        obscuration: e.obscuration,
        visibleHere: horizonOf(Astronomy.Body.Moon, e.peak.date, observer).altitude > 0,
      };
      if (note.visibleHere) return note;
      firstInWindow ??= note;
    }
    e = Astronomy.NextLunarEclipse(e.peak);
  }
  return firstInWindow;
}
