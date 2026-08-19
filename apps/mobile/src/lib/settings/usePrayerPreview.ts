// Today's six times for the resolved location, formatted for display. Just the label,
// the time, and whether the row is an obligation — the Swedish translation and the
// solar glyph went out with the full-row preview card that used to render them
// (see components/settings/PreviewStrip, which is compact by design).
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
  computeNightTimes,
  NIGHT_LABELS,
  NIGHT_ORDER,
  type NightKey,
} from '@/lib/night-times';
import {
  computePrayerTimes,
  formatTime,
  type PrayerKey,
  PRAYER_LABELS,
  PRAYER_ORDER,
  type LatLng,
} from '@/lib/prayer-times';
import { stockholmPrayerDate } from '@/lib/stockholm-time';
import type { PrayerSettings } from './types';

export interface PrayerPreviewRow {
  key: PrayerKey | NightKey;
  label: string;
  time: string;
  /** Render quieter than an obligatory prayer. True for Shurūq (a marker that closes
   *  Fajr's window) and for the night's two voluntary landmarks — everything in this list
   *  that the reader is not obliged to pray. */
  muted: boolean;
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
    const night = computeNightTimes(pt);
    return {
      gregorian: `${formatGregorian(now)} · ${label}`,
      // formatHijri reads local date FIELDS, so it gets the Stockholm-calendar-day
      // Date (prayerDate), not the raw instant — keeps the Hijri line on the same
      // civil day as the Stockholm-pinned Gregorian line on a travelling device.
      hijri: formatHijri(prayerDate, settings.hijriOffset),
      times: [
        ...PRAYER_ORDER.map((key) => ({
          key,
          label: PRAYER_LABELS[key],
          time: formatTime(pt[key]),
          // Shurūq is a marker, not a prayer — it is when Fajr's window closes.
          muted: key === 'sunrise',
        })),
        // The night's voluntary landmarks, appended rather than merged: they belong to the
        // night that BEGINS today (maghrib → next fajr), so they sit after ʿIshāʾ, and the
        // reader must be able to see where the obligations stop. Only when asked for.
        // computeNightTimes returns null where the times would be meaningless, and
        // formatTime renders that as '—' exactly as it does an unresolved prayer.
        ...(settings.showNightTimes
          ? NIGHT_ORDER.map((key) => ({
              key,
              label: NIGHT_LABELS[key],
              time: formatTime(night[key]),
              muted: true,
            }))
          : []),
      ],
    };
  }, [coords, settings, now, label]);
}
