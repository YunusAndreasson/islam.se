// Today's six times for the resolved location, formatted for display.
//
// Lifted out of (settings)/installningar so the introduction's calculation step can show
// the same numbers under the method picker — a setting the user cannot see land is a
// setting they cannot judge. One memo, one set of rules about which Date goes into
// formatHijri, two callers.
//
// `now` is passed IN rather than ticked here: the settings screen advances it once a
// minute only while focused (so a screen left open past midnight rolls over), while the
// intro is a short-lived flow that has no reason to tick at all. Owning the clock in the
// caller keeps both behaviours honest.
import { useMemo } from 'react';

import { formatGregorian, formatHijri } from '@/lib/hijri';
import {
  computePrayerTimes,
  formatTime,
  type PrayerKey,
  PRAYER_ICONS,
  PRAYER_LABELS,
  PRAYER_ORDER,
  PRAYER_SWEDISH_NAMES,
  type LatLng,
} from '@/lib/prayer-times';
import { stockholmPrayerDate } from '@/lib/stockholm-time';
import type { PrayerSettings } from './types';

export interface PrayerPreviewRow {
  key: PrayerKey;
  label: string;
  swedishName: string;
  icon: (typeof PRAYER_ICONS)[PrayerKey];
  time: string;
}

export interface PrayerPreview {
  /** "onsdag 10 augusti · Malmö (GPS)" */
  gregorian: string;
  hijri: string;
  times: PrayerPreviewRow[];
}

export function usePrayerPreview(
  coords: LatLng,
  label: string,
  settings: PrayerSettings,
  now: Date,
): PrayerPreview {
  return useMemo(() => {
    const prayerDate = stockholmPrayerDate(now.getTime());
    const pt = computePrayerTimes(coords, prayerDate, settings);
    return {
      gregorian: `${formatGregorian(now)} · ${label}`,
      // formatHijri reads local date FIELDS, so it gets the Stockholm-calendar-day
      // Date (prayerDate), not the raw instant — keeps the Hijri line on the same
      // civil day as the Stockholm-pinned Gregorian line on a travelling device.
      hijri: formatHijri(prayerDate, settings.hijriOffset),
      times: PRAYER_ORDER.map((key) => ({
        key,
        label: PRAYER_LABELS[key],
        swedishName: PRAYER_SWEDISH_NAMES[key],
        icon: PRAYER_ICONS[key],
        time: formatTime(pt[key]),
      })),
    };
  }, [coords, settings, now, label]);
}
