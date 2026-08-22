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

/**
 * How hard a row has earned its place on the screen itself, rather than behind the almanac's
 * door. Every note here is TRUE; the tier is only about which question the reader came with.
 *
 *   `tonight`  A fact about the night they are standing in. One row, always shown.
 *   `alert`    The reason someone opens this screen on this particular day: the crescent
 *              question at a month's edge, an eclipse they can walk outside and see, or a
 *              calendar that has drifted far enough from the sky to be worth correcting.
 *              Rare by construction — most days produce none at all.
 *   `almanac`  True, and reference. A conjunction a fortnight out, or an eclipse over
 *              another hemisphere, is worth having and is not worth a permanent row on the
 *              one surface someone opens to ask what day it is.
 *
 * The screen shows `tonight` and `alert`; everything else waits in the almanac sheet, which
 * shows the whole list in order. Nothing is deleted — only deferred.
 */
export type MoonNoteTier = 'tonight' | 'alert' | 'almanac';

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
  /** Where the row belongs — see MoonNoteTier. */
  tier: MoonNoteTier;
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
  //
  // NO ROW SAYS "MÅNEN". Every one of them leads with a small Moon at its own phase, and a
  // column of sentences that each open by naming their subject under a drawing of that
  // subject is the app reading its own bullet points aloud. What is left is almanac voice —
  // "Upp 16:52 · ner 20:24" — which is also what it says on the page these rows come from.
  if (riseSet.alwaysUp) {
    notes.push({ moon: illumination, waxing, tier: 'tonight', text: 'Går inte ner i dag.' });
  } else if (riseSet.alwaysDown) {
    notes.push({ moon: illumination, waxing, tier: 'tonight', text: 'Kommer inte upp i dag.' });
  } else if (riseSet.rise && riseSet.set) {
    // Which comes first is not cosmetic: the Moon's day is 24 h 50 min long, so it drifts
    // later through the month and the pair genuinely swaps round.
    const [a, b] = riseSet.rise < riseSet.set
      ? [`Upp ${time(riseSet.rise)}`, `ner ${time(riseSet.set)}`]
      : [`Ner ${time(riseSet.set)}`, `upp ${time(riseSet.rise)}`];
    notes.push({ moon: illumination, waxing, tier: 'tonight', text: `${a} · ${b}` });
  } else if (riseSet.rise) {
    notes.push({ moon: illumination, waxing, tier: 'tonight', text: `Upp ${time(riseSet.rise)} · kvar över midnatt` });
  } else if (riseSet.set) {
    notes.push({ moon: illumination, waxing, tier: 'tonight', text: `Ner ${time(riseSet.set)} · uppe sedan i går` });
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
      // Reference, not news. Which instant is next is on the ring already — day 30 is where
      // the month ends — and a date a fortnight out changes nothing anyone does tonight.
      tier: 'almanac',
      text: sentence(`Nästa: ${ordered.join(' · ')}`),
    });
  }

  // ── The crescent, when the question is live. ──
  if (input.hilal) {
    const { day, evening, when } = input.hilal;
    // A hilāl is by definition the first crescent of a new month: always waxing.
    // The one row this whole screen exists for, and it only appears within a few days of a
    // month's edge. When it is here it outranks everything else on the surface.
    notes.push({ moon: 0.02, waxing: true, tier: 'alert', text: hilalText(day, evening, when, date, time) });
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
      // An eclipse you can go outside and look at calls for a prayer, which makes it a thing
      // to do tonight. One over another hemisphere is a fact about the solar system.
      tier: e.visibleHere ? 'alert' : 'almanac',
      text: e.visibleHere
        ? `${kind} ${date(e.peak)}, synlig härifrån. Då ber man ṣalāt al-khusūf.`
        : sentence(`${kind} ${date(e.peak)} – under horisonten här`),
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
        // A door, and the only row here that asks the reader to do something. It stays on
        // the surface: a correction folded away behind a chevron is a correction nobody makes.
        tier: 'alert',
        // Stated as an observation, never as a correction: the arithmetic date is not wrong,
        // it is arithmetic, and which date the month actually begins on is the mosque's to
        // announce. What the reader gets is the means to see the gap and the door to close it.
        // "Räknad" is what carries the whole distinction — this is the arithmetic calendar's
        // full moon, not the sky's — in one word, where the first draft spent six on
        // "infaller på … i den räknade kalendern".
        text: `Räknad fullmåne på ${full}:e – vita dagarna är 13–15. Justera Hijri-datum`,
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
      return sentence(`Över horisonten hela natten ${date(day)}`);
    case 'midnightSun':
      return 'Solen går inte ner här nu – nymånen går inte att söka.';
    case 'polarNight':
      return 'Solen går inte upp här nu – nymånen går inte att söka.';
  }
}

/** "62 % belyst · i nedan" — the quiet line under the hero numeral. Waning is named with the
 *  almanac's own word for it, once, where it belongs; the phase name above already says
 *  "avtagande", and repeating that would be the app talking to itself. */
export function moonFacts(illumination: number, waxing: boolean, ageDays: number): string {
  return `${formatIllumination(illumination)} belyst · ${formatMoonAge(ageDays)}${waxing ? '' : ' · i nedan'}`;
}
