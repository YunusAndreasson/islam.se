// The fallback formatter (`fallbackFormat`) only runs on a Hermes runtime that lacks
// full ICU timezone data — so it never executes under jest (Node has full ICU) and was
// historically untested. It carried a real DST bug: a flat "March–October = summer"
// window that rendered the two transition weeks an hour off (late March before the
// spring-forward, late October after the fall-back). adhan computes prayer times as UTC
// instants, so a wrong wall-clock offset there shows the user the wrong prayer time.
//
// The oracle here is the canonical Intl path (`formatTime`), which reads the real IANA
// Europe/Stockholm zone — a fully independent implementation from the fallback's hand
// arithmetic. If the fallback agrees with Intl on every instant of the year, including
// both transition weekends, its DST logic is correct.
import { describe, expect, it } from '@jest/globals';

import { fallbackFormat, formatTime } from './prayer-times';

// sv-SE may render the time separator as ':' or '.' depending on the ICU build; the
// fallback always uses ':'. Normalise both before comparing — we're testing the
// hour/minute VALUE (the DST offset), not the separator glyph.
const norm = (s: string): string => s.replace('.', ':');

describe('fallbackFormat — DST offset matches the IANA Europe/Stockholm zone', () => {
  it('agrees with the Intl formatter on every day of 2026 (catches any transition-week drift)', () => {
    // 09:30 UTC: safely clear of the 01:00-UTC switch instant and of midnight wrap, so
    // each day is unambiguously winter or summer. Sweeping all 365 days makes BOTH
    // transition boundaries (last Sun of March, last Sun of October) fall inside the
    // range — the old month-window bug fails here on ~13 days, the fix passes on all.
    const mismatches: string[] = [];
    for (let day = 0; day < 365; day++) {
      const d = new Date(Date.UTC(2026, 0, 1 + day, 9, 30, 0));
      const got = norm(fallbackFormat(d));
      const want = norm(formatTime(d));
      if (got !== want) mismatches.push(`${d.toISOString()}: fallback ${got} ≠ Intl ${want}`);
    }
    expect(mismatches).toEqual([]);
  });

  it('handles the spring-forward weekend (last Sunday of March 2026 = 29 Mar)', () => {
    // 28 Mar is still CET (+1); the old code treated all of March as CEST (+2) → +1h too
    // late. 29 Mar after 01:00 UTC is CEST (+2). Both must match Intl.
    const beforeSwitch = new Date(Date.UTC(2026, 2, 28, 9, 0, 0)); // Sat, winter
    const afterSwitch = new Date(Date.UTC(2026, 2, 29, 9, 0, 0)); // Sun, summer
    expect(norm(fallbackFormat(beforeSwitch))).toBe(norm(formatTime(beforeSwitch)));
    expect(norm(fallbackFormat(afterSwitch))).toBe(norm(formatTime(afterSwitch)));
    // Pin the concrete values so the assertion documents the offsets, not just agreement.
    expect(fallbackFormat(beforeSwitch)).toBe('10:00'); // 09:00 UTC + 1h (CET)
    expect(fallbackFormat(afterSwitch)).toBe('11:00'); // 09:00 UTC + 2h (CEST)
  });

  it('handles the fall-back weekend (last Sunday of October 2026 = 25 Oct)', () => {
    // 24 Oct is still CEST (+2); 26 Oct is CET (+1). The old code treated all of October
    // as CEST → late-October times rendered +1h too late.
    const beforeSwitch = new Date(Date.UTC(2026, 9, 24, 9, 0, 0)); // Sat, summer
    const afterSwitch = new Date(Date.UTC(2026, 9, 26, 9, 0, 0)); // Mon, winter
    expect(norm(fallbackFormat(beforeSwitch))).toBe(norm(formatTime(beforeSwitch)));
    expect(norm(fallbackFormat(afterSwitch))).toBe(norm(formatTime(afterSwitch)));
    expect(fallbackFormat(beforeSwitch)).toBe('11:00'); // 09:00 UTC + 2h (CEST)
    expect(fallbackFormat(afterSwitch)).toBe('10:00'); // 09:00 UTC + 1h (CET)
  });

  it('matches Intl at the exact 01:00-UTC switch instants (boundary precision)', () => {
    // EU DST flips at 01:00 UTC. One minute before is the old season, the switch instant
    // is the new one. Pinning these proves the boundary is `>=`/`<` correct, not ±1h.
    const springBefore = new Date(Date.UTC(2026, 2, 29, 0, 59, 0)); // still CET
    const springAt = new Date(Date.UTC(2026, 2, 29, 1, 0, 0)); // now CEST
    const fallBefore = new Date(Date.UTC(2026, 9, 25, 0, 59, 0)); // still CEST
    const fallAt = new Date(Date.UTC(2026, 9, 25, 1, 0, 0)); // now CET
    for (const d of [springBefore, springAt, fallBefore, fallAt]) {
      expect(norm(fallbackFormat(d))).toBe(norm(formatTime(d)));
    }
  });

  it('holds across multiple years — the boundary is computed, not hard-coded to 2026', () => {
    // Sweep a handful of years at a safe hour so a future ICU/zone change is caught and
    // the last-Sunday computation is exercised on different weekday alignments.
    const mismatches: string[] = [];
    for (const year of [2024, 2025, 2027, 2030]) {
      for (let day = 0; day < 365; day += 5) {
        const d = new Date(Date.UTC(year, 0, 1 + day, 9, 30, 0));
        if (norm(fallbackFormat(d)) !== norm(formatTime(d))) {
          mismatches.push(`${d.toISOString()}`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });
});
