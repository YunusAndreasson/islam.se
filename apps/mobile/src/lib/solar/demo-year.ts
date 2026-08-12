// Sampled frames of the year, for the map lesson (bonetider's MapLessonCard) — a handful
// of curated months by default (see MAP_LESSON_EXAMPLES), though any of the twelve can be
// asked for.
//
// WHAT A FRAME SHOWS, AND WHY THIS SHAPE. The hard thing to say in words is that the
// picture on the map is not the same picture all year. So each frame holds the SAME
// event — the instant Maghrib falls in Stockholm — on the 15th of a different month, and
// stepping between frames watches the sunset line swing across the country while the
// night band retreats and the polar boundary climbs into view. Anchoring on a real event
// rather than a fixed wall-clock time is what makes every frame carry content: at 21:00
// in January no prayer is crossing Sweden at all, and the lesson would open on an empty
// map. It also lets the caption state something true and startling on its own — Maghrib
// in Stockholm runs from about 15:00 in December to about 22:00 in June.
//
// WHY ITS OWN CACHE. The map's cache (./grid-cache) holds three days and is keyed by the
// viewed day; running the lesson's frames through it would evict today's grid and hand
// the map screen a 200–600 ms rebuild on the JS thread the moment the lesson closes. This
// module never touches it, and it also uses a much coarser lattice than the map's own —
// a ~0.8° × 1.0° grid, at roughly a sixth of the cost, which is still fine at the
// whole-Sweden zoom the lesson is shown at (the map hasn't been panned/zoomed yet).
import { computePrayerTimes, type PrayerKey } from '@/lib/prayer-times';
import type { PrayerSettings } from '@/lib/settings/types';
import { DEFAULT_COORDS } from '@/lib/settings/types';
import { startOfStockholmDay, stockholmDayLength, stockholmPrayerDate } from '@/lib/stockholm-time';
import type { PrayerLineData } from '@/components/map/skia/SolarSkiaOverlay';
import { buildGrid, buildLines, type PrayerLineLabel } from './field';
import { lineGridSettings } from './grid-cache';
import { type PolarBoundary, polarBoundaryFor } from './sun';

/** One frame per month, sampled mid-month so no frame lands on a solstice or equinox
 *  edge case and the twelve read as an even sweep. */
export const DEMO_FRAME_COUNT = 12;
const SAMPLE_DAY_OF_MONTH = 15;

/** The map lesson's curated stops — a calm baseline, the "wow" (no Fajr or ʿIshāʾ under
 *  the midnight sun), then the dramatic other end of the year (an afternoon Maghrib). Not
 *  a tour of the whole year — three moments worth reading. Shared between bonetider.tsx
 *  (which needs the months, to build frames) and MapLessonCard (which needs the facts). */
export const MAP_LESSON_EXAMPLES: { month: number; fact: string }[] = [
  { month: 3, fact: 'Varje linje är en bön. Den här visar var i landet det just är Maghrib.' },
  // Named, not just "i norr": Kiruna is the real, recognisable place this is true of —
  // well north of the Arctic Circle, where the sun genuinely never sets in June.
  { month: 5, fact: 'I Kiruna går solen aldrig ner i juni – där finns ingen Fajr eller ʿIshāʾ då.' },
  { month: 11, fact: 'I december kan Maghrib komma redan vid 15 på eftermiddagen.' },
];

// Generously wider than Sweden so contours reach the edges of whatever's on screen
// instead of stopping at a visible rectangular boundary — the same reasoning as
// DEFAULT_GRID_BOUNDS in ./field.
const DEMO_BOUNDS: [number, number, number, number] = [2.0, 52.0, 32.0, 72.0];
const DEMO_LAT_STEP = 0.8;
const DEMO_LON_STEP = 1.0;

export interface DemoFrame {
  /** Stockholm midnight of the sampled day. */
  dayStart: number;
  /** 23, 24 or 25 h — the demo spans real Stockholm days like the map does. */
  dayLength: number;
  /** The instant being drawn: Maghrib in Stockholm on this day. */
  instant: number;
  /** `instant` as a fraction of the day — what the wash shader reads. */
  fraction: number;
  lines: PrayerLineData[];
  /** Pill placement for each line — same shape MapMarkersOverlay reads from the live
   *  map's own `solar.labels`, so the lesson can drive that overlay directly too. */
  labels: PrayerLineLabel[];
  polarBoundary: PolarBoundary | null;
  /** "15 juni" */
  monthLabel: string;
  /** "22:02" — Maghrib in Stockholm, the instant on show. */
  timeLabel: string;
}

const DATE_FMT = new Intl.DateTimeFormat('sv-SE', {
  day: 'numeric',
  month: 'long',
  timeZone: 'Europe/Stockholm',
});
const TIME_FMT = new Intl.DateTimeFormat('sv-SE', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Stockholm',
});

/** Some ICU builds render the sv-SE time separator as "." — normalise to the colon the
 *  whole app uses (the same fix formatTime applies; see lib/prayer-times). */
const formatDemoTime = (d: Date): string => TIME_FMT.format(d).replace('.', ':');

/** Stockholm midnight of the 15th of `monthIndex` (0–11) in `year`. */
export function demoDayStart(year: number, monthIndex: number): number {
  // Midday UTC on the target date, then snapped to the Stockholm day it falls in — a
  // noon anchor, so no DST transition can push it onto the neighbouring date. Same trick
  // addStockholmDays uses, and for the same reason.
  return startOfStockholmDay(Date.UTC(year, monthIndex, SAMPLE_DAY_OF_MONTH, 12, 0, 0));
}

// Keyed by `${dayStart}|${signature}`, capped at one year's frames. A compute-affecting
// settings change (a different method or madhab) invalidates every frame at once, which
// is right: those choices are global, not per-month.
const cache = new Map<string, DemoFrame>();

/**
 * Build (or return) the frame for `monthIndex` of the year containing `todayEpoch`.
 *
 * `signature` must be `computeSignature(settings)`, passed in rather than derived here so
 * the caller's own memo keys and this cache key cannot disagree.
 *
 * `avoid` ([lon, lat], optional): keep each line's label pill clear of this point, same
 * as buildLines' own `avoid` — pass the user's real coordinates when the frame is being
 * drawn over the live map (their location dot is visible there) and omit it for a
 * standalone demo with no dot on screen. Deliberately NOT part of the cache key: it only
 * nudges pill placement, and a lesson's coordinates don't move during its few-second
 * lifetime, so a stale value between calls is not worth complicating the key over.
 */
export function demoFrame(
  monthIndex: number,
  todayEpoch: number,
  settings: PrayerSettings,
  signature: string,
  avoid?: [number, number],
): DemoFrame {
  const year = new Date(todayEpoch).getFullYear();
  const dayStart = demoDayStart(year, monthIndex);
  const key = `${dayStart}|${signature}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const prayerDate = stockholmPrayerDate(dayStart);
  const dayLength = stockholmDayLength(dayStart);

  // The event the frame is anchored on. Computed with the user's OWN settings (this is a
  // real time, shown to the user), unlike the grid below.
  const stockholmTimes = computePrayerTimes(DEFAULT_COORDS, prayerDate, settings);
  const maghrib = stockholmTimes.maghrib;
  // Maghrib is defined everywhere in Stockholm on every day of the year, but never
  // assume: fall back to the middle of the day rather than render NaN.
  const instant =
    maghrib instanceof Date && !Number.isNaN(maghrib.getTime())
      ? maghrib.getTime()
      : dayStart + dayLength / 2;

  const grid = buildGrid(prayerDate, lineGridSettings(settings), {
    bounds: DEMO_BOUNDS,
    latStep: DEMO_LAT_STEP,
    lonStep: DEMO_LON_STEP,
  });
  const solar = buildLines(grid, instant, avoid);

  const frame: DemoFrame = {
    dayStart,
    dayLength,
    instant,
    fraction: (instant - dayStart) / dayLength,
    lines: solar.lines.features.map((f) => ({
      prayer: (f.properties as { prayer: PrayerKey }).prayer,
      polylines:
        f.geometry.type === 'MultiLineString' ? (f.geometry.coordinates as [number, number][][]) : [],
    })),
    labels: solar.labels,
    polarBoundary: polarBoundaryFor(new Date(dayStart + dayLength / 2)),
    monthLabel: DATE_FMT.format(new Date(dayStart + dayLength / 2)),
    timeLabel: formatDemoTime(new Date(instant)),
  };

  cache.set(key, frame);
  while (cache.size > DEMO_FRAME_COUNT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return frame;
}

/** Test seam — mirrors __resetGridCache in ./grid-cache. */
export function __resetDemoCache(): void {
  cache.clear();
}
