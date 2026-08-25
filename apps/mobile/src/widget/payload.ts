// The data model the home-screen widget renders, and the pure builder that produces
// it for a given instant. This is deliberately framework-free (no React, no native
// modules): it reuses the SAME prayer-time, Hijri and formatting libraries the app
// screens use, so the widget can never show a different schedule than the app. The
// iOS widget UI (src/widgets/PrayerTimesWidget.tsx) consumes a WidgetPayload as its
// props; the timeline builder (./timeline.ts) calls buildPayloadAt once per segment.
import { formatGregorian, formatHijri } from '@/lib/hijri';
import {
  computePrayerTimes,
  formatTime,
  type LatLng,
  nextPrayerKeyAt,
  PRAYER_LABELS,
  PRAYER_ORDER,
  type PrayerKey,
  PRAYER_SWEDISH_NAMES,
  selectNextPrayer,
} from '@/lib/prayer-times';
import type { PrayerTimes } from 'adhan';
import type { PrayerSettings, ThemePreference } from '@/lib/settings/types';
import { zonePrayerDate } from '@/lib/zone-time';

/** Resolve the prayer times for a given Stockholm prayer-date. A timeline build passes
 *  a per-day-memoised resolver so the same calendar day isn't recomputed for each of
 *  its ~16 entries; standalone callers omit it and compute directly. */
export type DayResolver = (prayerDate: Date) => PrayerTimes;

/** One row in the widget's day schedule. `sunrise` is a marker (end of Fajr's
 *  window), not a prayer — flagged so the UI can render it quietly. */
export interface WidgetPrayerRow {
  key: PrayerKey;
  /** Transliterated prayer/time-marker name, e.g. "Ẓuhr". */
  arabic: string;
  /** Swedish name, e.g. "Middagsbönen". */
  swedish: string;
  /** 24-hour clock time in the app's display zone (lib/zone-time — the device's own,
   *  Stockholm by default), or "—" if unresolved (polar night/day). */
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
  /** The next prayer/time marker's transliterated name ("" when none could be resolved). */
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
  // The Stockholm calendar day, as a local Date carrying its Y/M/D — the same civil
  // day every other label uses. formatHijri reads local date FIELDS, so passing the
  // raw instant would read the DEVICE's calendar day instead: on a phone outside
  // Europe/Stockholm the Hijri line could disagree with the (Stockholm-pinned)
  // Gregorian line by a day around midnight.
  const civilDay = zonePrayerDate(atMs);
  const times = compute(civilDay);

  // The same selector the map dock uses, rather than a second copy of the rollover rule —
  // including its range check, which this path used to be missing. "Tomorrow's Fajr" is not
  // automatically ahead of `atMs`: under the middle-of-the-night rule far north it can fall
  // just before midnight (at Treriksröset the Fajr belonging to 28 March is at 23:59 on the
  // 27th), and `nextAtMs` drives a LIVE relative countdown in the widget and the Live
  // Activity — so a past instant does not merely read oddly, it counts upwards until the next
  // timeline entry replaces it. See selectNextPrayer for the full reasoning.
  //
  // The next day is computed only once the viewed day is spent: a whole adhan day is the
  // expensive part of building a payload, and buildTimeline builds many of them. The extra
  // nextPrayerKeyAt call is six getTime()s.
  const spent = nextPrayerKeyAt(times, atMs) === null;
  const tomorrowFajrAt = spent ? compute(zonePrayerDate(atMs, 1)).fajr.getTime() : null;
  const next = selectNextPrayer(times, tomorrowFajrAt, atMs);

  const nextArabic = next ? PRAYER_LABELS[next.key] : '';
  const nextSwedish = next ? PRAYER_SWEDISH_NAMES[next.key] : '';
  const nextTime = next ? formatTime(new Date(next.at)) : '–';
  const nextAtMs = next ? next.at : null;
  const nextIsTomorrow = next?.nextDay ?? false;

  const rows: WidgetPrayerRow[] = PRAYER_ORDER.map((key) => ({
    key,
    arabic: PRAYER_LABELS[key],
    swedish: PRAYER_SWEDISH_NAMES[key],
    time: formatTime(times[key]),
    isMarker: key === 'sunrise',
    isNext: next != null && !next.nextDay && key === next.key,
  }));

  return {
    location,
    gregorian: formatGregorian(date),
    hijri: formatHijri(civilDay, settings.hijriOffset),
    rows,
    nextArabic,
    nextSwedish,
    nextTime,
    nextAtMs,
    nextIsTomorrow,
    theme: settings.theme,
  };
}
