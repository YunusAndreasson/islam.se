import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import { computePrayerTimes, PRAYER_ORDER } from '../../lib/prayer-times';
import { DEFAULT_SETTINGS } from '../../lib/settings/types';
import { startOfStockholmDay } from '../../lib/stockholm-time';
import { type DayMark, PrayerDock } from './PrayerDock';

const STOCKHOLM = { latitude: 59.3293, longitude: 18.0686 };
const NOW = Date.UTC(2026, 7, 1, 12, 0, 0);

function dockProps(revealSchedule: boolean) {
  const dayStart = startOfStockholmDay(NOW);
  const times = computePrayerTimes(STOCKHOLM, new Date(NOW), DEFAULT_SETTINGS);
  const marks: DayMark[] = PRAYER_ORDER.map((key, i) => ({ key, fraction: i / PRAYER_ORDER.length }));
  return {
    clock: {
      now: NOW,
      mode: 'live' as const,
      fraction: 0.5,
      dayStart,
      dayLength: 24 * 3_600_000,
      setFraction: jest.fn(),
      setInstant: jest.fn(),
      reset: jest.fn(),
    },
    times,
    marks,
    next: { key: 'asr' as const, at: NOW + 3_600_000, tomorrow: false },
    locationLabel: 'Stockholm',
    settings: DEFAULT_SETTINGS,
    revealSchedule,
  };
}

// `revealSchedule` is what lets the map play its post-intro introduction: the dock opens
// itself so the day's times stagger in, then shuts again, and only then does the
// notification hint ask whether to be reminded of them (see app/bonetider). The dock's
// toggle label is the observable proof of the open/closed state — the height itself is a
// shared value the reanimated test shim doesn't animate.
describe('PrayerDock schedule reveal', () => {
  it('stays collapsed by default', () => {
    render(<PrayerDock {...dockProps(false)} />);
    expect(screen.getByLabelText('Visa alla bönetider')).toBeTruthy();
  });

  it('opens itself when the host asks for the reveal', () => {
    render(<PrayerDock {...dockProps(true)} />);
    expect(screen.getByLabelText('Dölj bönetider')).toBeTruthy();
  });

  it('closes again when the reveal ends', () => {
    const { rerender } = render(<PrayerDock {...dockProps(true)} />);
    expect(screen.getByLabelText('Dölj bönetider')).toBeTruthy();
    rerender(<PrayerDock {...dockProps(false)} />);
    // If this regressed the dock would be left open over the map with the hint fading in
    // on top of it — the reveal must hand the screen back.
    expect(screen.getByLabelText('Visa alla bönetider')).toBeTruthy();
  });
});
