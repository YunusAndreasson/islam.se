import { describe, expect, it } from '@jest/globals';

import { type LatLng, PRAYER_LABELS } from '../lib/prayer-times';
import { DEFAULT_SETTINGS, type PrayerSettings } from '../lib/settings/types';
import { oracleTimes } from '../test-utils/prayer-oracle';
import {
  buildPrayerActivityProps,
  isWithinLiveActivityWindow,
  LIVE_ACTIVITY_WINDOW_MS,
} from './live-activity';
import { buildPayloadAt } from './payload';

const STOCKHOLM: LatLng = { latitude: 59.3293, longitude: 18.0686 };
const KIRUNA: LatLng = { latitude: 67.8558, longitude: 20.2253 };
// A spring day where every Stockholm prayer is computable — a stable reference.
const SPRING_DAY = new Date(2026, 2, 20); // 20 Mar 2026
// Midnight sun: polar slots are unresolved Invalid Dates under the 'unresolved' rule.
const MIDSUMMER = new Date(2026, 5, 21); // 21 Jun 2026

function settings(overrides: Partial<PrayerSettings> = {}): PrayerSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

describe('isWithinLiveActivityWindow', () => {
  const now = new Date(2026, 2, 20, 12, 0, 0).getTime();

  it('accepts a prayer just inside the window and rejects one just outside', () => {
    // Boundary contract: the window is (0, LIVE_ACTIVITY_WINDOW_MS] — an activity an
    // hour out is glanceable, one at 60 min + 1 ms is not yet.
    expect(isWithinLiveActivityWindow(now + LIVE_ACTIVITY_WINDOW_MS, now)).toBe(true);
    expect(isWithinLiveActivityWindow(now + LIVE_ACTIVITY_WINDOW_MS + 1, now)).toBe(false);
    expect(isWithinLiveActivityWindow(now + 1, now)).toBe(true);
  });

  it('rejects a prayer that has already passed — a countdown to the past is nonsense', () => {
    expect(isWithinLiveActivityWindow(now, now)).toBe(false);
    expect(isWithinLiveActivityWindow(now - 1, now)).toBe(false);
  });

  it('rejects null (unresolved polar slot — nothing to count down to)', () => {
    expect(isWithinLiveActivityWindow(null, now)).toBe(false);
  });
});

describe('buildPrayerActivityProps', () => {
  const ref = oracleTimes(STOCKHOLM, SPRING_DAY);

  it('inside the window, produces a countdown anchored at now and ending at the prayer', () => {
    const now = ref.asr.getTime() - 30 * 60 * 1000; // 30 min before ʿAṣr
    const payload = buildPayloadAt(STOCKHOLM, settings(), now, 'Stockholm');
    const props = buildPrayerActivityProps(payload, now);

    expect(props).not.toBeNull();
    expect(props?.nextKey).toBe('asr');
    expect(props?.nextArabic).toBe(PRAYER_LABELS.asr);
    // The system renders timerInterval [startedAtMs, nextAtMs] — both bounds must be
    // exact or the live countdown shows the wrong remaining time.
    expect(props?.startedAtMs).toBe(now);
    expect(props?.nextAtMs).toBe(ref.asr.getTime());
    expect(props?.isMarker).toBe(false);
  });

  it('flags the sunrise marker so the UI can say "NÄSTA TID", not "NÄSTA BÖN"', () => {
    const now = ref.sunrise.getTime() - 10 * 60 * 1000; // after Fajr, before sunrise
    const payload = buildPayloadAt(STOCKHOLM, settings(), now, 'Stockholm');
    const props = buildPrayerActivityProps(payload, now);
    expect(props?.nextKey).toBe('sunrise');
    expect(props?.isMarker).toBe(true);
  });

  it('returns null outside the window — no activity hours before a prayer', () => {
    const now = ref.asr.getTime() - LIVE_ACTIVITY_WINDOW_MS - 60_000;
    const payload = buildPayloadAt(STOCKHOLM, settings(), now, 'Stockholm');
    expect(buildPrayerActivityProps(payload, now)).toBeNull();
  });

  it('counts down to Fajr in the early morning (the day’s first prayer must appear)', () => {
    const tomorrow = oracleTimes(STOCKHOLM, new Date(2026, 2, 21));
    const now = tomorrow.fajr.getTime() - 30 * 60 * 1000;
    const payload = buildPayloadAt(STOCKHOLM, settings(), now, 'Stockholm');
    const props = buildPrayerActivityProps(payload, now);

    expect(props?.nextKey).toBe('fajr');
    expect(props?.isMarker).toBe(false);
    expect(props?.nextAtMs).toBe(tomorrow.fajr.getTime());
  });

  it('resolves Fajr on a synthetic nextIsTomorrow payload (defensive rollover branch)', () => {
    // In production nextIsTomorrow only holds between Isha and midnight, and Fajr is
    // never under an hour from then — but if that ever changed (calculation methods,
    // polar rules), the rows carry no isNext flag and the props must still resolve to
    // Fajr rather than silently returning null.
    const now = new Date(2026, 2, 20, 23, 30).getTime();
    const payload = buildPayloadAt(STOCKHOLM, settings(), now, 'Stockholm');
    const synthetic = {
      ...payload,
      nextIsTomorrow: true,
      nextAtMs: now + 30 * 60 * 1000,
      rows: payload.rows.map((r) => ({ ...r, isNext: false })),
    };
    const props = buildPrayerActivityProps(synthetic, now);
    expect(props?.nextKey).toBe('fajr');
    expect(props?.isMarker).toBe(false);
  });

  it('preloads the following prayer for the stale-date transition', () => {
    const now = ref.asr.getTime() - 30 * 60 * 1000;
    const payload = buildPayloadAt(STOCKHOLM, settings(), now, 'Stockholm');
    const following = buildPayloadAt(STOCKHOLM, settings(), ref.asr.getTime() + 1000, 'Stockholm');
    const props = buildPrayerActivityProps(payload, now, following);

    expect(props).not.toBeNull();
    expect(props?.nextKey).toBe('asr');
    expect(props?.afterKey).toBe('maghrib');
    expect(props?.afterAtMs).toBe(ref.maghrib.getTime());
    expect(props?.afterIsMarker).toBe(false);
  });

  it('returns null in the polar midnight sun when no next slot resolves', () => {
    // With the explicit unresolved polar rule, every remaining/tomorrow-Fajr candidate
    // is absent at this hour — the activity must not fabricate a countdown.
    const noon = new Date(
      MIDSUMMER.getFullYear(),
      MIDSUMMER.getMonth(),
      MIDSUMMER.getDate(),
      23,
      30,
    ).getTime();
    const payload = buildPayloadAt(
      KIRUNA,
      settings({ polarCircleResolution: 'unresolved' }),
      noon,
      'Kiruna',
    );
    expect(payload.nextAtMs).toBeNull();
    expect(buildPrayerActivityProps(payload, noon)).toBeNull();
  });
});
