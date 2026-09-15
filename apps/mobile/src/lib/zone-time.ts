/**
 * The zone every date in this app is split into days by, and printed in.
 *
 * It was a `const 'Europe/Stockholm'` for as long as the app was only ever read in Sweden,
 * and that was wrong in one specific, unpleasant way: prayer times are computed from
 * COORDINATES, so a reader on umrah in Mecka got times calculated correctly for Mecka and
 * then printed on a Stockholm clock — off by an hour or two, with no indication anything
 * had happened. The day boundary moved with it: their "today" ended at 22:00 or 01:00.
 *
 * So the zone is now resolved from the device — lib/device-zone reads it from
 * expo-localization at module scope and re-reads it on every foreground — and Stockholm is
 * the DEFAULT rather than the law. This module stays free of native imports so the whole
 * calendar core remains testable without a device; device-zone is the thin edge that feeds
 * it.
 *
 * Keeping Stockholm as the default is what lets the existing suites go on meaning what
 * they say: zone-time.test.ts pins the 23- and 25-hour DST days by name, and those
 * assertions are about Sweden's calendar specifically. A test that wants another zone asks
 * for it with setDisplayZone.
 */
export const DEFAULT_ZONE = 'Europe/Stockholm';

let zone = DEFAULT_ZONE;

/** The zone in force. Read it rather than assuming Stockholm anywhere. */
export function getDisplayZone(): string {
  return zone;
}

/**
 * Point the app at a zone — called once at startup with the device's own.
 *
 * An unknown or malformed IANA name is REJECTED rather than adopted. The lazy formatter
 * below degrades to raw UTC when `Intl` cannot build it, which for a bad zone name would
 * be a far worse answer than the default: UTC is nobody's local time, whereas Stockholm is
 * at least right for the readership this app was built for. So the probe happens here,
 * where there is still something sensible to fall back to.
 */
export function setDisplayZone(tz: string | null | undefined): void {
  const next = tz?.trim() ? tz.trim() : DEFAULT_ZONE;
  if (next === zone) return;
  try {
    zoneFmt = buildZoneFmt(next);
    zone = next;
  } catch {
    zone = DEFAULT_ZONE;
    zoneFmt = undefined;
  }
}

function buildZoneFmt(tz: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });
}

// One formatter, built once and reused. startOfZoneDay calls zoneParts
// three times per invocation (directly + twice via zoneOffsetMs), and the live
// clock calls it on every 30 s tick — constructing a fresh Intl.DateTimeFormat each
// time (one of the heavier stdlib calls) was pure waste. Lazily initialised and
// cached as null if the runtime lacks the ICU tz data (Hermes without full Intl), so
// the UTC fallback below still fires exactly as before. setDisplayZone invalidates it.
let zoneFmt: Intl.DateTimeFormat | null | undefined;
function getZoneFmt(): Intl.DateTimeFormat | null {
  if (zoneFmt !== undefined) return zoneFmt;
  try {
    zoneFmt = buildZoneFmt(zone);
  } catch {
    zoneFmt = null;
  }
  return zoneFmt;
}

export function zoneParts(epoch: number): {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
} {
  const fmt = getZoneFmt();
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

function zoneOffsetMs(epoch: number): number {
  const p = zoneParts(epoch);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - epoch;
}

export function startOfZoneDay(epoch: number): number {
  const { y, mo, d } = zoneParts(epoch);
  const wallMidnightAsUTC = Date.UTC(y, mo - 1, d, 0, 0, 0);
  const approx = wallMidnightAsUTC - zoneOffsetMs(wallMidnightAsUTC);
  return wallMidnightAsUTC - zoneOffsetMs(approx);
}

// Scrubbing asks for the pending state's day length on every update. Keep that
// lookup correct across batched day changes without repeating three Intl calls
// for the same midnight. One entry bounds memory; the zone is part of its key.
let lastDayLength: { start: number; zone: string; length: number } | undefined;

export function zoneDayLength(dayStart: number): number {
  if (lastDayLength?.start === dayStart && lastDayLength.zone === zone) {
    return lastDayLength.length;
  }
  const length = startOfZoneDay(dayStart + 26 * 60 * 60 * 1000) - dayStart;
  if (Number.isFinite(length)) lastDayLength = { start: dayStart, zone, length };
  return length;
}

/**
 * The start of the day `days` calendar days from the one starting at `dayStart`, in the
 * display zone. Negative steps backwards. This is the ONLY correct way to do day arithmetic
 * in this app.
 *
 * THE NOON ANCHOR IS LOAD-BEARING. A day is not always 24 hours long — in Europe/Stockholm,
 * the default and the zone the worked examples below use, it is 23, 24 or 25 — so
 * `dayStart + days * 86_400_000` does not land on a midnight:
 *
 *   • On the 25-hour autumn day (DST ends), +24 h lands at 23:00 of the SAME day — so a
 *     naive "next day" step silently does nothing and the UI appears frozen.
 *   • On the 23-hour spring day, +24 h lands at 01:00 of the next day — right by luck,
 *     and only because startOfZoneDay would then round it back down.
 *
 * Stepping to NOON of the target day and asking which day that is puts the probe 11–13
 * hours clear of either edge, so no transition can reach it. zone-time.test.ts pins
 * the 2026-10-25 case specifically, because it is the one a naive implementation fails.
 */
export function addZoneDays(dayStart: number, days: number): number {
  return startOfZoneDay(dayStart + days * 86_400_000 + 12 * 3_600_000);
}

/** A local Date whose local Y/M/D is the DISPLAY ZONE's calendar day for `epoch`.
 *  adhan reads Date via getFullYear/getMonth/getDate, so this intentionally makes
 *  a floating local-noon Date carrying that zone's calendar fields. */
export function zonePrayerDate(epoch: number, dayOffset = 0): Date {
  const { y, mo, d } = zoneParts(epoch);
  return new Date(y, mo - 1, d + dayOffset, 12, 0, 0, 0);
}
