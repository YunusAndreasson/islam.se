// Månen, mounted. The screen is a lot of ephemeris feeding a little copy, and the failures
// worth catching are the ones where a real fact reaches the reader as a wrong sentence — so
// the clock is pinned and the assertions are about what the screen SAYS.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import type { ReactElement, ReactNode } from 'react';

import Manen from '@/app/manen';
import { IntroProvider } from '@/lib/intro-context';
import { LocationProvider } from '@/lib/location/context';
import { SettingsProvider } from '@/lib/settings/context';

// Only `Date` is faked; every timer API stays real so React Testing Library's async helpers
// still work. Same recipe, and same reason, as day-navigation.test.tsx.
const REAL_TIMER_APIS = [
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'setImmediate',
  'clearImmediate',
  'nextTick',
  'queueMicrotask',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',
  'performance',
  'hrtime',
] as const;

// 18 February 2026, mid-afternoon in Stockholm. Chosen, not arbitrary: the conjunction was
// at 12:01 UTC the day before, so this is a crescent a little over a day old — the one
// evening in the month when every part of this screen has something real to say. The
// position comes from jest.setup's location mock (Stockholm).
const PINNED_NOW = Date.UTC(2026, 1, 18, 14, 0, 0);

function withProviders(node: ReactNode) {
  return (
    <SettingsProvider>
      <IntroProvider>
        <LocationProvider>{node}</LocationProvider>
      </IntroProvider>
    </SettingsProvider>
  );
}

/** Render and let the providers hydrate from storage before asserting. */
async function renderSettled(node: ReactElement): Promise<void> {
  render(node);
  await act(async () => {
    await Promise.resolve();
  });
}

describe('Månen', () => {
  beforeEach(async () => {
    jest.useFakeTimers({ now: PINNED_NOW, doNotFake: [...REAL_TIMER_APIS] });
    await AsyncStorage.clear();
    jest.clearAllMocks();
    jest.mocked(Location.watchHeadingAsync).mockReset();
    jest
      .mocked(Location.watchHeadingAsync)
      .mockImplementation((async () => ({ remove: jest.fn() })) as never);
    jest.mocked(Location.requestForegroundPermissionsAsync).mockReset();
    jest
      .mocked(Location.requestForegroundPermissionsAsync)
      .mockImplementation((async () => ({ status: 'granted', granted: true })) as never);
  });

  // Every sibling that fakes the clock pairs it with this. Without it `Date` stays pinned to
  // PINNED_NOW for whatever runs next in the worker, and any module-level cache warmed under
  // the fake clock is never invalidated — the setup/teardown leak the repo's own
  // "Jest Mock Stability" note was written about.
  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the Hijri date, the phase and the place', async () => {
    await renderSettled(withProviders(<Manen />));

    expect(screen.getByText('Månen')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Stäng' })).toBeTruthy();
    // 18 February 2026 is 1 Ramaḍān 1447 in the tabular calendar — and the sky says the
    // crescent is barely a day old, which is the agreement the whole screen is built to show.
    // Month and year share one line now — the year is a nested Text inside the month's, so
    // the match is on the composed string rather than on two separate nodes.
    expect(screen.getByText(/Ramaḍān\s*1447/)).toBeTruthy();
    // A waxing crescent, in the almanac's own words rather than a percentage.
    expect(screen.getByText('Tilltagande månskära')).toBeTruthy();
  });

  it('says when the Moon rises and sets, and how much of it is lit', async () => {
    await renderSettled(withProviders(<Manen />));

    expect(screen.getByText(/^(Upp|Ner) \d\d:\d\d/)).toBeTruthy();
  });

  it('keeps the reference almanac behind one tap, and gives all of it up when asked', async () => {
    // The readout used to print every note the almanac produced — up to five sentences under
    // a hero numeral, a status pill and a phase line, on a screen whose argument is a single
    // drawing. What is left on the surface is tonight, plus anything asking to be acted on
    // tonight; the rest is one tap away, in full. Both halves of that are load-bearing: a
    // regression that surfaced everything again would look like the pass never happened, and
    // one that swallowed the tonight row would hide the thing the reader came for.
    await renderSettled(withProviders(<Manen />));

    // A conjunction a fortnight out is not news, and does not get a permanent row.
    expect(screen.queryByText(/^Nästa: (fullmåne|nymåne)/)).toBeNull();

    await act(async () => {
      // The tonight row IS the door: the rest of the almanac is more of the same sentence,
      // and a separate "Almanacka ›" line under it said only what the chevron already says.
      fireEvent.press(screen.getByText(/^(Upp|Ner) \d\d:\d\d/));
    });

    await waitFor(() => expect(screen.getByText(/^Nästa: (fullmåne|nymåne)/)).toBeTruthy());
    // The two most opaque numbers on the screen — a percentage nobody acts on and an age in
    // dygn that has to be explained — live in here now, not under the date.
    expect(screen.getByText(/% belyst/)).toBeTruthy();
    // The sheet shows the WHOLE list, including the row already on the surface — a door that
    // hides what you could already see is a door you cannot trust.
    expect(screen.getByText(/^(Upp|Ner) \d\d:\d\d/)).toBeTruthy();
    // Two of that row exist, and only the sheet's is reachable: while this is up the readout
    // behind it is out of the swipe order (accessibilityViewIsModal, as the month sheet
    // does it), so a screen reader is not walking two copies of the same almanac.
    const both = screen.getAllByText(/^(Upp|Ner) \d\d:\d\d/, { includeHiddenElements: true });
    expect(both.length).toBe(2);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Stäng almanackan' }));
    });
    await waitFor(() => expect(screen.queryByText(/^Nästa: (fullmåne|nymåne)/)).toBeNull());
  });

  it('answers the crescent question on an evening when someone would be asking it', async () => {
    // The screen only raises the hilāl within a few days of a month's edge — which 1 Ramaḍān
    // is. A regression that dropped the window would leave this the same screen minus its
    // whole reason for existing, and nothing else here would notice.
    await renderSettled(withProviders(<Manen />));
    // 1 Ramaḍān: the boundary is behind us, so the honest line is the evening the crescent
    // already in the sky first became visible here — the checkable form of "has the calendar
    // drifted", and the thing to hold the mosque's announcement against.
    expect(screen.getByText(/Månadens nymåne kunde först ses/)).toBeTruthy();
  });

  it('opens the month, with its sunnah days named', async () => {
    await renderSettled(withProviders(<Manen />));

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: /Visa hela månaden/ }));
    });

    await waitFor(() => expect(screen.getByText(/^Ramaḍān 1447$/)).toBeTruthy());
    // The white days are in every month; in Ramaḍān the last ten are too. Both come from
    // lib/moon/month, so this is the wiring between the calendar and the sheet.
    expect(screen.getByText(/Vita dagarna/)).toBeTruthy();
    expect(screen.getByText(/Laylat al-qadr/)).toBeTruthy();
    // Said on the surface that lists the days, because it is the thing that decides them.
    expect(screen.getByText(/Månaden börjar när nymånen ses/)).toBeTruthy();
  });

  it('switches the dial to the sky without losing the date', async () => {
    await renderSettled(withProviders(<Manen />));

    await act(async () => {
      fireEvent.press(screen.getByText('På himlen'));
    });

    // The hero stays the date: the switch changes what the instrument points at, not what
    // the screen is about.
    // No heading event ever arrives from jest.setup's subscription, so the screen sits in
    // the state before the first reading. It must NOT say "kalibrera" there: that asks the
    // reader to fix something that has not gone wrong yet.
    await waitFor(() => expect(screen.getByText('Söker riktning…')).toBeTruthy());
    expect(screen.getByText(/Ramaḍān\s*1447/)).toBeTruthy();
  });

  it('keeps saying where the Moon is when there is no compass to turn the dial with', async () => {
    // Refusing the permission is the fast, deterministic way into the state every emulator
    // and every tablet without a magnetometer lands in. The screen must not answer it with
    // an apology: where the Moon stands is a fact about the sky over this place, and the
    // heading only decides whether the DIAL can be turned the right way round.
    jest.mocked(Location.requestForegroundPermissionsAsync).mockReset();
    jest
      .mocked(Location.requestForegroundPermissionsAsync)
      .mockImplementation((async () => ({ status: 'denied', granted: false })) as never);

    await renderSettled(withProviders(<Manen />));
    await act(async () => {
      fireEvent.press(screen.getByText('På himlen'));
    });

    // One line, asserted whole: the direction is still stated ("I sydost, 23° upp" /
    // "Under horisonten, i sydost") AND it is qualified as measured from north rather than
    // from the phone. Split into two matches, the leading "I " half also caught the date
    // block's own "I dag · lördag …" — the two lines start alike now that neither of them
    // names the Moon it is about.
    await waitFor(() =>
      expect(screen.getByText(/^(I |Under horisonten, i ).+ – räknat från norr$/)).toBeTruthy(),
    );
  });

  it('offers the place picker instead of a confident reading when there is no real fix', async () => {
    // The same refusal Qibla makes: a fallback city must not print moonrise times as though
    // they were the reader's own.
    jest.mocked(Location.getForegroundPermissionsAsync).mockReset();
    jest
      .mocked(Location.getForegroundPermissionsAsync)
      .mockImplementation((async () => ({ status: 'denied', granted: false })) as never);
    jest.mocked(Location.requestForegroundPermissionsAsync).mockReset();
    jest
      .mocked(Location.requestForegroundPermissionsAsync)
      .mockImplementation((async () => ({ status: 'denied', granted: false })) as never);

    await renderSettled(withProviders(<Manen />));

    await waitFor(() =>
      expect(screen.getByLabelText(/Ingen plats vald/)).toBeTruthy(),
    );
    expect(router.push).not.toHaveBeenCalled();
  });
});
