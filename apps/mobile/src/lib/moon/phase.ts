// The Moon's phase, named the way the Swedish almanac names it.
//
// The almanac printed under university privilege since 1749 marks four INSTANTS — nytändning
// (nymåne), första kvarteret, fullmåne, sista kvarteret — and calls everything between them
// tilltagande or, on the far side of full, "i nedan". So the four named bands here are
// narrow, a little over half a day each, because that is what they are: moments, not weeks.
// A widget that calls a five-day-old crescent "nymåne" is using the word for something the
// language has a different word for.
//
// Banding is on the PHASE ANGLE (elongation in ecliptic longitude, 0–360), never on the
// illuminated fraction. The fraction rises and falls, so 60 % happens twice a month and
// cannot tell a waxing evening from a waning morning; the angle runs once round, cleanly.

export const PHASE_ORDER = [
  'new',
  'waxingCrescent',
  'firstQuarter',
  'waxingGibbous',
  'full',
  'waningGibbous',
  'lastQuarter',
  'waningCrescent',
] as const;

export type PhaseKey = (typeof PHASE_ORDER)[number];

/** Half-width of the four named-instant bands, in degrees of phase angle. 7.5° is about
 *  15 hours — the day either side of the instant, and no more. */
const NAMED_HALF_WIDTH = 7.5;

export function phaseKey(phaseAngle: number): PhaseKey {
  const a = ((phaseAngle % 360) + 360) % 360;
  if (a < NAMED_HALF_WIDTH || a >= 360 - NAMED_HALF_WIDTH) return 'new';
  if (Math.abs(a - 90) < NAMED_HALF_WIDTH) return 'firstQuarter';
  if (Math.abs(a - 180) < NAMED_HALF_WIDTH) return 'full';
  if (Math.abs(a - 270) < NAMED_HALF_WIDTH) return 'lastQuarter';
  if (a < 90) return 'waxingCrescent';
  if (a < 180) return 'waxingGibbous';
  if (a < 270) return 'waningGibbous';
  return 'waningCrescent';
}

export const PHASE_NAMES: Record<PhaseKey, string> = {
  new: 'Nymåne',
  waxingCrescent: 'Tilltagande månskära',
  firstQuarter: 'Första kvarteret',
  waxingGibbous: 'Tilltagande måne',
  full: 'Fullmåne',
  // Swedish has no word for "gibbous"; the almanac simply says the moon is avtagande, and
  // "i nedan" for the whole waning half — which the readout adds once, where it belongs,
  // rather than baking it into a name that would then repeat it beside itself.
  waningGibbous: 'Avtagande måne',
  lastQuarter: 'Sista kvarteret',
  waningCrescent: 'Avtagande månskära',
};

/** "62 %" — a whole per cent, with the non-breaking space Swedish typography wants between
 *  a number and its unit (the same convention lib/prayer-times uses for its labels). */
export function formatIllumination(fraction: number): string {
  return `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)} %`;
}

/** "9 dygn" — the Moon's age since conjunction, floored, because a moon in its tenth day is
 *  nine days old the way a person is. `dygn` rather than `dagar`: this is elapsed
 *  twenty-four-hour periods, not calendar days, and Swedish distinguishes them (and takes
 *  the same form in the singular, so there is no plural branch to get wrong). */
export function formatMoonAge(ageDays: number): string {
  return `${Math.max(0, Math.floor(ageDays))} dygn`;
}
