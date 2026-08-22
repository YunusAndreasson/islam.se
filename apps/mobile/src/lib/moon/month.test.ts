// The day marks. Two things here would be actively harmful to get wrong, and both are one
// character away from each other: a day on which fasting is FORBIDDEN shown as a day on
// which it is recommended, and the white days of Dhū al-ḥijja, where the 13th is not one.
import { describe, expect, it } from '@jest/globals';

import { hijriMonthLength } from '@/lib/hijri';
import { dayMark, isSacredMonth, monthRing } from './month';

describe('dayMark — the white days', () => {
  it('marks 13, 14 and 15 in an ordinary month', () => {
    for (const day of [13, 14, 15]) {
      const mark = dayMark(2, day);
      expect(mark).toEqual({ kind: 'white', label: 'Vita dagarna', arabic: 'Ayyām al-bīḍ', fast: 'sunna' });
    }
    expect(dayMark(2, 12)).toBeNull();
    expect(dayMark(2, 16)).toBeNull();
  });

  it('does NOT mark 13 Dhū al-ḥijja white — it is the last of the tashrīq days', () => {
    // THE BUG THIS EXISTS FOR: `[13, 14, 15].includes(day)` at a call site. It reads
    // correct, it is correct eleven months of the year, and in the twelfth it invites the
    // reader into a fast that is not permitted on that day.
    expect(dayMark(12, 13)?.kind).toBe('tashriq');
    expect(dayMark(12, 13)?.fast).toBe('forbidden');
    expect(dayMark(12, 14)?.kind).toBe('white');
    expect(dayMark(12, 15)?.kind).toBe('white');
  });
});

describe('dayMark — days on which fasting is not permitted outrank everything', () => {
  it('marks both ʿīds forbidden', () => {
    expect(dayMark(10, 1)).toMatchObject({ kind: 'eid', fast: 'forbidden' });
    expect(dayMark(12, 10)).toMatchObject({ kind: 'eid', fast: 'forbidden' });
  });

  it('marks the three tashrīq days forbidden', () => {
    for (const day of [11, 12, 13]) expect(dayMark(12, day)?.fast).toBe('forbidden');
  });

  it('never returns a recommended fast on a forbidden day, in any month', () => {
    for (let month = 1; month <= 12; month++) {
      for (let day = 1; day <= 30; day++) {
        const mark = dayMark(month, day);
        if (mark?.kind === 'eid' || mark?.kind === 'tashriq') expect(mark.fast).toBe('forbidden');
      }
    }
  });

  it('never calls a day of Ramaḍān voluntary, whatever else that day also is', () => {
    // The sweep the ordering bug slipped past: it is not enough for each named day to be
    // right on its own, because a day can carry two facts and only one label.
    for (let day = 1; day <= 30; day++) {
      expect(dayMark(9, day)?.fast).toBe('fard');
    }
  });
});

describe('dayMark — the named days', () => {
  it('marks Tāsūʿāʾ and ʿĀshūrāʾ in Muḥarram, and nowhere else', () => {
    expect(dayMark(1, 9)).toMatchObject({ kind: 'tasua', fast: 'sunna' });
    expect(dayMark(1, 10)).toMatchObject({ kind: 'ashura', fast: 'sunna' });
    expect(dayMark(2, 10)).toBeNull();
  });

  it('marks ʿArafa on 9 Dhū al-ḥijja and the eight days before it as the ten days', () => {
    expect(dayMark(12, 9)).toMatchObject({ kind: 'arafa', fast: 'sunna' });
    expect(dayMark(12, 1)?.kind).toBe('tenDays');
    expect(dayMark(12, 8)?.kind).toBe('tenDays');
  });

  it('marks every day of Ramaḍān as an obligatory fast, and the last ten apart', () => {
    expect(dayMark(9, 1)).toMatchObject({ kind: 'ramadan', fast: 'fard' });
    expect(dayMark(9, 20)).toMatchObject({ kind: 'ramadan', fast: 'fard' });
    expect(dayMark(9, 21)).toMatchObject({ kind: 'lastTen', fast: 'fard' });
    // THE BUG THIS EXISTS FOR: the white-days branch runs first, so 13–15 Ramaḍān came back
    // as `fast: 'sunna'` and three squares of Ramaḍān read "Vita dagarna · sunna att fasta".
    // The mark is right — they ARE the white days — and the standing is not optional.
    for (const day of [13, 14, 15]) {
      expect(dayMark(9, day)).toMatchObject({ kind: 'white', fast: 'fard' });
    }
    expect(dayMark(2, 14)?.fast).toBe('sunna');
  });
});

describe('monthRing', () => {
  it('has exactly as many days as the tabular month, numbered from 1', () => {
    for (const [year, month] of [[1447, 9], [1447, 12], [1448, 1]] as const) {
      const ring = monthRing(year, month);
      expect(ring).toHaveLength(hijriMonthLength(year, month));
      expect(ring[0]?.day).toBe(1);
      expect(ring.at(-1)?.day).toBe(ring.length);
    }
  });

  it('carries the same mark the day-by-day function gives, for every day', () => {
    const ring = monthRing(1447, 12);
    for (const cell of ring) expect(cell.mark).toEqual(dayMark(12, cell.day));
  });
});

describe('isSacredMonth', () => {
  it('names the four of Qur’an 9:36 and no others', () => {
    const sacred = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter(isSacredMonth);
    expect(sacred).toEqual([1, 7, 11, 12]);
  });
});
