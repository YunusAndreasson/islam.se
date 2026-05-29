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

import Berakning from '../app/(settings)/berakning';
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
import { DEFAULT_COORDS, DEFAULT_SETTINGS } from '../lib/settings/types';
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

// Renders Installningar AND the Beräkning sub-screen side by side so a test
// can drive both UIs against one shared SettingsProvider — the screens are
// separate routes in the app, but the wiring (settings update → useLocation →
// prayer times) is the same across them. Without router context we can't
// actually push between them, so we mount both at once.
async function renderSettingsWithBerakning(): Promise<void> {
  render(
    <SettingsProvider>
      <LocationProvider>
        <Installningar />
        <Berakning />
      </LocationProvider>
    </SettingsProvider>,
  );
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
    // Beräkning's controls now live in their own pushed screen (since the
    // refactor that gave Beräkning a peer treatment with the Byt plats picker).
    // We render Inställningar AND Berakning under one SettingsProvider so the
    // Hanafi radio (on Berakning) flips the preview times rendered by
    // Installningar — the same wiring contract the original test verified, just
    // across the now-split UI.
    await renderSettingsWithBerakning();
    const before = snapshot();

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

  it('mode switch GPS → manual without picking keeps the same coords (no corruption)', async () => {
    await renderSettings();
    const stockholm = snapshot();
    fireEvent.press(screen.getByRole('radio', { name: /Välj stad/ }));
    // The manual default is Stockholm, so prayer times must not move.
    for (const key of PRAYER_ORDER) expect(shown(key)).toBe(stockholm[key]);
  });

  it('manual + Malmö renders Malmö times (settings → useLocation → adhan)', async () => {
    // The Byt plats picker (src/app/(settings)/byt-plats.tsx) writes manualLocation
    // through the same settings.update() the inline picker used to call, so the
    // *wiring* is unchanged. We pre-seed the persisted shape rather than driving
    // through the pushed picker screen (which needs full router context); the picker's
    // own UI is tested in screens.test.tsx. If a future change broke the contract
    // (e.g. renaming `manualLocation` or dropping `latitude`), this test catches it
    // because the rendered times would diverge from the oracle.
    await AsyncStorage.setItem(
      'prayerSettings:v1',
      JSON.stringify({
        ...DEFAULT_SETTINGS,
        locationMode: 'manual',
        manualLocation: { name: 'Malmö', latitude: MALMO.latitude, longitude: MALMO.longitude },
      }),
    );
    await renderSettings();
    const oracle = oracleTimes(MALMO, new Date());
    for (const key of PRAYER_ORDER) {
      expect(shown(key)).toBe(formatTime(oracle[key]));
    }
    // Sanity: Malmö's southern Maghrib really differs from Stockholm's.
    const stockholmOracle = oracleTimes(STOCKHOLM, new Date());
    expect(formatTime(oracle.maghrib)).not.toBe(formatTime(stockholmOracle.maghrib));
  });

  // Programmatic per-prayer sweep: a +1-minute adjustment must move exactly its own
  // prayer and leave the other five untouched. Unlike the method (which the high-latitude
  // rule can erase in summer), an adjustment is added unconditionally, so this is robust
  // on any date — and it exercises the Stepper control + the nested-object update path.
  describe('a manual minute adjustment shifts only its own prayer', () => {
    it.each(PRAYER_ORDER)('+1 min on %s moves only that prayer', async (key) => {
      // The minute steppers moved to Beräkning when "Visning & finjustering" was
      // split: Manuella justeringar now sits alongside method/madhab on the
      // Beräkning screen, since it conceptually tweaks the calculation output
      // (adhan's CalculationParameters.adjustments). The Installningar preview
      // is still where the resulting times render, so we mount both under one
      // SettingsProvider and drive the Stepper on Berakning while reading the
      // preview rows on Installningar.
      await renderSettingsWithBerakning();
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
