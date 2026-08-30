// What the days of a Hijri month are FOR — the marks the ring and the month sheet draw.
//
// Scope, deliberately narrow: only days whose standing is agreed across the four
// rättsskolor, and only what the day IS. Nothing here weighs one position against another,
// and nothing here is a ruling — the sheet says "ʿĀshūrāʾ, sunna att fasta" the way a wall
// calendar does, and the reader's mosque and imam remain where the answers come from.
//
// Days left out on purpose: the night of 15 Shaʿbān, whose reports are contested, and the
// six days of Shawwāl, which may be ANY six after ʿīd and so belong to the month rather
// than to six particular squares (see MONTH_NOTES).
import { hijriMonthLength } from '@/lib/hijri';

/** Hijri months, 1-based, for the month arithmetic below to read as prose. */
const MUHARRAM = 1;
const RAMADAN = 9;
const SHAWWAL = 10;
const DHU_AL_HIJJA = 12;

export type MarkKind =
  | 'ramadan'
  | 'lastTen'
  | 'white'
  | 'tasua'
  | 'ashura'
  | 'tenDays'
  | 'arafa'
  | 'eid'
  | 'tashriq';

export interface DayMark {
  kind: MarkKind;
  /** Swedish label — what the month sheet prints under the day number. */
  label: string;
  /** The name transliterated in the same DIN 31635 / ALA-LC register as PRAYER_LABELS and
   *  HIJRI_MONTHS, so a mark sits beside them without announcing itself as another kind of
   *  thing. Absent where the day has no Arabic name of its own. */
  arabic?: string;
  /** What fasting is on the day. `forbidden` is not a footnote — it is the whole point of
   *  marking ʿīd and the tashrīq days, and an app that showed them as ordinary white days
   *  would be inviting the reader into exactly the fast they may not keep. */
  fast: 'fard' | 'sunna' | 'forbidden' | null;
}

/**
 * The single mark a day carries, or null.
 *
 * ONE mark per day, chosen by rank, because the sheet has room for one line and because a
 * square reading "vita dagarna · tashrīq" would be self-contradicting anyway. The order is:
 * a forbidden fast first (it overrides everything), then the named days, then the white
 * days, then the month-wide marks.
 *
 * ⚠️ THE WHITE DAYS ARE 13–15 IN EVERY MONTH EXCEPT DHŪ AL-ḤIJJA, where the 13th is the
 * last of the tashrīq days and fasting is forbidden. That single exception is the reason
 * this function exists instead of a `[13, 14, 15].includes(day)` at the call site.
 */
export function dayMark(month: number, day: number): DayMark | null {
  if (month === SHAWWAL && day === 1) {
    return { kind: 'eid', label: 'ʿId al-fiṭr', arabic: 'ʿĪd al-fiṭr', fast: 'forbidden' };
  }
  if (month === DHU_AL_HIJJA) {
    if (day === 10) return { kind: 'eid', label: 'ʿId al-aḍḥā', arabic: 'ʿĪd al-aḍḥā', fast: 'forbidden' };
    if (day >= 11 && day <= 13) {
      return { kind: 'tashriq', label: 'Tashrīq-dagarna', arabic: 'Ayyām al-tashrīq', fast: 'forbidden' };
    }
    if (day === 9) return { kind: 'arafa', label: 'ʿArafa-dagen', arabic: 'Yawm ʿArafa', fast: 'sunna' };
    if (day <= 8) return { kind: 'tenDays', label: 'De tio dagarna', arabic: 'Al-ʿashr', fast: 'sunna' };
  }
  if (month === MUHARRAM) {
    if (day === 10) return { kind: 'ashura', label: 'ʿAshura', arabic: 'ʿĀshūrāʾ', fast: 'sunna' };
    if (day === 9) return { kind: 'tasua', label: 'Tasuʿa', arabic: 'Tāsūʿāʾ', fast: 'sunna' };
  }
  if (day >= 13 && day <= 15) {
    return {
      kind: 'white',
      label: 'Vita dagarna',
      arabic: 'Ayyām al-bīḍ',
      // ⚠️ THE FAST IS NOT ALWAYS VOLUNTARY. The white days fall in every month, Ramaḍān
      // included — and in Ramaḍān the fast on them is the obligatory one, not a sunna the
      // reader may take or leave. Reaching this branch before the Ramaḍān one below and
      // returning a flat 'sunna' printed "Vita dagarna · sunna att fasta" over three squares
      // of Ramaḍān, and spoke the same to a screen reader. The label still says what the days
      // ARE; only their standing changes with the month they sit in.
      fast: month === RAMADAN ? 'fard' : 'sunna',
    };
  }
  if (month === RAMADAN) {
    if (day >= 21) return { kind: 'lastTen', label: 'Sista tio', arabic: 'Al-ʿashr al-awākhir', fast: 'fard' };
    return { kind: 'ramadan', label: 'Ramaḍān', fast: 'fard' };
  }
  return null;
}

/** Notes that belong to a whole month rather than to any of its days. */
export const MONTH_NOTES: Readonly<Record<number, string>> = {
  [SHAWWAL]: 'Sex dagars fasta i Shawwāl – valfria dagar efter ʿid.',
  [RAMADAN]: 'Laylat al-qadr söks i de udda nätterna bland de tio sista.',
};

/** One day of the ring. */
export interface RingDay {
  /** 1-based day of the Hijri month. */
  day: number;
  mark: DayMark | null;
}

/** The month as the dial ring and the month sheet want it: every day, in order, with its
 *  mark. Built once per month rather than per cell so the sheet's 30 squares and the dial's
 *  30 notches are provably looking at the same list. */
export function monthRing(year: number, month: number): RingDay[] {
  const length = hijriMonthLength(year, month);
  return Array.from({ length }, (_, i) => ({ day: i + 1, mark: dayMark(month, i + 1) }));
}
