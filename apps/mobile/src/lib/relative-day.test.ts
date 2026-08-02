import { describe, expect, it } from '@jest/globals';

import { relativeDayLabel } from './relative-day';

// Swedish relative-day names. Two things are being guarded, and only one of them is
// obvious: the WORDING (which a well-meaning edit could "modernise" to idag/imorgon), and
// the BYTES (a no-break space that a copy-paste through a plain editor silently turns into
// an ordinary one, at which point "om 12" can wrap away from "dagar" mid-sentence).
describe('relativeDayLabel', () => {
  it('names the five days Swedish has words for', () => {
    expect(relativeDayLabel(0)).toBe('i dag');
    expect(relativeDayLabel(1)).toBe('i morgon');
    expect(relativeDayLabel(2)).toBe('i övermorgon');
    expect(relativeDayLabel(-1)).toBe('i går');
    expect(relativeDayLabel(-2)).toBe('i förrgår');
  });

  // Two words, not one. "idag"/"imorgon" are ordinary in casual Swedish writing, so this
  // is exactly the kind of thing that gets "corrected" — the app is consistent on the
  // two-word forms and this keeps it that way.
  it('keeps the two-word forms', () => {
    expect(relativeDayLabel(0)).not.toBe('idag');
    expect(relativeDayLabel(1)).not.toBe('imorgon');
  });

  it('counts beyond the words, in both directions', () => {
    expect(relativeDayLabel(3)).toBe('om 3 dagar');
    expect(relativeDayLabel(30)).toBe('om 30 dagar');
    expect(relativeDayLabel(-3)).toBe('för 3 dagar sedan');
    expect(relativeDayLabel(-30)).toBe('för 30 dagar sedan');
  });

  // The assertion that survives a careless paste: check the CODE POINT, since U+00A0 and
  // U+0020 look identical in a diff, an editor and a test failure message alike.
  it('separates the count from its unit with a no-break space, not a plain one', () => {
    const forward = relativeDayLabel(4);
    expect(forward.charCodeAt(forward.indexOf('4') + 1)).toBe(0xa0);
    expect(forward).not.toContain('4 dagar'); // a plain space would match this

    const back = relativeDayLabel(-4);
    expect(back.charCodeAt(back.indexOf('4') + 1)).toBe(0xa0);
  });

  // The rails are ±365, so these are the extremes the dock can actually render.
  it('handles the day-stepper rails', () => {
    expect(relativeDayLabel(365)).toBe('om 365 dagar');
    expect(relativeDayLabel(-365)).toBe('för 365 dagar sedan');
  });
});
