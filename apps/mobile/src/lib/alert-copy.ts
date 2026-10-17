// What an alert SAYS — the Swedish copy for each slot, apart from when and whether it is
// scheduled (./notifications). Pure, so the copy contract is testable without the scheduler,
// and shared with the prayer Live Activity, whose stale view must read exactly like the
// alert that arrives at the same moment.
import { formatTime, PRAYER_LABELS, type PrayerKey } from './prayer-times';

/**
 * Title + body for one alert. Extracted as a pure function so the Swedish copy contract
 * is testable without running the scheduler. NBSP (fast mellanslag) between the numeral
 * and "min" so the unit can never wrap away from its number in a narrow banner.
 */
export function alertContent(
  key: PrayerKey,
  at: Date,
  lead: number,
): { title: string; body: string } {
  if (key === 'sunrise') {
    return {
      title: lead > 0 ? `Fajr-tiden slutar om ${lead} min` : 'Fajr-tiden är slut',
      body: `Soluppgång ${formatTime(at)}`,
    };
  }
  const label = PRAYER_LABELS[key];
  return {
    // Lead with the glanceable answer in the bold title — which prayer, how soon — and
    // demote the exact clock time to the lighter body as the durable fact.
    title: lead > 0 ? `${label} om ${lead} min` : `Dags för ${label}`,
    body: `Klockan ${formatTime(at)}`,
  };
}

/**
 * The night's-last-third alert. A function of its own rather than a branch in
 * {@link alertContent} because it is not keyed by a PrayerKey and takes no lead — it fires
 * exactly when the last third begins. The Swedish name carries it: the transliteration
 * that heads the dock row is the wrong register for a lock screen at one in the morning.
 */
export function nightAlertContent(at: Date): { title: string; body: string } {
  return {
    title: 'Nattens sista tredjedel',
    body: `Klockan ${formatTime(at)}`,
  };
}
