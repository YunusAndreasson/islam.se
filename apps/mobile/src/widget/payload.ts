// The data model the home-screen widget renders, and the pure builder that produces
// it for a given instant. This is deliberately framework-free (no React, no native
// modules): it reuses the SAME prayer-time, Hijri and formatting libraries the app
// screens use, so the widget can never show a different schedule than the app. The
// iOS widget UI (src/widgets/PrayerTimesWidget.tsx) consumes a WidgetPayload as its
// props; the timeline builder (./timeline.ts) calls buildPayloadAt once per segment.
import { formatGregorian, formatHijri } from '../lib/hijri';
import {
  computePrayerTimes,
  formatTime,
  type LatLng,
  nextPrayerKeyAt,
  PRAYER_LABELS,
  PRAYER_ORDER,
  type PrayerKey,
  PRAYER_SWEDISH_NAMES,
} from '../lib/prayer-times';
import type { PrayerTimes } from 'adhan';
import type { PrayerSettings, ThemePreference } from '../lib/settings/types';
import { stockholmPrayerDate } from '../lib/stockholm-time';

/** Resolve the prayer times for a given Stockholm prayer-date. A timeline build passes
 *  a per-day-memoised resolver so the same calendar day isn't recomputed for each of
 *  its ~16 entries; standalone callers omit it and compute directly. */
export type DayResolver = (prayerDate: Date) => PrayerTimes;

/** One row in the widget's day schedule. `sunrise` is a marker (end of Fajr's
 *  window), not a prayer — flagged so the UI can render it quietly. */
export interface WidgetPrayerRow {
  key: PrayerKey;
  /** Arabic name in the app's transliteration, e.g. "Ẓuhr". */
  arabic: string;
  /** Swedish name, e.g. "Middagsbönen". */
  swedish: string;
  /** 24-hour Europe/Stockholm clock time, or "—" if unresolved (polar night/day). */
  time: string;
  /** True for sunrise (Shurūq) — a time marker, not an obligatory prayer. */
  isMarker: boolean;
  /** True for the prayer the widget is counting down to (today only). */
  isNext: boolean;
}

/** Everything the widget needs to render a single timeline entry. Plain JSON so it
 *  can cross the bridge to the native WidgetKit extension unchanged. */
export interface WidgetPayload {
  /** City / tätort label, e.g. "Göteborg". */
  location: string;
  /** "Tisdag 26 maj". */
  gregorian: string;
  /** "9 Dhū al-ḥijja 1447". */
  hijri: string;
  /** All six slots in chronological order (incl. sunrise marker). */
  rows: WidgetPrayerRow[];
  /** The next prayer/marker's Arabic name ("" when none could be resolved). */
  nextArabic: string;
  nextSwedish: string;
  /** Its clock time, or "—". */
  nextTime: string;
  /** Its epoch ms, for the widget's live relative countdown (null if unresolved). */
  nextAtMs: number | null;
  /** True when the next prayer is tomorrow's Fajr (today's are all past). */
  nextIsTomorrow: boolean;
  /** The user's appearance preference; the widget resolves 'system' against the
   *  WidgetKit colour scheme, and honours an explicit 'light'/'dark' lock. */
  theme: ThemePreference;
}

/**
 * Build the widget payload as of the instant `atMs`, for `coords`/`settings`.
 * The "next" prayer is the first slot at-or-after `atMs` (same rule the app's dock
 * uses, {@link nextPrayerKeyAt}); when every slot today has passed it rolls over to
 * tomorrow's Fajr. `location` is threaded in (resolved once by the caller) so every
 * entry in a timeline shares one label.
 */
export function buildPayloadAt(
  coords: LatLng,
  settings: PrayerSettings,
  atMs: number,
  location: string,
  resolveDay?: DayResolver,
): WidgetPayload {
  // Default resolver computes directly; buildTimeline passes a per-day-cached one so a
  // timeline's many entries on the same calendar day share a single adhan computation.
  const compute = resolveDay ?? ((d: Date) => computePrayerTimes(coords, d, settings));
  const date = new Date(atMs);
  const times = compute(stockholmPrayerDate(atMs));
  const nextKey = nextPrayerKeyAt(times, atMs);

  let nextArabic = '';
  let nextSwedish = '';
  let nextTime = '—';
  let nextAtMs: number | null = null;
  let nextIsTomorrow = false;

  if (nextKey) {
    // nextPrayerKeyAt only returns a slot whose time is finite, so this is safe.
    nextArabic = PRAYER_LABELS[nextKey];
    nextSwedish = PRAYER_SWEDISH_NAMES[nextKey];
    nextTime = formatTime(times[nextKey]);
    nextAtMs = times[nextKey].getTime();
  } else {
    // Past today's Isha → the next event is tomorrow's Fajr.
    const tomorrow = compute(stockholmPrayerDate(atMs, 1));
    const fajr = tomorrow.fajr;
    if (fajr instanceof Date && !Number.isNaN(fajr.getTime())) {
      nextArabic = PRAYER_LABELS.fajr;
      nextSwedish = PRAYER_SWEDISH_NAMES.fajr;
      nextTime = formatTime(fajr);
      nextAtMs = fajr.getTime();
      nextIsTomorrow = true;
    }
  }

  const rows: WidgetPrayerRow[] = PRAYER_ORDER.map((key) => ({
    key,
    arabic: PRAYER_LABELS[key],
    swedish: PRAYER_SWEDISH_NAMES[key],
    time: formatTime(times[key]),
    isMarker: key === 'sunrise',
    isNext: !nextIsTomorrow && key === nextKey,
  }));

  return {
    location,
    gregorian: formatGregorian(date),
    hijri: formatHijri(date, settings.hijriOffset),
    rows,
    nextArabic,
    nextSwedish,
    nextTime,
    nextAtMs,
    nextIsTomorrow,
    theme: settings.theme,
  };
}
