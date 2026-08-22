// The evening question, assembled: sunset and moonset from the ephemeris, the arc of vision
// measured at the best moment to look, and Odeh's criterion applied to it.
//
// Kept apart from both halves it joins. ./ephemeris may talk to the astronomy library and
// nothing else; ./visibility is the pure criterion and takes only numbers. This file is the
// procedure between them — including Yallop's best-time rule, which is a way of OBSERVING
// rather than a fact about the sky, and so belongs here rather than in either.
//
// The non-answers are as much of the point as the verdict. Midnight sun, polar night, a Moon
// already below the horizon when the Sun goes, and a Moon that never sets at all are four
// different skies, and collapsing them into "kunde inte beräknas" would throw away the only
// useful thing the screen has to say on exactly the nights it is hardest to look. The two
// polar states in particular must not be merged: they are the same absence of a sunset and
// the opposite fact about the day.
import type { LatLng } from '@/lib/prayer-times';
import { sunAltitudeDeg } from '@/lib/solar/sun';

import { moonRiseSet, skyGeometry, sunsetAt } from './ephemeris';
import { hilalVerdict, type HilalVerdict } from './visibility';

const DAY_MS = 86_400_000;

/** Yallop's best time: four ninths of the way from sunset to moonset. Earlier and the sky is
 *  still too bright; later and the crescent is down in the horizon murk. Every published
 *  criterion, Odeh's included, is fitted at this instant, so evaluating anywhere else — at
 *  sunset, say — is using the numbers outside the data they came from. */
const BEST_TIME_FRACTION = 4 / 9;

/**
 * Past this lag the evening is not a crescent-hunting evening at all.
 *
 * A hilāl is by definition close to the Sun, so it follows it down within an hour or two.
 * A Moon still up four hours after sunset is a fat one, or a high-declination one riding a
 * long arc at northern latitudes — and Yallop's rule would then place "best time" most of the
 * way through the night and the readout would print "1830 min efter solnedgången", which is
 * both absurd and far outside the observations Odeh's curve was fitted to. `moonStaysUp` is
 * the honest answer and it already has the sentence for it.
 */
const MAX_HILAL_LAG_MIN = 240;

export type HilalEvening =
  | {
      kind: 'evaluated';
      /** The sunset the evening belongs to — and the date it should be reported under. */
      sunset: Date;
      /** Where the criterion was evaluated, and, usefully, when to go outside. */
      bestTime: Date;
      /** How long the Moon lingers after the Sun, minutes. The one number a sighting party
       *  actually plans around. */
      lagMinutes: number;
      verdict: HilalVerdict;
    }
  /** The Moon was already below the horizon when the Sun set: there is no crescent in the
   *  sky to see, however wide it has grown. */
  | { kind: 'moonDown' }
  /** The Moon is up for the rest of the night — circumpolar here, or riding an arc long
   *  enough that the crescent question no longer applies. */
  | { kind: 'moonStaysUp' }
  /** The Sun never set: midnight sun, and no evening to look in. */
  | { kind: 'midnightSun' }
  /** The Sun never ROSE. Both polar states leave the sighting question unanswerable, but
   *  they are opposite skies, and an app that tells a Kiruna reader in December that the sun
   *  would not go down has said something plainly untrue about the world outside. */
  | { kind: 'polarNight' };

/**
 * The outcomes a SEARCH can settle on. `moonDown` is deliberately absent: a Moon below the
 * horizon tonight is above it tomorrow, so a search that reported the first one would be
 * answering about the wrong evening — it keeps looking instead. Narrowing the type here is
 * what stops the readout carrying a sentence nothing can ever reach.
 */
export type DecisiveEvening = Exclude<HilalEvening, { kind: 'moonDown' }>;

/** Highest the Sun gets over the window, from the app's own solar model (lib/solar/sun) —
 *  which is what separates "never set" from "never rose" when there is no sunset to find.
 *  Sampled hourly: the two polar states are separated by many degrees, never by minutes, so
 *  a coarse sweep decides them as surely as a solver would and stays honest at the poles
 *  where solar noon is not simply the middle of the civil day. */
function sunReachedDaylight(coords: LatLng, dayStart: Date, dayLengthMs: number): boolean {
  const steps = Math.max(4, Math.round(dayLengthMs / 3_600_000));
  for (let i = 0; i <= steps; i++) {
    const at = new Date(dayStart.getTime() + (i * dayLengthMs) / steps);
    if (sunAltitudeDeg(coords.latitude, coords.longitude, at) > 0) return true;
  }
  return false;
}

/** Tonight's crescent question for one place and one civil day. */
export function hilalEvening(coords: LatLng, dayStart: Date, dayLengthMs = DAY_MS): HilalEvening {
  const sunset = sunsetAt(coords, dayStart, dayLengthMs);
  if (!sunset) {
    return sunReachedDaylight(coords, dayStart, dayLengthMs)
      ? { kind: 'midnightSun' }
      : { kind: 'polarNight' };
  }
  // Is there anything up there at all when the Sun goes? This is the test for "the Moon set
  // first", and it is asked of the SKY rather than of the clock: comparing a moonset time
  // with a sunset time gets the old-moon mornings wrong, because the moonset that a
  // day-long search finds first may be the one that happened before breakfast.
  if (skyGeometry(coords, sunset).moonAltitude <= 0) return { kind: 'moonDown' };
  // Moonset is searched FROM SUNSET, so whatever comes back closes this evening's window.
  const { set } = moonRiseSet(coords, sunset, 2 * DAY_MS);
  if (!set) return { kind: 'moonStaysUp' };
  const lagMinutes = Math.round((set.getTime() - sunset.getTime()) / 60_000);
  if (lagMinutes > MAX_HILAL_LAG_MIN) return { kind: 'moonStaysUp' };
  const bestTime = new Date(sunset.getTime() + lagMinutes * 60_000 * BEST_TIME_FRACTION);
  const g = skyGeometry(coords, bestTime);
  return {
    kind: 'evaluated',
    sunset,
    bestTime,
    lagMinutes,
    verdict: hilalVerdict({
      arcv: g.moonAltitude - g.sunAltitude,
      elongation: g.elongation,
      semiDiameter: g.semiDiameter,
    }),
  };
}

/**
 * The evening the new crescent first becomes visible from here, searching forward from the
 * conjunction — or the standing fact about this place that makes the question unanswerable.
 *
 * ⚠️ THE DATE COMES FROM THE EVENING, NOT FROM THE LOOP. The walk steps in 24-hour hops from
 * the conjunction, which is an INSTANT and not a civil midnight, so for the roughly half of
 * all lunations whose conjunction falls after sunset the probe lands on one civil day and the
 * sunset it finds belongs to the next. Reporting the probe's own date then sent the reader
 * out a day early — with the right clock time, which is what made it look plausible.
 */
export function firstVisibleEvening(
  coords: LatLng,
  newMoon: Date,
  maxDays = 5,
): { day: Date; evening: DecisiveEvening } | null {
  for (let i = 0; i <= maxDays; i++) {
    const probe = new Date(newMoon.getTime() + i * DAY_MS);
    const evening = hilalEvening(coords, probe);
    switch (evening.kind) {
      case 'evaluated':
        if (evening.verdict.band !== 'invisible') return { day: evening.sunset, evening };
        break;
      // Facts about the place and the season rather than about this particular evening —
      // they will read the same on every day of the window, so the first one settles it.
      case 'midnightSun':
      case 'polarNight':
      case 'moonStaysUp':
        return { day: probe, evening };
      // The Moon has not caught up with the Sun yet. Tomorrow it will have.
      case 'moonDown':
        break;
    }
  }
  return null;
}
