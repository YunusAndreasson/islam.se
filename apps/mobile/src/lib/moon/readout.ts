// The sentences under the dial.
//
// Pure, and separate from the screen, for the same reason lib/moon/visibility is separate
// from the library: this is where the app says things about the world, and a sentence can be
// false in ways a layout cannot. "Månen går upp 21:14" on a night the Moon never sets, or a
// crescent forecast printed over a Kiruna June, is worse than an empty readout.
//
// The formatters are passed IN rather than imported, which keeps the module free of the
// display zone and of Intl, and lets the tests read as plainly as the output does.
import { formatIllumination, formatMoonAge } from './phase';
import type { EclipseNote, MoonRiseSet } from './ephemeris';
import type { DecisiveEvening } from './hilal';
import { HILAL_BAND_TEXT, HILAL_BAND_TEXT_PAST } from './visibility';

/** One line of the readout: a small Moon at the phase the line is ABOUT, and the sentence.
 *  Every row leads with a moon rather than an icon — a column of little moons down the
 *  readout is what an almanac page looks like, and each one is true of its own row. */
export interface MoonNote {
  /** Illuminated fraction for the row's own small Moon. */
  moon: number;
  /** Which way that Moon is going, so the row can be drawn with the almanac's handedness —
   *  lit on the right while waxing, on the left while waning. Without it a half-lit bullet
   *  beside "Månen går upp…" and the same bullet three weeks later are one drawing. */
  waxing: boolean;
  text: string;
  /** Set when the row is a door rather than a statement. */
  action?: 'hijriOffset';
}

export interface MoonNotesInput {
  /** Tonight's illuminated fraction, for the rows that are about tonight. */
  illumination: number;
  /** Whether tonight's Moon is waxing. */
  waxing: boolean;
  riseSet: MoonRiseSet;
  nextFull: Date | null;
  nextNew: Date | null;
  /** The crescent evening, when the reader is near enough to a month's edge for the question
   *  to be live at all. `coming` at the end of a month is a forecast for the month about to
   *  begin; `past` at the start of one is the evening this month's own crescent first became
   *  visible here — which is the concrete form of the whole calendar-versus-sky question, and
   *  the thing to hold the mosque's announcement against. Null when neither applies, and null
   *  when no evening in the search window qualified. */
  hilal: { day: Date; evening: DecisiveEvening; when: 'coming' | 'past' } | null;
  eclipse: EclipseNote | null;
  /** Which day of the arithmetic Hijri month the next full moon falls on. The white days are
   *  13–15, named for that full moon, so this is the one place the calendar and the sky can
   *  be compared by anyone who steps outside and looks up. */
  fullMoonHijriDay: number | null;
  time: (d: Date) => string;
  date: (d: Date) => string;
}

/**
 * A sentence, ended properly. Swedish abbreviates months with a period — "28 aug." — and an
 * abbreviation period at the end of a sentence IS the full stop; it is not doubled. Without
 * this the readout printed "nymåne 11 sep..", which is the sort of thing a reader notices
 * once and then cannot stop noticing.
 */
function sentence(text: string): string {
  return text.endsWith('.') ? text : `${text}.`;
}

/** How far the arithmetic calendar may sit from the sky before it is worth mentioning. One
 *  day is ordinary and expected — the tabular calendar is an average, and a sighting is a
 *  particular evening. Two is worth a sentence, because at two the reader looking at a full
 *  moon on the 12th or the 17th can see it for themselves. */
const DRIFT_THRESHOLD = 2;
/** The day the full moon belongs to: the middle of the three white days. */
const FULL_MOON_DAY = 14;

export function moonNotes(input: MoonNotesInput): MoonNote[] {
  const { illumination, waxing, riseSet, time, date } = input;
  const notes: MoonNote[] = [];

  // ── Tonight's Moon, and whether it is coming or going. ──
  if (riseSet.alwaysUp) {
    notes.push({ moon: illumination, waxing, text: 'Månen går inte ner i dag – den håller sig över horisonten hela dygnet.' });
  } else if (riseSet.alwaysDown) {
    notes.push({ moon: illumination, waxing, text: 'Månen kommer inte över horisonten i dag.' });
  } else if (riseSet.rise && riseSet.set) {
    // Which comes first is not cosmetic: the Moon's day is 24 h 50 min long, so it drifts
    // later through the month and the pair genuinely swaps round.
    const [a, b] = riseSet.rise < riseSet.set
      ? [`upp ${time(riseSet.rise)}`, `ner ${time(riseSet.set)}`]
      : [`ner ${time(riseSet.set)}`, `upp ${time(riseSet.rise)}`];
    notes.push({ moon: illumination, waxing, text: `Månen går ${a} och ${b}.` });
  } else if (riseSet.rise) {
    notes.push({ moon: illumination, waxing, text: `Månen går upp ${time(riseSet.rise)} och står kvar över midnatt.` });
  } else if (riseSet.set) {
    notes.push({ moon: illumination, waxing, text: `Månen går ner ${time(riseSet.set)}; den gick upp i går.` });
  }

  // ── The two instants the almanac prints. ──
  const phases: string[] = [];
  if (input.nextFull) phases.push(`fullmåne ${date(input.nextFull)}`);
  if (input.nextNew) phases.push(`nymåne ${date(input.nextNew)}`);
  if (phases.length) {
    const soonestIsFull =
      input.nextFull != null && (input.nextNew == null || input.nextFull < input.nextNew);
    const ordered = soonestIsFull ? phases : [...phases].reverse();
    notes.push({
      // The row's moon shows whichever instant comes first, so the line and its mark agree.
      // A full or new Moon has no handedness, so the flag here changes nothing and is set
      // only to keep every row the same shape.
      moon: soonestIsFull ? 1 : 0,
      waxing: true,
      text: sentence(`Nästa: ${ordered.join(' · ')}`),
    });
  }

  // ── The crescent, when the question is live. ──
  if (input.hilal) {
    const { day, evening, when } = input.hilal;
    // A hilāl is by definition the first crescent of a new month: always waxing.
    notes.push({ moon: 0.02, waxing: true, text: hilalText(day, evening, when, date, time) });
  }

  // ── An eclipse, and the prayer it calls for. ──
  if (input.eclipse) {
    const e = input.eclipse;
    // A partial eclipse says how much of the disc goes dark, because "partiell" covers
    // everything from a nick out of the edge to a Moon almost entirely in shadow, and those
    // are not the same night. A total one needs no number.
    const kind =
      e.kind === 'total'
        ? 'Total månförmörkelse'
        : `Partiell månförmörkelse (${Math.round(e.obscuration * 100)} %)`;
    notes.push({
      moon: 1,
      waxing: true,
      text: e.visibleHere
        ? `${kind} ${date(e.peak)}, synlig härifrån. Vid förmörkelse ber man ṣalāt al-khusūf.`
        : sentence(`${kind} ${date(e.peak)} – men månen står under horisonten här då`),
    });
  }

  // ── Where the calendar sits against the sky. ──
  const full = input.fullMoonHijriDay;
  if (full != null) {
    const drift = full - FULL_MOON_DAY;
    if (Math.abs(drift) >= DRIFT_THRESHOLD) {
      notes.push({
        moon: 1,
        waxing: true,
        // Stated as an observation, never as a correction: the arithmetic date is not wrong,
        // it is arithmetic, and which date the month actually begins on is the mosque's to
        // announce. What the reader gets is the means to see the gap and the door to close it.
        text: `Fullmånen infaller på ${full}:e i den räknade kalendern – vita dagarna är 13–15. Justera Hijri-datum`,
        action: 'hijriOffset',
      });
    }
  }

  return notes;
}

function hilalText(
  day: Date,
  evening: DecisiveEvening,
  when: 'coming' | 'past',
  date: (d: Date) => string,
  time: (d: Date) => string,
): string {
  switch (evening.kind) {
    case 'evaluated':
      // Two tenses, because the two are different statements. A forecast tells the reader
      // when to go out; a retrospect tells them which evening the month they are already in
      // could first have begun, which is the only checkable form of "has the calendar
      // drifted". BOTH carry the band: a zone-C evening is one the naked eye could not do.
      return when === 'coming'
        ? `${HILAL_BAND_TEXT[evening.verdict.band]} ${date(day)} – bäst omkring ${time(evening.bestTime)}, ${evening.lagMinutes} min efter solnedgången.`
        : sentence(
            `${HILAL_BAND_TEXT_PAST[evening.verdict.band]} ${date(day)}, ${evening.lagMinutes} min efter solnedgången`,
          );
    case 'moonStaysUp':
      return sentence(`Månen står över horisonten hela natten ${date(day)}`);
    case 'midnightSun':
      return 'Solen går inte ner här nu, så nymånen går inte att söka på himlen.';
    case 'polarNight':
      return 'Solen går inte upp här nu, så nymånen går inte att söka på himlen.';
  }
}

/** "62 % belyst · i nedan" — the quiet line under the hero numeral. Waning is named with the
 *  almanac's own word for it, once, where it belongs; the phase name above already says
 *  "avtagande", and repeating that would be the app talking to itself. */
export function moonFacts(illumination: number, waxing: boolean, ageDays: number): string {
  return `${formatIllumination(illumination)} belyst · ${formatMoonAge(ageDays)}${waxing ? '' : ' · i nedan'}`;
}
