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
import { hapticSuccess } from '@/lib/haptics';
import { IntroProvider } from '@/lib/intro-context';
import { LocationProvider } from '@/lib/location/context';
import { moonSky } from '@/lib/moon/ephemeris';
import { SettingsProvider } from '@/lib/settings/context';

// The sighting fires ONE confirming tap, and the policy in lib/haptics is the reason it may
// (class 1, an outcome reached). Asserted at the cue rather than at the native call: under
// jest-expo, which runs as iOS, an assertion on performAndroidHapticsAsync passes silently
// whatever the app does. See the repo's "Jest Mock Stability" note.
jest.mock('@/lib/haptics', () => ({
  hapticSelection: jest.fn(),
  hapticSuccess: jest.fn(),
  hapticLight: jest.fn(),
  hapticWarning: jest.fn(),
  setHapticsEnabled: jest.fn(),
}));

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

/** Stockholm — the position jest.setup's location mock hands out. */
const HERE = { latitude: 59.3293, longitude: 18.0686 };
/** Where the Moon actually stands at the pinned instant. Derived rather than hardcoded, so a
 *  test that says "40° off the Moon" means it whatever the ephemeris returns — the same trick
 *  screens.test.tsx plays with TEST_QIBLA. */
const MOON = moonSky(HERE, new Date(PINNED_NOW));

/** Install a heading emitter for this test, and hand back the function that fires it.
 *  `accuracy` is expo-location's calibration level 0–3; 3 is a trusted reading. */
function headingEmitter(): (heading: number, accuracy?: number) => Promise<void> {
  type Emit = (h: { trueHeading: number; magHeading: number; accuracy: number }) => void;
  let emit: Emit | null = null;
  jest.mocked(Location.watchHeadingAsync).mockImplementation((async (cb: Emit) => {
    emit = cb;
    return { remove: jest.fn() };
  }) as never);
  return async (heading, accuracy = 3) => {
    await waitFor(() => expect(emit).not.toBeNull());
    await act(async () => {
      emit?.({ trueHeading: heading, magHeading: heading, accuracy });
    });
  };
}

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

  it('leads the switch with the mode it opens in', async () => {
    // The order and the default are one decision, and TypeScript now holds them together
    // (`INITIAL_MODE = MODES[0].value`). This asserts the half the compiler cannot: that the
    // segment the reader lands on is the one their eye reaches first. A screen opening on the
    // SECOND of two segments spends its first impression saying "you are not on the main one".
    await renderSettled(withProviders(<Manen />));

    const [first, second] = screen.getAllByRole('radio');
    expect(first).toHaveTextContent('På himlen');
    expect(second).toHaveTextContent('Månaden');
    // ...and it is the one actually selected, so the order is not merely cosmetic.
    expect(screen.getByRole('radio', { selected: true })).toHaveTextContent('På himlen');
  });

  it('opens on the sky, and keeps the date there', async () => {
    // THE LANDING MODE IS PART OF THE ARGUMENT, not a default nobody chose. The month is
    // reckoned FROM the sky, and this screen's own copy tells the reader the arithmetic is no
    // part of the ruling — so opening on the calculated ring, with the observation one tap
    // behind it, had those two the wrong way round. A regression to 'month' would read as a
    // cosmetic difference and would quietly undo that.
    await renderSettled(withProviders(<Manen />));

    expect(screen.getByText('Månen')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Stäng' })).toBeTruthy();
    // No heading event ever arrives from jest.setup's subscription, so the screen sits in the
    // state before the first reading — which only sky mode has. It must NOT say "kalibrera"
    // there: that asks the reader to fix something that has not gone wrong yet.
    await waitFor(() => expect(screen.getByText('Söker riktning…')).toBeTruthy());
    // 18 February 2026 is 1 Ramaḍān 1447 in the tabular calendar — and the sky says the
    // crescent is barely a day old, which is the agreement the whole screen is built to show.
    // Month and year share one line now — the year is a nested Text inside the month's, so
    // the match is on the composed string rather than on two separate nodes.
    expect(screen.getByText(/Ramaḍān\s*1447/)).toBeTruthy();
  });

  it('names the phase, and switches the secondary readout to the month, once the ring is asked for', async () => {
    await renderSettled(withProviders(<Manen />));

    await act(async () => {
      fireEvent.press(screen.getByText('Månaden'));
    });

    // A waxing crescent, in the almanac's own words rather than a percentage. It is the month
    // ring's line: in sky mode the pill belongs to the instrument.
    await waitFor(() => expect(screen.getByText('Tilltagande månskära')).toBeTruthy());
    // The hero stays the date whichever way the instrument is pointed.
    expect(screen.getByText(/Ramaḍān\s*1447/)).toBeTruthy();
    // ...and WHERE the Moon is stays on screen too. That line is a fact about the sky over
    // this place, not a compass reading, so it does not belong to the mode it is read in —
    // and reserving it in both is also what stops the switch moving the dial under the eye.
    expect(screen.getByText('30 dagar i månaden')).toBeTruthy();
  });

  it('says when the Moon rises and sets, and how much of it is lit', async () => {
    await renderSettled(withProviders(<Manen />));

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Månens detaljer' }));
    });
    expect(screen.getByText(/^(Upp|Ner) \d\d:\d\d/)).toBeTruthy();
  });

  it('keeps the reference almanac behind one tap, and gives all of it up when asked', async () => {
    // The readout used to print every note the almanac produced — up to five sentences under
    // a hero numeral, a status pill and a phase line, on a screen whose argument is a single
    // drawing. What is left on the surface is tonight, plus anything asking to be acted on
    // tonight; the rest is one tap away, in full. A new-moon edge is the stress case: the
    // crescent alert stays primary while the almanac keeps every row.
    await renderSettled(withProviders(<Manen />));

    // A conjunction a fortnight out is not news, and does not get a permanent row.
    expect(screen.queryByText(/^Nästa: (fullmåne|nymåne)/)).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Månens detaljer' }));
    });

    await waitFor(() => expect(screen.getByText(/^Nästa: (fullmåne|nymåne)/)).toBeTruthy());
    expect(screen.getByText('I natt')).toBeTruthy();
    expect(screen.getByText('Nymåne')).toBeTruthy();
    expect(screen.getByText('Förmörkelser')).toBeTruthy();
    // The two most opaque numbers on the screen — a percentage nobody acts on and an age in
    // dygn that has to be explained — live in here now, not under the date.
    expect(screen.getByText(/% belyst/)).toBeTruthy();
    // The sheet shows the WHOLE list, including the row already on the surface — a door that
    // hides what you could already see is a door you cannot trust.
    expect(screen.getByText(/^(Upp|Ner) \d\d:\d\d/)).toBeTruthy();
    // The row only exists in the sheet now; the surface shows the primary crescent message.
    const both = screen.getAllByText(/^(Upp|Ner) \d\d:\d\d/, { includeHiddenElements: true });
    expect(both.length).toBe(1);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Stäng månens detaljer' }));
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
    expect(screen.getByText(/Nymåne syntes/)).toBeTruthy();
    // A new-moon edge can also have a moonrise row. Keep only the primary crescent message on
    // the screen so the dial and date remain the focus; the complete list is in Almanacka.
    expect(screen.queryByText(/^(Upp|Ner) \d\d:\d\d/)).toBeNull();
    expect(screen.getByText('Månens detaljer')).toBeTruthy();
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

  it('names the side to turn toward, and counts the turn down', async () => {
    // The half of this mode that makes it usable in the dark. The dial says the direction;
    // these two say it in words — the same instruction, in the same words, as the qibla
    // compass, because a reader who has found Mecca once should not have to learn a second
    // vocabulary for the same gesture.
    const emit = headingEmitter();
    await renderSettled(withProviders(<Manen />));
    // Facing 40° anticlockwise of the Moon: the short way back is clockwise — your right.
    await emit(MOON.azimuth - 40);

    await waitFor(() => expect(screen.getByText('Vrid åt höger')).toBeTruthy());
    // The pill speaks its own text and NOTHING else. Left to compose its label from its
    // children, the leading glyph contributes an empty description and TalkBack reads
    // ", Vrid åt höger" — a comma before every instruction. Only a device showed that; a
    // query by text sails straight past it.
    expect(screen.getByLabelText('Vrid åt höger')).toBeTruthy();
    // The live count lives in the caption, NEVER in the pill: the pill is a polite live
    // region and a value moving ten times a second would have TalkBack announcing over the
    // reader continuously.
    expect(screen.getByText(/40° kvar$/)).toBeTruthy();
    expect(screen.getByLabelText(/40 grader kvar, vrid åt höger$/)).toBeTruthy();
  });

  it('names the other side when the Moon is anticlockwise of you', async () => {
    const emit = headingEmitter();
    await renderSettled(withProviders(<Manen />));
    await emit(MOON.azimuth + 40);

    await waitFor(() => expect(screen.getByText('Vrid åt vänster')).toBeTruthy());
  });

  it('fires once when the phone comes onto the Moon', async () => {
    // The moment the whole mode exists for. One confirming tap (not a buzz per frame while it
    // is held), and the pill stops instructing and starts confirming — while the caption turns
    // the same number from an instruction into a measurement, because the lock holds out to 7°
    // and "5° kvar" printed under "Du ser mot månen" is the screen arguing with itself.
    const emit = headingEmitter();
    await renderSettled(withProviders(<Manen />));
    await emit(MOON.azimuth);

    await waitFor(() => expect(screen.getByText('Du ser mot månen')).toBeTruthy());
    expect(screen.getByText(/0° från månen$/)).toBeTruthy();
    expect(jest.mocked(hapticSuccess)).toHaveBeenCalledTimes(1);

    // Still on it, a degree over — inside the hysteresis band, so the lock holds and does NOT
    // re-fire. A tap on every frame while the phone is held is the failure this guards.
    await emit(MOON.azimuth + 1);
    expect(jest.mocked(hapticSuccess)).toHaveBeenCalledTimes(1);
  });

  it('withholds the direction while the compass is still calibrating', async () => {
    const emit = headingEmitter();
    await renderSettled(withProviders(<Manen />));
    // A reading pointing DEAD at the Moon, but with the calibration level the OS uses to say
    // "don't trust me". The same gate that stops the rose turning has to stop the count: a
    // number ticking toward a bearing the dial is refusing to turn to would talk a reader into
    // staring at the wrong patch of sky with full confidence.
    await emit(MOON.azimuth, 0);

    await waitFor(() => expect(screen.getByText('Rör telefonen i en åtta')).toBeTruthy());
    expect(screen.queryByText(/kvar$/)).toBeNull();
    expect(jest.mocked(hapticSuccess)).not.toHaveBeenCalled();
  });

  it('keeps saying where the Moon is when there is no compass to turn the dial with', async () => {
    // Refusing the permission is the fast, deterministic way into the state every emulator
    // and every tablet without a magnetometer lands in. The screen must not answer it with an
    // apology: where the Moon stands is a fact about the sky over this place, and the heading
    // only decides whether the DIAL can be turned the right way round.
    //
    // The two halves of that now sit in two places, which is the whole point of the split: the
    // PILL says what the instrument can do (nothing but point north), the CAPTION says where
    // the Moon is. Before, one line carried both and had to apologise mid-sentence.
    //
    // It is the CHECK that has to be denied, not the request: landing on this screen never
    // prompts (see the note on useAim in manen.tsx), so a test that only refuses the prompt
    // would sail past on jest.setup's granted check and never reach this state at all.
    jest.mocked(Location.getForegroundPermissionsAsync).mockReset();
    jest
      .mocked(Location.getForegroundPermissionsAsync)
      .mockImplementation((async () => ({ status: 'denied', granted: false, canAskAgain: true })) as never);
    jest.mocked(Location.requestForegroundPermissionsAsync).mockReset();
    jest
      .mocked(Location.requestForegroundPermissionsAsync)
      .mockImplementation((async () => ({ status: 'denied', granted: false, canAskAgain: true })) as never);

    await renderSettled(withProviders(<Manen />));

    await waitFor(() => expect(screen.getByText('Riktningen räknad från norr')).toBeTruthy());
    // One line, asserted whole: the direction is still stated ("I sydost · 19° upp" /
    // "Under horisonten, i sydost"). Anchored at both ends, because the leading "I " half also
    // catches the date block's own "I dag · onsdag …" — the two start alike now that neither
    // of them names the Moon it is about.
    expect(screen.getByText(/^(I .+ · \d+° upp|Under horisonten, i .+)$/)).toBeTruthy();
    // At the pinned instant the Moon stands ~19° up, so the degrees really are on screen —
    // and they are NOT in the pill, which is a polite live region on a screen whose clock
    // ticks every sixty seconds. A rounded altitude rolls over every few minutes, and had
    // TalkBack re-reading the whole line to a reader who had not touched anything.
    expect(screen.getByText(/\d+° upp/)).toBeTruthy();
    // The lock never fires from a dial that is only pointing north.
    expect(jest.mocked(hapticSuccess)).not.toHaveBeenCalled();
    // The refused state is not a dead end: the OS would still listen, so the screen offers
    // the prompt it deliberately did not raise on its own. (Once the OS stops listening,
    // `canAskAgain` false, this becomes the trip to the system settings instead.)
    const offer = screen.getByRole('button', { name: /^Tillåt platsåtkomst/ });
    // ...and it keeps asking. Android grants TWO refusals, so the reader who declines once and
    // presses again must get a second dialog — the failure a boolean `skyChosen` produced, where
    // the second press flipped an already-true flag and nothing happened at all.
    expect(jest.mocked(Location.requestForegroundPermissionsAsync)).not.toHaveBeenCalled();
    for (const expected of [1, 2]) {
      await act(async () => {
        fireEvent.press(offer);
      });
      await waitFor(() =>
        expect(jest.mocked(Location.requestForegroundPermissionsAsync)).toHaveBeenCalledTimes(expected),
      );
    }
    // The printed caption carries a degree sign; the SPOKEN one must not — a screen reader
    // verbalises it, and Qibla's sibling label spells its units out in words. (Asserted over
    // the whole screen, so a future label that reaches for `°` anywhere trips it.)
    expect(screen.queryByLabelText(/°/)).toBeNull();
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
