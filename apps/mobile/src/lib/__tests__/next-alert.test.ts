import { describe, expect, it } from '@jest/globals';

import { alertsPerDay, isAlertEnabled, nextAlertAt } from '@/lib/notifications';
import { computePrayerTimes, PRAYER_ORDER } from '@/lib/prayer-times';
import { computeNightTimes } from '@/lib/night-times';
import { DEFAULT_SETTINGS, type PrayerSettings } from '@/lib/settings/types';
import { stockholmPrayerDate } from '@/lib/stockholm-time';

// Stockholm, and a latitude far enough north that the polar branch is reachable.
const STOCKHOLM = { latitude: 59.3293, longitude: 18.0686 };
const KIRUNA = { latitude: 67.8558, longitude: 20.2253 };

function withNotifications(patch: Partial<PrayerSettings['notifications']>): PrayerSettings {
  return {
    ...DEFAULT_SETTINGS,
    notifications: { ...DEFAULT_SETTINGS.notifications, enabled: true, ...patch },
  };
}

// A winter midday, well before the afternoon prayers — a fixed instant so the assertions
// below are about the rules, never about when the suite happened to run.
const MIDDAY = Date.UTC(2026, 0, 14, 11, 0, 0);

describe('nextAlertAt', () => {
  it('returns nothing while reminders are switched off', () => {
    expect(nextAlertAt(STOCKHOLM, DEFAULT_SETTINGS, MIDDAY)).toBeNull();
  });

  // The scheduler's own `perDay === 0` branch schedules nothing at all in this state,
  // while the settings screens went on describing reminders as planned. The screen can
  // only say so if this returns null rather than inventing a slot.
  it('returns nothing when every slot is off, even with reminders enabled', () => {
    const settings = withNotifications({
      prayers: { fajr: false, dhuhr: false, asr: false, maghrib: false, isha: false },
      fajrWindowEnd: false,
      lastThird: false,
    });
    expect(nextAlertAt(STOCKHOLM, settings, MIDDAY)).toBeNull();
  });

  it('picks the earliest slot still ahead, and never one already past', () => {
    const settings = withNotifications({});
    const next = nextAlertAt(STOCKHOLM, settings, MIDDAY);
    expect(next).not.toBeNull();
    expect(next!.fireAt.getTime()).toBeGreaterThan(MIDDAY + 60_000);

    // Nothing enabled and unfired may sit earlier than what was chosen — the contract is
    // "the next one", not "an upcoming one".
    for (let d = 0; d < 2; d++) {
      const times = computePrayerTimes(STOCKHOLM, stockholmPrayerDate(MIDDAY, d), settings);
      for (const key of PRAYER_ORDER) {
        if (!isAlertEnabled(settings.notifications, key)) continue;
        const at = times[key];
        if (!(at instanceof Date) || Number.isNaN(at.getTime())) continue;
        const fireAt = at.getTime() - settings.notifications.lead[key] * 60_000;
        if (fireAt <= MIDDAY + 60_000) continue;
        expect(fireAt).toBeGreaterThanOrEqual(next!.fireAt.getTime());
      }
    }
  });

  // The whole point of the screen this feeds: a lead is a control whose effect is
  // otherwise invisible. Raising it must move the announced arrival earlier by exactly
  // that much, against an unchanged prayer time.
  it('subtracts the lead from the prayer time, exactly as the scheduler does', () => {
    const base = withNotifications({
      prayers: { fajr: false, dhuhr: false, asr: false, maghrib: false, isha: true },
    });
    const plain = nextAlertAt(STOCKHOLM, base, MIDDAY);
    const led = nextAlertAt(
      STOCKHOLM,
      withNotifications({
        prayers: { fajr: false, dhuhr: false, asr: false, maghrib: false, isha: true },
        lead: { ...DEFAULT_SETTINGS.notifications.lead, isha: 20 },
      }),
      MIDDAY,
    );
    expect(plain!.key).toBe('isha');
    expect(led!.key).toBe('isha');
    // Same prayer, arriving 20 minutes sooner.
    expect(led!.at.getTime()).toBe(plain!.at.getTime());
    expect(plain!.fireAt.getTime() - led!.fireAt.getTime()).toBe(20 * 60_000);
  });

  // A lead can pull an alert back across midnight, and the night's last third belongs to
  // the day whose evening began it — so a single-day search would miss both. Fajr with a
  // long lead, asked late in the evening, is the case that broke a day-0-only walk.
  it('reaches into tomorrow when today has nothing left', () => {
    const lateEvening = Date.UTC(2026, 0, 14, 22, 30, 0);
    const settings = withNotifications({
      prayers: { fajr: true, dhuhr: false, asr: false, maghrib: false, isha: false },
      lead: { ...DEFAULT_SETTINGS.notifications.lead, fajr: 30 },
    });
    const next = nextAlertAt(STOCKHOLM, settings, lateEvening);
    expect(next).not.toBeNull();
    expect(next!.key).toBe('fajr');
    expect(next!.fireAt.getTime()).toBeGreaterThan(lateEvening);
    expect(next!.at.getTime() - next!.fireAt.getTime()).toBe(30 * 60_000);
  });

  it('offers the night\'s last third with no lead when it is the next thing due', () => {
    const settings = withNotifications({
      prayers: { fajr: false, dhuhr: false, asr: false, maghrib: false, isha: false },
      lastThird: true,
    });
    const next = nextAlertAt(STOCKHOLM, settings, MIDDAY);
    expect(next).not.toBeNull();
    expect(next!.key).toBe('lastThird');
    // Fires exactly when the third begins — nothing to warn about in advance.
    expect(next!.fireAt.getTime()).toBe(next!.at.getTime());
    const expected = computeNightTimes(
      computePrayerTimes(STOCKHOLM, stockholmPrayerDate(MIDDAY), settings),
    ).lastThird;
    expect(next!.at.getTime()).toBe(expected!.getTime());
  });

  // Kiruna under the midnight sun with 'unresolved': Fajr and ʿIshāʾ have no solution and
  // computePrayerTimes returns Invalid Date for both. Those must be skipped, not turned
  // into an alert at NaN — which is what unguarded `at.getTime() - lead` would produce,
  // and what the OS would then be handed as a trigger date.
  it('returns null when every enabled slot is unresolvable, rather than an invalid time', () => {
    const settings: PrayerSettings = {
      ...withNotifications({
        prayers: { fajr: true, dhuhr: false, asr: false, maghrib: false, isha: true },
      }),
      polarCircleResolution: 'unresolved',
    };
    const midnightSun = Date.UTC(2026, 5, 21, 11, 0, 0);
    // Precondition, asserted so this test fails loudly if adhan ever starts resolving
    // these — otherwise it would keep passing while testing nothing.
    const times = computePrayerTimes(KIRUNA, stockholmPrayerDate(midnightSun), settings);
    expect(Number.isNaN(times.fajr.getTime())).toBe(true);
    expect(Number.isNaN(times.isha.getTime())).toBe(true);

    expect(nextAlertAt(KIRUNA, settings, midnightSun)).toBeNull();
  });

  // The distinction the Påminnelser status line depends on: null from "nothing is
  // switched on" and null from "nothing can be computed" look identical here, so the
  // screen tells them apart with alertsPerDay. Pin that this IS the ambiguity, so nobody
  // later "simplifies" the screen back into saying "inga påminnelser är påslagna" to a
  // reader whose toggles are visibly on.
  it('cannot itself distinguish "all off" from "none computable" — both are null', () => {
    const allOff = withNotifications({
      prayers: { fajr: false, dhuhr: false, asr: false, maghrib: false, isha: false },
    });
    const unresolvable: PrayerSettings = {
      ...withNotifications({
        prayers: { fajr: true, dhuhr: false, asr: false, maghrib: false, isha: true },
      }),
      polarCircleResolution: 'unresolved',
    };
    const midnightSun = Date.UTC(2026, 5, 21, 11, 0, 0);
    expect(nextAlertAt(KIRUNA, allOff, midnightSun)).toBeNull();
    expect(nextAlertAt(KIRUNA, unresolvable, midnightSun)).toBeNull();
    // ...and this is what the screen branches on instead.
    expect(alertsPerDay(allOff.notifications)).toBe(0);
    expect(alertsPerDay(unresolvable.notifications)).toBeGreaterThan(0);
  });
});
