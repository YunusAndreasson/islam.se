import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import {
  computeNightTimes,
  NIGHT_LABELS,
  NIGHT_ORDER,
  NIGHT_SWEDISH_NAMES,
} from '@/lib/night-times';
import { computePrayerTimes, PRAYER_ORDER } from '@/lib/prayer-times';
import { DEFAULT_SETTINGS } from '@/lib/settings/types';
import { MAX_DAY_OFFSET, type SolarClock } from '@/lib/solar/useSolarClock';
import { startOfStockholmDay } from '@/lib/stockholm-time';
import { type DayMark, PrayerDock } from './PrayerDock';

const STOCKHOLM = { latitude: 59.3293, longitude: 18.0686 };
const NOW = Date.UTC(2026, 7, 1, 12, 0, 0);

function dockProps(revealSchedule: boolean, clockOverrides: Partial<SolarClock> = {}) {
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
      // Viewing today, by default. `todayStart === dayStart` is what dayOffset 0 means;
      // the day-navigation tests below override both together.
      todayStart: dayStart,
      dayOffset: 0,
      setFraction: jest.fn(),
      setInstant: jest.fn(),
      stepDay: jest.fn(),
      goToDay: jest.fn(),
      reset: jest.fn(),
      ...clockOverrides,
    },
    times,
    marks,
    next: { key: 'asr' as const, at: NOW + 3_600_000, nextDay: false },
    locationLabel: 'Stockholm',
    settings: DEFAULT_SETTINGS,
    revealSchedule,
  };
}

// `revealSchedule` is what lets the map play its launch introduction: the dock opens
// itself so the day's times stagger in, then shuts again, and only then does the
// notification hint ask whether to be reminded of them (see app/bonetider). The dock's
// toggle label is the observable proof of the open/closed state — the height itself is a
// shared value the reanimated test shim doesn't animate.
describe('PrayerDock schedule reveal', () => {
  it('stays collapsed by default', () => {
    render(<PrayerDock {...dockProps(false)} />);
    expect(screen.getByLabelText('Visa alla bönetider')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Fajr / })).toBeNull();
  });

  it('opens itself when the host asks for the reveal', () => {
    render(<PrayerDock {...dockProps(true)} />);
    expect(screen.getByLabelText('Dölj bönetider')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Fajr / })).toBeTruthy();
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

// THE BUG THIS GUARDS: bonetider strips status qualifiers off the location label for the
// dock ("Stockholm (standard)" → "Stockholm"). When no location has been resolved at all
// — permission denied, no manual city — the resolved place IS the Stockholm fallback, so
// the dock read a bare, confident "Stockholm" to a user standing in Malmö, with times
// ~20 minutes wrong and nothing on the map admitting it. The dock must never name a city
// the user did not choose; it offers to pick one instead.
describe('PrayerDock location fallback', () => {
  const PICK_LABEL = 'Ingen plats vald – tryck för att välja stad';

  it('names the place when the location is real', () => {
    render(<PrayerDock {...dockProps(false)} locationIsFallback={false} />);
    expect(screen.getByText('Stockholm')).toBeTruthy();
    expect(screen.queryByLabelText(PICK_LABEL)).toBeNull();
  });

  it('offers to pick a place instead of naming the fallback city', () => {
    render(<PrayerDock {...dockProps(false)} locationIsFallback />);
    expect(screen.getByLabelText(PICK_LABEL)).toBeTruthy();
    // The whole point: the fallback city's name must not be presented as the user's.
    expect(screen.queryByText('Stockholm')).toBeNull();
  });

  it('routes to the city picker when the offer is tapped', () => {
    render(<PrayerDock {...dockProps(false)} locationIsFallback />);
    fireEvent.press(screen.getByLabelText(PICK_LABEL));
    expect(router.push).toHaveBeenCalledWith('/(settings)/byt-plats');
  });

  it('offers the pick in the expanded hero too', () => {
    render(<PrayerDock {...dockProps(true)} locationIsFallback />);
    expect(screen.getByLabelText(PICK_LABEL)).toBeTruthy();
  });
});


// Day navigation from the dock. The clock owns the arithmetic (useSolarClock.test.ts pins
// that); what is guarded here is the SURFACE — that the controls exist while collapsed,
// that they say the right thing about a day that is not today, and that they call the
// clock rather than reimplementing it.
describe('PrayerDock day navigation', () => {
  const scrubbed = { mode: 'scrub' as const };

  // The stepper lives in the timeline row precisely so it is present in BOTH dock states —
  // putting it in the expanded schedule would have hidden the feature behind a drag.
  it('offers both chevrons while collapsed', () => {
    render(<PrayerDock {...dockProps(false)} />);
    expect(screen.getByRole('button', { name: 'Föregående dag' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Nästa dag' })).toBeTruthy();
  });

  it('steps the clock by exactly one day in each direction', () => {
    const props = dockProps(false);
    render(<PrayerDock {...props} />);

    fireEvent.press(screen.getByRole('button', { name: 'Nästa dag' }));
    expect(props.clock.stepDay).toHaveBeenCalledWith(1);

    fireEvent.press(screen.getByRole('button', { name: 'Föregående dag' }));
    expect(props.clock.stepDay).toHaveBeenCalledWith(-1);
  });

  // The limit is visible before it is reached, and only the chevron that would cross it
  // goes inert — a stepper that disabled both at one rail would strand the user there.
  it.each([
    [MAX_DAY_OFFSET, 'Nästa dag', 'Föregående dag'],
    [-MAX_DAY_OFFSET, 'Föregående dag', 'Nästa dag'],
  ])('disables only the outward chevron at offset %s', (dayOffset, blocked, open) => {
    render(<PrayerDock {...dockProps(false, { dayOffset, ...scrubbed })} />);
    expect(screen.getByRole('button', { name: blocked }).props.accessibilityState.disabled).toBe(
      true,
    );
    expect(screen.getByRole('button', { name: open }).props.accessibilityState.disabled).toBe(
      false,
    );
  });

  // The single aside slot carries three different promises. On today it restores the TIME;
  // on another day the bigger fact is the date, so it restores the DAY.
  it('promises "Nu" on today and "I dag" elsewhere', () => {
    render(<PrayerDock {...dockProps(false, scrubbed)} />);
    expect(screen.getByLabelText('Återgå till nu')).toBeTruthy();

    render(<PrayerDock {...dockProps(false, { ...scrubbed, dayOffset: 3 })} />);
    expect(screen.getByLabelText('Återgå till i dag')).toBeTruthy();
  });

  it('names the viewed day on the sub-line, but only when it is not today', () => {
    render(<PrayerDock {...dockProps(false)} />);
    expect(screen.queryByText('i dag')).toBeNull(); // today needs no label

    render(<PrayerDock {...dockProps(false, { ...scrubbed, dayOffset: 1 })} />);
    expect(screen.getByText('i morgon')).toBeTruthy();
  });

  // THE MISLABEL THIS GUARDS. The next-day marker used to be a hard-coded " i morgon".
  // Viewed from two days out, past that day's Ishaʾ, the next prayer is FOUR days from
  // today — and the dock confidently called it tomorrow.
  it('names the next-day prayer relative to the VIEWED day, not to today', () => {
    const props = dockProps(false, { ...scrubbed, dayOffset: 2 });
    render(<PrayerDock {...props} next={{ key: 'fajr', at: NOW + 86_400_000, nextDay: true }} />);

    // dayOffset 2 + one more day = three days out.
    expect(screen.getByText('om 3 dagar')).toBeTruthy();
    expect(screen.queryByText('i morgon')).toBeNull();
  });

  // THE DEAD END THIS GUARDS. Layer A rendered `next ? aside : null`, so with no next
  // prayer the collapsed dock had NO way back to now. That needed a scrub past Ishaʾ plus
  // an unresolvable next-day Fajr — until day navigation made one step onto a polar-winter
  // day enough to reach it routinely.
  it('still offers the way back when there is no next prayer at all', () => {
    render(<PrayerDock {...dockProps(false, { ...scrubbed, dayOffset: 4 })} next={null} />);
    expect(screen.getByLabelText('Återgå till i dag')).toBeTruthy();
    expect(screen.getByText('Inga fler böner den här dagen')).toBeTruthy();
  });

  it('keeps the today-specific empty copy on today', () => {
    render(<PrayerDock {...dockProps(false)} next={null} />);
    expect(screen.getByText('Inga fler böner i dag')).toBeTruthy();
  });

  // The date crown is the other half of the navigation the plan called for: chevrons for
  // nearby days, a calendar for distant ones.
  it('opens the calendar from the date header and jumps through the clock', () => {
    const props = dockProps(true);
    render(<PrayerDock {...props} />);

    fireEvent.press(screen.getByRole('button', { name: /Välj dag/ }));
    // The 15th of the viewed month, whatever month that is.
    fireEvent.press(screen.getByRole('button', { name: /^15 / }));

    expect(props.clock.goToDay).toHaveBeenCalledTimes(1);
    // It hands over an instant inside the chosen day; the clock resolves which day that is.
    expect(typeof (props.clock.goToDay as jest.Mock).mock.calls[0][0]).toBe('number');
  });
});

// The night group. Everything asserted here is a deliberate DIFFERENCE from the six prayer
// rows above it, and each difference exists for a reason a later "make it consistent"
// refactor would erase.
describe('PrayerDock night group', () => {
  const nightProps = (revealSchedule: boolean) => {
    const props = dockProps(revealSchedule);
    return { ...props, settings: { ...DEFAULT_SETTINGS, showNightTimes: true } };
  };

  it('is absent until asked for', () => {
    render(<PrayerDock {...dockProps(true)} />);
    expect(screen.queryByText('Natten')).toBeNull();
    expect(screen.queryByText(NIGHT_LABELS.middleOfNight)).toBeNull();
    expect(screen.queryByText(NIGHT_LABELS.lastThird)).toBeNull();
  });

  const CAPTION = 'Natten';

  it('is absent until asked for (caption)', () => {
    render(<PrayerDock {...dockProps(true)} />);
    expect(screen.queryByText(CAPTION)).toBeNull();
  });

  it('shows both landmarks under a caption that names the night', () => {
    render(<PrayerDock {...nightProps(true)} />);
    expect(screen.getByText(CAPTION)).toBeTruthy();
    expect(screen.getByText(NIGHT_LABELS.middleOfNight)).toBeTruthy();
    expect(screen.getByText(NIGHT_LABELS.lastThird)).toBeTruthy();
  });

  it('stays inside the expanded card — nothing leaks into the collapsed dock', () => {
    render(<PrayerDock {...nightProps(false)} />);
    expect(screen.queryByText(CAPTION)).toBeNull();
    expect(screen.queryByText(NIGHT_LABELS.lastThird)).toBeNull();
  });

  // THE LIE THIS GUARDS. Prayer rows scrub the timeline to their instant, but
  // clock.setInstant CLAMPS to the viewed day — and the last third routinely falls after
  // midnight. Making these rows pressable "for consistency" would land the scrubber on
  // 23:59 of the wrong day and light ʿIshāʾ up as current, with nothing on screen
  // admitting it. They are announced, not operable.
  it('does not offer the night rows as buttons', () => {
    const props = nightProps(true);
    render(<PrayerDock {...props} />);
    // The prayer rows above still are, so this is a difference, not a broken list.
    expect(screen.getByRole('button', { name: /^Fajr / })).toBeTruthy();
    for (const key of NIGHT_ORDER) {
      expect(
        screen.queryByRole('button', { name: new RegExp(`^${NIGHT_SWEDISH_NAMES[key]}`) }),
      ).toBeNull();
      expect(screen.getByLabelText(new RegExp(`^${NIGHT_SWEDISH_NAMES[key]}`))).toBeTruthy();
    }
    expect(props.clock.setInstant).not.toHaveBeenCalled();
  });

  // These times routinely land after midnight under a card headed with the EVENING's date.
  // Three ways of flagging that were tried and removed — "+1", a per-row weekday, and a
  // "Natten mot söndag" heading — because the clock face already answers it. This pins the
  // outcome: a name and a time, nothing else hanging off the row.
  it('carries no midnight qualifier — the clock already says it', () => {
    render(<PrayerDock {...nightProps(true)} />);
    const times = computePrayerTimes(STOCKHOLM, new Date(NOW), DEFAULT_SETTINGS);
    const night = computeNightTimes(times);
    const dayStart = startOfStockholmDay(NOW);
    const afterMidnight = NIGHT_ORDER.filter((key) => {
      const at = night[key];
      return at !== null && startOfStockholmDay(at.getTime()) !== dayStart;
    });
    // Guard the guard: if the fixture day stops producing a post-midnight landmark, the
    // absence assertions below would pass vacuously.
    expect(afterMidnight.length).toBeGreaterThan(0);

    expect(screen.getByText(CAPTION)).toBeTruthy();
    expect(screen.queryByText('+1')).toBeNull();
    expect(screen.queryByText('sön')).toBeNull();
    for (const key of afterMidnight) {
      // The row announces its name and its time — no trailing qualifier.
      expect(screen.getByLabelText(new RegExp(`^${NIGHT_SWEDISH_NAMES[key]} \\d{2}:\\d{2}$`))).toBeTruthy();
    }
  });

  // computeNightTimes returns null where the division would be meaningless (see
  // lib/night-times.ts). The dock must render that as the same em dash an unresolved
  // prayer gets, not as a blank row or a fabricated time.
  it('renders an unusable night as “—”, like any other unresolved time', () => {
    const props = nightProps(true);
    render(
      <PrayerDock
        {...props}
        settings={{ ...props.settings, highLatitudeRule: 'middleOfTheNight' }}
        times={computePrayerTimes(STOCKHOLM, new Date(Date.UTC(2026, 5, 21, 12)), {
          ...DEFAULT_SETTINGS,
          highLatitudeRule: 'middleOfTheNight',
        })}
      />,
    );
    for (const key of NIGHT_ORDER) {
      expect(screen.getByLabelText(`${NIGHT_SWEDISH_NAMES[key]}, kan inte beräknas`)).toBeTruthy();
    }
  });
});
