// External-reference anchors for the Moon ephemeris.
//
// The library this wraps is well tested by its own authors; what is NOT tested anywhere but
// here is that WE are calling it correctly — right body, right observer, topocentric rather
// than geocentric, refraction on, degrees not radians, the search window pointing forwards.
// Every one of those mistakes returns a plausible number. So the anchors come from outside
// astronomy-engine entirely:
//
//   • Sunset, cross-checked against `adhan` — a separate solar implementation this app
//     already ships and already trusts for six prayer times a day. Two independent
//     algorithms agreeing to under a minute is evidence; one agreeing with itself is not.
//   • Lunar eclipse dates and a conjunction instant, both published years ahead.
//   • Geometry that must hold whatever the numbers are: the bright limb faces the Sun, a
//     full moon is fully lit, the Moon's age never exceeds a lunation.
import { describe, expect, it } from '@jest/globals';
import { CalculationMethod, Coordinates, PrayerTimes } from 'adhan';

import {
  lastNewMoon,
  moonRiseSet,
  moonSky,
  nextLunarEclipse,
  nextPhases,
  skyGeometry,
  sunsetAt,
} from './ephemeris';

const STOCKHOLM = { latitude: 59.3293, longitude: 18.0686 };
const KIRUNA = { latitude: 67.8558, longitude: 20.2253 };
const MINUTE = 60_000;
const DAY_MS = 86_400_000;
const RAD = Math.PI / 180;

const utc = (iso: string) => new Date(iso);
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
/** Narrow a nullable result at the assertion site — `expect(x).not.toBeNull()` does not
 *  narrow the type, and casting inline buries the intent. */
function present<T>(value: T | null): T {
  expect(value).not.toBeNull();
  return value as T;
}

describe('sunsetAt — against adhan, an independent solar implementation', () => {
  // adhan rounds to the whole minute, so anything under ~1.5 min is agreement. A radians/
  // degrees slip or a geocentric observer would move this by tens of minutes.
  it.each(['2026-01-15', '2026-06-01', '2026-08-22', '2026-11-03'])('agrees within a minute on %s', (day) => {
    const ours = present(sunsetAt(STOCKHOLM, utc(`${day}T00:00:00Z`)));
    const theirs = new PrayerTimes(
      new Coordinates(STOCKHOLM.latitude, STOCKHOLM.longitude),
      utc(`${day}T12:00:00Z`),
      CalculationMethod.MuslimWorldLeague(),
    ).maghrib;
    expect(Math.abs(ours.getTime() - theirs.getTime())).toBeLessThan(1.5 * MINUTE);
  });

  it('returns null on a day the Sun does not set — Kiruna at midsummer', () => {
    // The polar branch, and the reason hilalEvening has a `noSunset` case at all. If this
    // ever starts returning a Date, the screen begins promising an evening that has no
    // darkness in it.
    expect(sunsetAt(KIRUNA, utc('2026-06-20T00:00:00Z'))).toBeNull();
  });
});

describe('lunar eclipses — against the published record', () => {
  it('skips the penumbral ones — there is nothing there for the eye, or for the prayer', () => {
    // 20 February 2027 is a penumbral eclipse: the Moon crosses the outer shadow and dims by
    // an amount most people cannot see. The copy attached to an eclipse names ṣalāt
    // al-khusūf, so a sky that looks entirely ordinary must never reach it. The search
    // therefore steps over it and returns the next real one.
    const found = present(nextLunarEclipse(STOCKHOLM, utc('2026-12-01T00:00:00Z'), 500));
    // Three penumbrals stand between that date and the next real one — 20 Feb, 18 Jul and
    // 17 Aug 2027 — and the search steps over all of them.
    expect(isoDay(found.peak)).toBe('2028-01-12');
    expect(found.kind).toBe('partial');
  });

  it('returns nothing at all when the window holds only penumbral eclipses', () => {
    // Not an error state: the honest answer is that there is no eclipse worth going outside
    // for, and the readout then simply has no eclipse row.
    expect(nextLunarEclipse(STOCKHOLM, utc('2026-12-01T00:00:00Z'), 300)).toBeNull();
  });

  it('finds the total eclipse of 7 September 2025 and the total of 3 March 2026', () => {
    const first = present(nextLunarEclipse(STOCKHOLM, utc('2025-06-01T00:00:00Z'), 400));
    expect(isoDay(first.peak)).toBe('2025-09-07');
    expect(first.kind).toBe('total');

    const next = present(nextLunarEclipse(STOCKHOLM, utc('2025-12-01T00:00:00Z'), 200));
    expect(isoDay(next.peak)).toBe('2026-03-03');
    expect(next.kind).toBe('total');
  });

  it('knows the September 2025 totality was in the Swedish sky and reports it as ours', () => {
    // `visibleHere` is the whole difference between a fact about the solar system and a
    // reason to go outside. That totality peaked with the Moon up over Sweden; asking the
    // question geocentrically — no observer — would make it a coin flip.
    const e = present(nextLunarEclipse(STOCKHOLM, utc('2025-09-01T00:00:00Z'), 30));
    expect(e.visibleHere).toBe(true);
    expect(e.obscuration).toBeGreaterThan(0.99);
  });
});

describe('phase instants — against the published conjunction', () => {
  it('puts the new moon of January 2026 at 18 Jan, 19:52 UTC', () => {
    const t = present(nextPhases(utc('2026-01-05T00:00:00Z')).newMoon);
    expect(Math.abs(t.getTime() - utc('2026-01-18T19:52:00Z').getTime())).toBeLessThan(2 * MINUTE);
  });

  it('puts the full moon of March 2026 on the day of the total eclipse, which it must', () => {
    // A total lunar eclipse IS a full moon, by definition. Two searches with different
    // targets landing on the same day is a real cross-check on both.
    expect(isoDay(present(nextPhases(utc('2026-02-20T00:00:00Z')).full))).toBe('2026-03-03');
  });

  it('returns the four quarters in the order they next occur', () => {
    // Searched from just after a conjunction: the quarter, then full, then the last
    // quarter, and only then the NEXT new moon a lunation away. A backwards window or a
    // swapped target longitude scrambles this and nothing else notices.
    const p = nextPhases(utc('2026-01-19T00:00:00Z'));
    const first = present(p.firstQuarter).getTime();
    const full = present(p.full).getTime();
    const last = present(p.lastQuarter).getTime();
    const next = present(p.newMoon).getTime();
    expect(first).toBeLessThan(full);
    expect(full).toBeLessThan(last);
    expect(last).toBeLessThan(next);
  });
});

describe('moonSky — the geometry that must hold whatever the numbers are', () => {
  it('is dark at conjunction and full at opposition', () => {
    expect(moonSky(STOCKHOLM, utc('2026-01-18T19:52:00Z')).illumination).toBeLessThan(0.005);
    expect(moonSky(STOCKHOLM, utc('2026-03-03T11:38:00Z')).illumination).toBeGreaterThan(0.995);
  });

  it('turns waxing at the conjunction and waning at the full moon', () => {
    expect(moonSky(STOCKHOLM, utc('2026-01-20T12:00:00Z')).waxing).toBe(true);
    expect(moonSky(STOCKHOLM, utc('2026-03-05T12:00:00Z')).waxing).toBe(false);
  });

  it('points the bright limb at the Sun', () => {
    // THE CHECK THAT CATCHES A SIGN ERROR IN THE TILT. Step from the Moon along the limb
    // angle by the elongation and you must arrive at the Sun. A swapped atan2, an azimuth
    // measured the other way round, a forgotten parallactic term — each lands somewhere
    // else on the sky, and the drawn crescent's horns then point the wrong way at a reader
    // who is standing outside looking at the real thing.
    for (const iso of ['2026-08-22T19:00:00Z', '2026-01-22T16:30:00Z', '2026-03-04T22:00:00Z']) {
      const at = utc(iso);
      const sky = moonSky(STOCKHOLM, at);
      const g = skyGeometry(STOCKHOLM, at);
      const altM = sky.altitude * RAD;
      const sep = g.elongation * RAD;
      const bearing = sky.limbAngle * RAD;
      const altS = Math.asin(
        Math.sin(altM) * Math.cos(sep) + Math.cos(altM) * Math.sin(sep) * Math.cos(bearing),
      );
      const dAz = Math.atan2(
        Math.sin(bearing) * Math.sin(sep) * Math.cos(altM),
        Math.cos(sep) - Math.sin(altM) * Math.sin(altS),
      );
      expect(Math.abs(altS / RAD - g.sunAltitude)).toBeLessThan(0.2);
      const az = (((sky.azimuth + dAz / RAD) % 360) + 360) % 360;
      // Shortest angular separation, so the 359°/1° seam is not read as 358° apart.
      const apart = Math.abs(((az - g.sunAzimuth + 540) % 360) - 180);
      expect(apart).toBeLessThan(0.2);
    }
  });

  it('never reports an age outside one lunation', () => {
    for (let i = 0; i < 40; i++) {
      const age = moonSky(STOCKHOLM, new Date(utc('2026-01-01T00:00:00Z').getTime() + i * DAY_MS)).ageDays;
      expect(age).toBeGreaterThanOrEqual(0);
      expect(age).toBeLessThan(29.6);
    }
  });

  it('reads newborn at the conjunction it just found', () => {
    const conjunction = lastNewMoon(utc('2026-02-20T00:00:00Z'));
    expect(isoDay(conjunction)).toBe('2026-02-17');
    expect(moonSky(STOCKHOLM, new Date(conjunction.getTime() + MINUTE)).ageDays).toBeLessThan(0.002);
  });
});

describe('moonRiseSet — a missing rise is normal; two missing is polar', () => {
  it('reports the short summer arc of a far-south Moon over Stockholm', () => {
    // 22 August 2026: the Moon sits at declination −29°, so from 59°N it clears the horizon
    // by under two degrees and is up for barely three and a half hours. That is the kind of
    // fact this screen exists to make visible, and it looks enough like a bug to be "fixed".
    const { rise, set, alwaysUp, alwaysDown } = moonRiseSet(STOCKHOLM, utc('2026-08-22T00:00:00Z'));
    expect(alwaysUp).toBe(false);
    expect(alwaysDown).toBe(false);
    const hours = (present(set).getTime() - present(rise).getTime()) / 3_600_000;
    expect(hours).toBeGreaterThan(3);
    expect(hours).toBeLessThan(4.5);
  });

  it('keeps the two polar flags mutually exclusive and only ever raises one with no events', () => {
    // Swept across a lunation at 67.9°N so the circumpolar and never-rising days are both
    // reached. The invariant is the contract the screen's copy is written against: a flag is
    // raised ONLY when neither a rise nor a set happened.
    let sawPolar = false;
    for (let i = 0; i < 30; i++) {
      const day = new Date(utc('2026-12-01T00:00:00Z').getTime() + i * DAY_MS);
      const r = moonRiseSet(KIRUNA, day);
      expect(r.alwaysUp && r.alwaysDown).toBe(false);
      if (r.alwaysUp || r.alwaysDown) {
        sawPolar = true;
        expect(r.rise).toBeNull();
        expect(r.set).toBeNull();
      }
    }
    expect(sawPolar).toBe(true);
  });
});
