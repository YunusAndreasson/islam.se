// The sentences. These are the app SPEAKING, and a wrong one is a claim about the sky that
// the reader can walk outside and disprove — so each branch gets a test, including the ones
// that only happen north of the Arctic Circle.
import { describe, expect, it } from '@jest/globals';

import type { MoonRiseSet } from './ephemeris';
import { moonFacts, moonNotes, type MoonNotesInput } from './readout';

const time = (d: Date) => d.toISOString().slice(11, 16);
const date = (d: Date) => d.toISOString().slice(5, 10);
const at = (iso: string) => new Date(iso);

const NORMAL: MoonRiseSet = {
  rise: at('2026-08-22T16:52:00Z'),
  set: at('2026-08-22T20:24:00Z'),
  alwaysUp: false,
  alwaysDown: false,
};

const base: MoonNotesInput = {
  illumination: 0.72,
  waxing: true,
  riseSet: NORMAL,
  nextFull: at('2026-08-28T04:12:00Z'),
  nextNew: at('2026-09-11T12:00:00Z'),
  hilal: null,
  eclipse: null,
  fullMoonHijriDay: 14,
  time,
  date,
};

const textOf = (input: Partial<MoonNotesInput> = {}) =>
  moonNotes({ ...base, ...input }).map((n) => n.text);

describe('moonNotes — tonight', () => {
  it('gives rise and set in the order they happen', () => {
    expect(textOf()[0]).toBe('Upp 16:52 · ner 20:24');
  });

  it('puts set first on the nights it happens first', () => {
    // The Moon's day is 24 h 50 min, so through the month the pair genuinely swaps round.
    // Printing them in a fixed order would be wrong for half of every month.
    const swapped = textOf({
      riseSet: { ...NORMAL, rise: at('2026-08-22T22:00:00Z'), set: at('2026-08-22T04:00:00Z') },
    });
    expect(swapped[0]).toBe('Ner 04:00 · upp 22:00');
  });

  it('says so plainly when a civil day has no moonrise — which is ordinary, not polar', () => {
    expect(textOf({ riseSet: { ...NORMAL, rise: null } })[0]).toContain('uppe sedan i går');
    expect(textOf({ riseSet: { ...NORMAL, set: null } })[0]).toContain('kvar över midnatt');
  });

  it('states the two polar cases as themselves', () => {
    expect(textOf({ riseSet: { rise: null, set: null, alwaysUp: true, alwaysDown: false } })[0]).toContain(
      'Går inte ner',
    );
    expect(textOf({ riseSet: { rise: null, set: null, alwaysUp: false, alwaysDown: true } })[0]).toContain(
      'Kommer inte upp',
    );
  });
});

describe('moonNotes — the next instants', () => {
  it('leads with whichever of full and new comes first, and marks the row with it', () => {
    const soonFull = moonNotes(base)[1];
    expect(soonFull?.text).toBe('Nästa: fullmåne 08-28 · nymåne 09-11.');
    expect(soonFull?.moon).toBe(1);

    const soonNew = moonNotes({ ...base, nextNew: at('2026-08-24T00:00:00Z') })[1];
    expect(soonNew?.text).toBe('Nästa: nymåne 08-24 · fullmåne 08-28.');
    expect(soonNew?.moon).toBe(0);
  });

  it('omits the row entirely rather than printing "Nästa:" with nothing after it', () => {
    expect(textOf({ nextFull: null, nextNew: null })).not.toContain('Nästa: .');
    expect(textOf({ nextFull: null, nextNew: null }).some((t) => t.startsWith('Nästa'))).toBe(false);
  });
});

describe('moonNotes — the crescent', () => {
  const EVALUATED = {
    day: at('2026-02-18T15:47:00Z'),
    evening: {
      kind: 'evaluated',
      sunset: at('2026-02-18T15:47:00Z'),
      bestTime: at('2026-02-18T16:27:00Z'),
      lagMinutes: 91,
      verdict: { band: 'naked', v: 3.1, width: 0.4 },
    },
  } as const;

  it('names the evening, the best moment and the lag when the crescent is still to come', () => {
    const text = textOf({ hilal: { ...EVALUATED, when: 'coming' } }).join(' ');
    expect(text).toContain('blotta ögat');
    expect(text).toContain('16:27');
    expect(text).toContain('91 min');
  });

  it('speaks in the past tense about the crescent that already began this month', () => {
    // Two tenses because they are two different statements. A forecast tells the reader when
    // to go out; a retrospect names the evening the month they are already in could first
    // have begun — which is the only form of "has the calendar drifted" anyone can check.
    const text = textOf({ hilal: { ...EVALUATED, when: 'past' } }).join(' ');
    expect(text).toContain('Månadens nymåne kunde först skymtas');
    expect(text).not.toContain('bäst omkring');
  });

  it('keeps the verdict in the past tense — a zone-C evening was not a naked-eye sighting', () => {
    // THE BUG THIS EXISTS FOR: the past-tense branch dropped `verdict.band` and printed an
    // unqualified "kunde först ses" for an evening the criterion had just said needed
    // binoculars. On the one screen whose stated job is that a sentence must not be false.
    const optical = textOf({
      hilal: {
        ...EVALUATED,
        evening: { ...EVALUATED.evening, verdict: { band: 'optical', v: 0.5, width: 0.2 } },
        when: 'past',
      },
    }).join(' ');
    expect(optical).toContain('kikare');
    expect(optical).not.toContain('kunde först ses');
  });

  it('does not promise a sighting on an evening with no sunset', () => {
    // The failure this prevents is a Kiruna June reading "nymånen bör synas" over a sky that
    // never gets dark. The polar branches carry their own sentence and never reach the bands.
    const text = textOf({
      hilal: { day: at('2026-06-20T00:00:00Z'), evening: { kind: 'midnightSun' }, when: 'coming' },
    }).join(' ');
    expect(text).toContain('Solen går inte ner');
    expect(text).not.toContain('blotta ögat');

    const night = textOf({
      hilal: { day: at('2026-12-20T00:00:00Z'), evening: { kind: 'polarNight' }, when: 'coming' },
    }).join(' ');
    expect(night).toContain('Solen går inte upp');
  });

  it('reports a Moon that stays up rather than a verdict it cannot give', () => {
    expect(
      textOf({ hilal: { day: at('2026-03-23T00:00:00Z'), evening: { kind: 'moonStaysUp' }, when: 'coming' } }).join(' '),
    ).toContain('hela natten');
  });
});

describe('moonNotes — an eclipse', () => {
  it('names ṣalāt al-khusūf when the eclipse is in our sky, and does not when it is not', () => {
    const here = textOf({
      eclipse: { peak: at('2026-03-03T11:33:00Z'), kind: 'total', obscuration: 1, visibleHere: true },
    }).join(' ');
    expect(here).toContain('Total månförmörkelse');
    expect(here).toContain('ṣalāt al-khusūf');

    const elsewhere = textOf({
      eclipse: { peak: at('2026-03-03T11:33:00Z'), kind: 'total', obscuration: 1, visibleHere: false },
    }).join(' ');
    expect(elsewhere).toContain('under horisonten');
    expect(elsewhere).not.toContain('ṣalāt al-khusūf');
  });
});

describe('moonNotes — the drift between the calendar and the sky', () => {
  it('stays quiet while the full moon lands on or beside the white days', () => {
    for (const day of [13, 14, 15]) {
      expect(moonNotes({ ...base, fullMoonHijriDay: day }).some((n) => n.action)).toBe(false);
    }
  });

  it('speaks up — with the door to the setting — once the gap is visible to the eye', () => {
    // Two days is where a reader can check it themselves: a plainly full moon on the 12th or
    // the 17th. Below that the tabular calendar is simply doing what a tabular calendar does.
    const drifted = moonNotes({ ...base, fullMoonHijriDay: 17 }).find((n) => n.action === 'hijriOffset');
    expect(drifted).toBeDefined();
    expect(drifted?.text).toContain('17');
    expect(drifted?.text).toContain('Justera Hijri-datum');
  });

  it('never tells the reader which date is correct', () => {
    // The month begins with the sighting, or by completing thirty days. The screen may show
    // the gap; it may not adjudicate it, and this is the line that would slip first.
    const all = moonNotes({ ...base, fullMoonHijriDay: 11 }).map((n) => n.text).join(' ');
    expect(all).not.toMatch(/rätt datum|fel datum|borde vara/i);
  });

  it('says nothing at all when there is no full moon to compare against', () => {
    expect(moonNotes({ ...base, fullMoonHijriDay: null }).some((n) => n.action)).toBe(false);
  });
});

describe('moonNotes — the almanac handedness', () => {
  it('carries tonight’s direction on the rows that are about tonight', () => {
    // The rows are drawn with the almanac tilt — lit on the right while waxing, left while
    // waning — so a half-lit bullet in the first week and the same bullet three weeks later
    // are not the same drawing. The flag has to reach them or that distinction is lost.
    expect(moonNotes(base)[0]?.waxing).toBe(true);
    expect(moonNotes({ ...base, waxing: false })[0]?.waxing).toBe(false);
  });

  it('gives every row a direction, so none can be drawn from an undefined', () => {
    const all = moonNotes({
      ...base,
      hilal: { day: at('2026-02-18T00:00:00Z'), evening: { kind: 'polarNight' }, when: 'coming' },
      eclipse: { peak: at('2026-03-03T11:33:00Z'), kind: 'total', obscuration: 1, visibleHere: true },
      fullMoonHijriDay: 17,
    });
    expect(all.length).toBeGreaterThan(3);
    for (const note of all) expect(typeof note.waxing).toBe('boolean');
  });
});

describe('moonNotes — what reaches the screen and what waits behind the door', () => {
  // The tier is the whole information architecture of the screen: `tonight` and `alert` are
  // printed under the dial, `almanac` is one tap away in the sheet. Get it wrong in the
  // quiet direction and the crescent question — the reason this screen exists — is folded
  // away on the one evening it matters; wrong in the loud direction and the readout goes
  // back to being the five-sentence stack this pass took apart. Neither failure is visible
  // in a screenshot of an ordinary day.
  it('keeps tonight on the surface', () => {
    expect(moonNotes(base)[0]).toMatchObject({ tier: 'tonight' });
  });

  it('defers the next instants, a fortnight out and unactionable', () => {
    expect(moonNotes(base)[1]).toMatchObject({ tier: 'almanac' });
  });

  it('surfaces the crescent, which is the day someone opens this screen', () => {
    const hilal = moonNotes({
      ...base,
      hilal: { day: at('2026-02-18T00:00:00Z'), evening: { kind: 'polarNight' }, when: 'coming' },
    }).find((n) => n.text.includes('nymånen'));
    expect(hilal).toMatchObject({ tier: 'alert' });
  });

  it('sorts an eclipse by whether the reader can walk outside and see it', () => {
    const peak = at('2026-03-03T11:33:00Z');
    const here = moonNotes({
      ...base,
      eclipse: { peak, kind: 'total', obscuration: 1, visibleHere: true },
    }).find((n) => n.text.includes('förmörkelse'));
    // It calls for ṣalāt al-khusūf, which makes it a thing to do tonight.
    expect(here).toMatchObject({ tier: 'alert' });

    const elsewhere = moonNotes({
      ...base,
      eclipse: { peak, kind: 'total', obscuration: 1, visibleHere: false },
    }).find((n) => n.text.includes('förmörkelse'));
    expect(elsewhere).toMatchObject({ tier: 'almanac' });
  });

  it('never folds the drift correction away — a door nobody sees is a door nobody opens', () => {
    expect(moonNotes({ ...base, fullMoonHijriDay: 17 }).find((n) => n.action)).toMatchObject({
      tier: 'alert',
    });
  });
});

describe('moonFacts', () => {
  it('adds the almanac word for waning, and only when waning', () => {
    // Written with explicit \u00a0 escapes: every number here is bound to its unit with a
    // non-breaking space, and a plain one would let "62" and "%" land on separate lines in a
    // narrow readout. An escape is the only way a test can tell the two apart on sight.
    expect(moonFacts(0.62, true, 9.4)).toBe('62\u00a0% belyst \u00b7 9\u00a0dygn');
    expect(moonFacts(0.62, false, 19.4)).toBe('62\u00a0% belyst \u00b7 19\u00a0dygn \u00b7 i nedan');
  });
});

describe('Swedish typography', () => {
  it('does not double the period after an abbreviated month', () => {
    // "11 sep." already ends a sentence; adding a full stop gave "11 sep..". Dates reach
    // this module through an injected formatter, so the module cannot know whether one is
    // coming — which is exactly why the rule lives at the end of the sentence rather than in
    // the formatter.
    const abbreviated = (d: Date) => `${d.getUTCDate()} sep.`;
    const rows = moonNotes({ ...base, date: abbreviated }).map((n) => n.text);
    expect(rows.some((t) => t.includes('..'))).toBe(false);
    expect(rows[1]).toMatch(/sep\.$/);
  });

  it('still ends a sentence that did not already end itself', () => {
    expect(moonNotes({ ...base, date: (d) => String(d.getUTCDate()) })[1]).toMatchObject({
      text: expect.stringMatching(/\d\.$/),
    });
  });
});
