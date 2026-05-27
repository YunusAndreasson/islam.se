// B-LAYER (UI path): the app's settings plumbing vs. adhan called directly.
//
// Why this isn't a rubber-stamp: the risk in this app is not that adhan computes the
// wrong sun position — that's the library's job. The risk is that the app *feeds adhan
// wrong* somewhere along the path the user actually drives: AsyncStorage → Settings-
// Provider → useSettings → the screen → computePrayerTimes → buildParams → formatTime →
// the rendered time. A swapped madhab, a dropped high-latitude rule, a control that
// isn't wired, a location that never reaches the calculation — all live in that path.
//
// The oracle is adhan invoked directly with hand-written parameters (see prayer-oracle),
// independent of buildParams (the unit under test). If the plumbing mis-wires a setting
// the rendered time diverges from the oracle and the test fails. The expected value
// comes from the library + the spec, not from running the app and pasting its output.
//
// Note on scope: the screen is locked to today's real date, so the *date* axis (seasons,
// DST, the polar circle) and the *method* axis (which is erased in Swedish summer when
// the high-latitude rule takes over) are covered in prayer-times.test.ts, where the date
// is controllable. Here we cover the interactions the user performs on the screen.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Madhab } from 'adhan';

import Installningar from '../app/(settings)/installningar';
import { LocationProvider } from '../lib/location/context';
import {
  formatTime,
  type LatLng,
  PRAYER_LABELS,
  PRAYER_ORDER,
  type PrayerKey,
} from '../lib/prayer-times';
import { SettingsProvider } from '../lib/settings/context';
import { DEFAULT_COORDS } from '../lib/settings/types';
import { oracleTimes } from '../test-utils/prayer-oracle';

// jest.setup mocks expo-location to return this exact coordinate, and it equals
// DEFAULT_COORDS — so in GPS mode (the default) the resolved location is Stockholm
// whether or not the async fix has landed.
const STOCKHOLM: LatLng = { latitude: DEFAULT_COORDS.latitude, longitude: DEFAULT_COORDS.longitude };
const MALMO: LatLng = { latitude: 55.605, longitude: 13.0038 }; // from SWEDISH_CITIES

// The time the screen actually displays for a prayer (its preview row's testID).
function shown(key: PrayerKey): string {
  return screen.getByTestId(`preview-time-${key}`).props.children as string;
}

function snapshot(): Record<PrayerKey, string> {
  return Object.fromEntries(PRAYER_ORDER.map((k) => [k, shown(k)])) as Record<PrayerKey, string>;
}

// "HH:MM" (sv-SE may use ':' or '.') → minutes since midnight, for ordering/delta checks.
function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(/[:.]/).map(Number);
  return h * 60 + m;
}

async function renderSettings(): Promise<void> {
  render(
    <SettingsProvider>
      <LocationProvider>
        <Installningar />
      </LocationProvider>
    </SettingsProvider>,
  );
  // The header appears only after settings hydrate (loaded flips true).
  await waitFor(() => expect(screen.getByText('Inställningar')).toBeTruthy());
}

// Each test must start from the persisted defaults: the store writes every change to
// AsyncStorage, so without clearing it a madhab/city picked in one test would hydrate
// into the next and quietly invalidate its "from defaults" assumption.
//
// We also freeze the wall clock. The screen reads `new Date()` internally to compute its
// preview, and each test reads `new Date()` again to build the oracle — adhan's times key
// off the calendar date, so the two must land on the same day. Unfrozen, a run that
// straddles midnight would render the screen on day N while the oracle, a few statements
// later, reads day N+1, producing legitimately different times and a spurious failure.
// Only the Date is faked (timers stay real) so RNTL's waitFor and the providers' async
// hydration behave exactly as in production.
beforeEach(async () => {
  await AsyncStorage.clear();
  jest.useFakeTimers({
    doNotFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'setImmediate',
      'clearImmediate',
      'queueMicrotask',
      'nextTick',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'hrtime',
      'performance',
    ],
  });
  jest.setSystemTime(new Date('2026-05-27T09:00:00Z'));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('settings plumbing matches adhan-direct', () => {
  it('renders exactly the times adhan produces for the default settings', async () => {
    await renderSettings();
    const oracle = oracleTimes(STOCKHOLM, new Date());
    for (const key of PRAYER_ORDER) {
      expect(shown(key)).toBe(formatTime(oracle[key]));
    }
  });
});

describe('changing a setting recomputes the displayed times (the core user flow)', () => {
  it('madhab → Hanafi moves only Asr (later), through the real control', async () => {
    await renderSettings();
    const before = snapshot();

    // The madhab control lives in the collapsed "Beräkning" group — open it first.
    fireEvent.press(screen.getByRole('button', { name: /^Beräkning,/ }));
    fireEvent.press(screen.getByRole('radio', { name: /Hanafi/ }));

    // Hanafi's longer shadow ratio puts Asr later; nothing else depends on the madhab.
    const oracle = oracleTimes(STOCKHOLM, new Date(), { madhab: Madhab.Hanafi });
    expect(shown('asr')).toBe(formatTime(oracle.asr));
    expect(toMin(shown('asr'))).toBeGreaterThan(toMin(before.asr));
    for (const key of PRAYER_ORDER) {
      if (key === 'asr') continue;
      expect(shown(key)).toBe(before[key]); // untouched by the madhab
    }
  });

  it('location → manual Malmö recomputes every prayer, through useLocation', async () => {
    await renderSettings();
    const stockholm = snapshot();

    // GPS → manual keeps Stockholm (the manual default), so nothing should move yet —
    // proves the mode switch doesn't corrupt the resolved coordinate.
    fireEvent.press(screen.getByRole('radio', { name: /Välj stad/ }));
    for (const key of PRAYER_ORDER) expect(shown(key)).toBe(stockholm[key]);

    // Picking Malmö (far south) shifts every time to Malmö's, matching the oracle.
    fireEvent.press(screen.getByRole('radio', { name: /Malmö/ }));
    const oracle = oracleTimes(MALMO, new Date());
    for (const key of PRAYER_ORDER) {
      expect(shown(key)).toBe(formatTime(oracle[key]));
    }
    expect(shown('maghrib')).not.toBe(stockholm.maghrib); // the city really changed things
  });

  // Programmatic per-prayer sweep: a +1-minute adjustment must move exactly its own
  // prayer and leave the other five untouched. Unlike the method (which the high-latitude
  // rule can erase in summer), an adjustment is added unconditionally, so this is robust
  // on any date — and it exercises the Stepper control + the nested-object update path.
  describe('a manual minute adjustment shifts only its own prayer', () => {
    it.each(PRAYER_ORDER)('+1 min on %s moves only that prayer', async (key) => {
      await renderSettings();
      // The minute steppers live in the collapsed "Visning & finjustering" group.
      fireEvent.press(screen.getByRole('button', { name: /^Visning & finjustering,/ }));
      const before = snapshot();

      fireEvent.press(screen.getByRole('button', { name: `Öka ${PRAYER_LABELS[key]}` }));

      // % 1440 guards the rare day-wrap (e.g. 23:59 → 00:00) so the delta still reads +1.
      expect(toMin(shown(key))).toBe((toMin(before[key]) + 1) % 1440);
      for (const other of PRAYER_ORDER) {
        if (other === key) continue;
        expect(shown(other)).toBe(before[other]);
      }
    });
  });
});
