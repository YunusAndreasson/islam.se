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
  PRAYER_LABELS,
  PRAYER_ORDER,
  type PrayerKey,
  PRAYER_SWEDISH_NAMES,
  selectNextPrayer,
} from '@/lib/prayer-times';
import type { PrayerTimes } from 'adhan';
import type { PrayerSettings, ThemePreference } from '@/lib/settings/types';
import { sunAltitudeDeg } from '@/lib/solar/sun';
import { addZoneDays, startOfZoneDay, zonePrayerDate } from '@/lib/zone-time';

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
  /** Latest prayer window to have opened and still shown in this schedule. */
  isCurrent?: boolean;
}

export interface WidgetSolarDay {
  startMs: number;
  endMs: number;
  /** Solar altitude in degrees at equally spaced instants, including both endpoints. */
  altitudes: number[];
}

export function widgetSolarDay(coords: LatLng, startMs: number): WidgetSolarDay {
  const endMs = addZoneDays(startMs, 1);
  return {
    startMs,
    endMs,
    altitudes: Array.from({ length: 25 }, (_, hour) => sunAltitudeDeg(
      coords.latitude, coords.longitude, new Date(startMs + (endMs - startMs) * hour / 24),
    )),
  };
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
  /** True when the event occurs on tomorrow's civil date in the display zone. */
  nextIsTomorrow: boolean;
  nextDayKey?: PrayerKey;
  /** The hero may count down to a slot outside the displayed rows. */
  previousDayNextKey?: PrayerKey;
  tomorrowFajr?: string;
  solar?: WidgetSolarDay & { progress: number; altitude: number; rising: boolean };
  status?: 'expired';
  /** The user's appearance preference; the widget resolves 'system' against the
   *  WidgetKit colour scheme, and honours an explicit 'light'/'dark' lock. */
  theme: ThemePreference;
}

/**
 * Build the widget payload as of the instant `atMs`, for `coords`/`settings`.
 * The next prayer is the first slot strictly after `atMs`, including occurrences
 * across adjacent prayer dates. The timeline shares one location label.
 */
export function buildPayloadAt(
  coords: LatLng,
  settings: PrayerSettings,
  atMs: number,
  location: string,
  resolveDay?: DayResolver,
  resolveSolar?: (startMs: number) => WidgetSolarDay,
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

  // Adjacent prayer dates can overlap today after high-latitude rules and adjustments.
  const tomorrow = zonePrayerDate(atMs, 1);
  const tomorrowTimes = compute(tomorrow);
  const previousTimes = compute(zonePrayerDate(atMs, -1));
  // At its starting instant a prayer becomes current. The app's general
  // next-prayer query is inclusive, so advance its instant by one millisecond here.
  const next = selectNextPrayer(times, tomorrowTimes, atMs + 1, previousTimes);
  let current: { key: PrayerKey; at: number; today: boolean } | undefined;
  for (const [day, today] of [[previousTimes, false], [times, true], [tomorrowTimes, false]] as const) {
    for (const key of PRAYER_ORDER) {
      const at = day[key].getTime();
      if (at <= atMs && (!current || at > current.at)) current = { key, at, today };
    }
  }

  const dayStart = startOfZoneDay(atMs);
  const solarDay = resolveSolar?.(dayStart) ?? widgetSolarDay(coords, dayStart);
  const altitude = sunAltitudeDeg(coords.latitude, coords.longitude, date);
  const rising = sunAltitudeDeg(coords.latitude, coords.longitude, new Date(atMs + 60_000)) > altitude;

  const nextArabic = next ? PRAYER_LABELS[next.key] : '';
  const nextSwedish = next ? PRAYER_SWEDISH_NAMES[next.key] : '';
  const nextTime = next ? formatTime(new Date(next.at)) : '–';
  const nextAtMs = next ? next.at : null;
  const nextIsTomorrow = next != null && zonePrayerDate(next.at).getTime() === tomorrow.getTime();

  const rows: WidgetPrayerRow[] = PRAYER_ORDER.map((key) => ({
    key,
    arabic: PRAYER_LABELS[key],
    swedish: PRAYER_SWEDISH_NAMES[key],
    time: formatTime(times[key]),
    isMarker: key === 'sunrise',
    isNext: next != null && !next.nextDay && !next.previousDay && key === next.key,
    isCurrent: current?.today === true && key === current.key && key !== 'sunrise',
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
    tomorrowFajr: formatTime(tomorrowTimes.fajr),
    solar: {
      ...solarDay,
      progress: (atMs - dayStart) / (solarDay.endMs - dayStart),
      altitude,
      rising,
    },
    ...(next?.nextDay ? { nextDayKey: next.key } : {}),
    ...(next?.previousDay ? { previousDayNextKey: next.key } : {}),
    theme: settings.theme,
  };
}
