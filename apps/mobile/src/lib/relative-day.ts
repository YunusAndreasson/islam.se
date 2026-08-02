// "i dag", "i morgon", "om 3 dagar" — the viewed day, named relative to the real today.
//
// This replaces a hard-coded " i morgon" in the dock, which was correct only while today
// was the only day the app could show: viewing tomorrow past its Ishaʾ, the next prayer is
// the day AFTER tomorrow's Fajr, and the dock said "i morgon" about it.
//
// Swedish conventions this file is pinned to (relative-day.test.ts asserts the bytes):
//   • "i dag" and "i morgon" are TWO words. "idag"/"imorgon" are common in casual writing
//     but not what the rest of this app uses, and the consistency is the point.
//   • The space between the numeral and "dagar" is a NO-BREAK SPACE (U+00A0), so a count
//     never wraps away from its unit — the same rule the prayer times and the notification
//     copy already follow.
//   • Sentence case, du-form, no exclamation. The app never shouts.

// The non-breaking space (U+00A0), a LITERAL character — the same form settings/options.ts
// uses, so the two files agree byte for byte. It is named rather than written inline
// because it sits inside a template string, where a literal is invisible in review; the
// test asserts the code point, not the glyph.
const NBSP = ' ';

/**
 * A Swedish label for the day `offset` days from today. Beyond ±2 it counts, because
 * Swedish runs out of idiomatic single words: there is "i övermorgon" and "i förrgår" but
 * nothing for four days out, and inventing one would read as a translation error.
 */
export function relativeDayLabel(offset: number): string {
  switch (offset) {
    case 0:
      return 'i dag';
    case 1:
      return 'i morgon';
    case 2:
      return 'i övermorgon';
    case -1:
      return 'i går';
    case -2:
      return 'i förrgår';
    default:
      return offset > 0 ? `om ${offset}${NBSP}dagar` : `för ${-offset}${NBSP}dagar sedan`;
  }
}
