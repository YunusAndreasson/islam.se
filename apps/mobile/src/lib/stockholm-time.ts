const STOCKHOLM = 'Europe/Stockholm';

export const STOCKHOLM_TIME_ZONE = STOCKHOLM;

// One formatter, built once and reused. startOfStockholmDay calls stockholmParts
// three times per invocation (directly + twice via stockholmOffsetMs), and the live
// clock calls it on every 30 s tick — constructing a fresh Intl.DateTimeFormat each
// time (one of the heavier stdlib calls) was pure waste. Lazily initialised and
// cached as null if the runtime lacks the ICU tz data (Hermes without full Intl), so
// the UTC fallback below still fires exactly as before.
let stockholmFmt: Intl.DateTimeFormat | null | undefined;
function getStockholmFmt(): Intl.DateTimeFormat | null {
  if (stockholmFmt !== undefined) return stockholmFmt;
  try {
    stockholmFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: STOCKHOLM,
      hour12: false,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
  } catch {
    stockholmFmt = null;
  }
  return stockholmFmt;
}

export function stockholmParts(epoch: number): {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
} {
  const fmt = getStockholmFmt();
  let parts: Intl.DateTimeFormatPart[] | undefined;
  if (fmt) {
    try {
      parts = fmt.formatToParts(new Date(epoch));
    } catch {
      parts = undefined;
    }
  }
  if (!parts) {
    const u = new Date(epoch);
    return {
      y: u.getUTCFullYear(),
      mo: u.getUTCMonth() + 1,
      d: u.getUTCDate(),
      h: u.getUTCHours(),
      mi: u.getUTCMinutes(),
      s: u.getUTCSeconds(),
    };
  }
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value);
  return { y: get('year'), mo: get('month'), d: get('day'), h: get('hour') % 24, mi: get('minute'), s: get('second') };
}

function stockholmOffsetMs(epoch: number): number {
  const p = stockholmParts(epoch);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - epoch;
}

export function startOfStockholmDay(epoch: number): number {
  const { y, mo, d } = stockholmParts(epoch);
  const wallMidnightAsUTC = Date.UTC(y, mo - 1, d, 0, 0, 0);
  const approx = wallMidnightAsUTC - stockholmOffsetMs(wallMidnightAsUTC);
  return wallMidnightAsUTC - stockholmOffsetMs(approx);
}

export function stockholmDayLength(dayStart: number): number {
  return startOfStockholmDay(dayStart + 26 * 60 * 60 * 1000) - dayStart;
}

/**
 * The start of the Stockholm day `days` calendar days from the one starting at `dayStart`.
 * Negative steps backwards. This is the ONLY correct way to do day arithmetic in this app.
 *
 * THE NOON ANCHOR IS LOAD-BEARING. A Stockholm day is 23, 24 or 25 hours long, so
 * `dayStart + days * 86_400_000` does not land on a midnight:
 *
 *   • On the 25-hour autumn day (DST ends), +24 h lands at 23:00 of the SAME day — so a
 *     naive "next day" step silently does nothing and the UI appears frozen.
 *   • On the 23-hour spring day, +24 h lands at 01:00 of the next day — right by luck,
 *     and only because startOfStockholmDay would then round it back down.
 *
 * Stepping to NOON of the target day and asking which day that is puts the probe 11–13
 * hours clear of either edge, so no transition can reach it. stockholm-time.test.ts pins
 * the 2026-10-25 case specifically, because it is the one a naive implementation fails.
 */
export function addStockholmDays(dayStart: number, days: number): number {
  return startOfStockholmDay(dayStart + days * 86_400_000 + 12 * 3_600_000);
}

/** A local Date whose local Y/M/D is the Stockholm calendar day for `epoch`.
 *  adhan reads Date via getFullYear/getMonth/getDate, so this intentionally makes
 *  a floating local-noon Date carrying the Stockholm calendar fields. */
export function stockholmPrayerDate(epoch: number, dayOffset = 0): Date {
  const { y, mo, d } = stockholmParts(epoch);
  return new Date(y, mo - 1, d + dayOffset, 12, 0, 0, 0);
}
