// The evening question, end to end. Each of the five outcomes gets a real date and a real
// place, because each of them is a different sentence on the screen and the wrong one is a
// statement about the world that is simply false.
import { describe, expect, it } from '@jest/globals';

import { firstVisibleEvening, hilalEvening } from './hilal';

const STOCKHOLM = { latitude: 59.3293, longitude: 18.0686 };
const KIRUNA = { latitude: 67.8558, longitude: 20.2253 };
const utc = (iso: string) => new Date(iso);

describe('hilalEvening — the five skies', () => {
  it('evaluates a young crescent that is properly up after sunset', () => {
    // 18 February 2026: the conjunction was at 12:01 UTC the day before, so this is a
    // crescent a little over a day old standing 9° up as the Sun goes. The kind of evening
    // a sighting party actually goes out for.
    const e = hilalEvening(STOCKHOLM, utc('2026-02-18T00:00:00Z'));
    expect(e.kind).toBe('evaluated');
    if (e.kind !== 'evaluated') return;
    expect(e.lagMinutes).toBeGreaterThan(60);
    expect(e.bestTime.getTime()).toBeGreaterThan(utc('2026-02-18T14:48:00Z').getTime());
    expect(e.verdict.band).not.toBe('invisible');
  });

  it('refuses the evening of the conjunction itself, when the crescent is already below the horizon', () => {
    // 17 February 2026 over Stockholm: the Moon is two tenths of a degree UNDER the horizon
    // at sunset. There is no crescent in the sky to look at, and this is exactly the evening
    // an arithmetic calendar may already be calling the first of the month — which is the
    // whole reason the screen shows the sky beside the date rather than instead of it.
    expect(hilalEvening(STOCKHOLM, utc('2026-02-17T00:00:00Z')).kind).toBe('moonDown');
  });

  it('refuses a waning Moon that is far below the horizon at sunset', () => {
    expect(hilalEvening(STOCKHOLM, utc('2026-03-08T00:00:00Z')).kind).toBe('moonDown');
  });

  it('reports a circumpolar Moon as staying up rather than as having set first', () => {
    // Kiruna, 23 March 2026: the Sun sets, but the Moon is at declination +26° and never
    // goes below the horizon at 67.9°N. "Månen gick ner före solen" would be the opposite
    // of what is happening in the sky.
    expect(hilalEvening(KIRUNA, utc('2026-03-23T00:00:00Z')).kind).toBe('moonStaysUp');
  });

  it('separates the midnight sun from the polar night — same missing sunset, opposite skies', () => {
    expect(hilalEvening(KIRUNA, utc('2026-06-20T00:00:00Z')).kind).toBe('midnightSun');
    expect(hilalEvening(KIRUNA, utc('2026-12-20T00:00:00Z')).kind).toBe('polarNight');
  });
});

describe('firstVisibleEvening', () => {
  it('skips the conjunction evening and lands on the first evening the crescent can be seen', () => {
    const found = firstVisibleEvening(STOCKHOLM, utc('2026-02-17T12:01:00Z'));
    expect(found).not.toBeNull();
    expect(found?.day.toISOString().slice(0, 10)).toBe('2026-02-18');
    expect(found?.evening.kind).toBe('evaluated');
  });

  it('reports the standing fact instead of a sighting when the sun never sets', () => {
    // A Kiruna June has no evening at all. The search must SAY that rather than return null:
    // "Solen går inte ner här nu" is the most useful thing the screen can tell a reader who
    // is wondering when the month starts, and returning null dropped the row entirely.
    const found = firstVisibleEvening(KIRUNA, utc('2026-06-15T00:00:00Z'));
    expect(found?.evening.kind).toBe('midnightSun');
  });

  it('settles a polar night the same way, and does not confuse it with midnight sun', () => {
    expect(firstVisibleEvening(KIRUNA, utc('2026-12-18T00:00:00Z'))?.evening.kind).toBe('polarNight');
  });

  it('dates the evening it actually evaluated, not the day its own walk started on', () => {
    // THE BUG THIS EXISTS FOR. The walk steps 24 hours at a time from the CONJUNCTION, which
    // is an instant, not a civil midnight. When the conjunction falls after sunset — about
    // half of all lunations — the probe lands on one civil day and the sunset it finds
    // belongs to the next, so the readout sent the reader out a day early, with the right
    // clock time, which is exactly what made it look right.
    const found = firstVisibleEvening(STOCKHOLM, utc('2026-05-16T20:01:00Z'));
    expect(found).not.toBeNull();
    if (found?.evening.kind !== 'evaluated') throw new Error('expected an evaluated evening');
    expect(found.day.toISOString().slice(0, 10)).toBe(
      found.evening.bestTime.toISOString().slice(0, 10),
    );
    expect(found.day.getTime()).toBe(found.evening.sunset.getTime());
  });

  it('refuses to call a Moon that lingers half the night a crescent evening', () => {
    // Yallop's best time is four ninths of the way from sunset to moonset, and every
    // published criterion is fitted at lags of tens of minutes. Left uncapped, a
    // high-declination Moon at 68°N put "best time" hours into the night and the readout
    // printed a four-figure "min efter solnedgången" beside a confident verdict.
    for (let d = 1; d <= 28; d++) {
      const day = new Date(Date.UTC(2026, 2, d));
      const e = hilalEvening(KIRUNA, day);
      if (e.kind === 'evaluated') expect(e.lagMinutes).toBeLessThanOrEqual(240);
    }
  });
});
