import { createRef } from 'react';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { Dimensions, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';

import {
  computeNightTimes,
  NIGHT_LABELS,
  NIGHT_ORDER,
  NIGHT_SWEDISH_NAMES,
} from '@/lib/night-times';
import { computePrayerTimes, PRAYER_LABELS, PRAYER_ORDER } from '@/lib/prayer-times';
import { DEFAULT_SETTINGS } from '@/lib/settings/types';
import { MAX_DAY_OFFSET, type SolarClock } from '@/lib/solar/useSolarClock';
import { startOfZoneDay, zonePrayerDate } from '@/lib/zone-time';
import { DOCK_COLLAPSED_BASE, type DayMark, type PrayerDockHandle, PrayerDock, resolveToggle } from './PrayerDock';
import { first, last } from '@/test-utils/at';

beforeEach(() => {
  Dimensions.set({ window: { width: 411, height: 914, scale: 2.625, fontScale: 1 }, screen: { width: 411, height: 914, scale: 2.625, fontScale: 1 } });
});

const STOCKHOLM = { latitude: 59.3293, longitude: 18.0686 };
// What PrayerDock assumes a schedule block is worth before it has measured a real one (its
// SCHEDULE_FALLBACK, night group off). Duplicated rather than exported: the constant is an
// internal guess, and a test that imported it would agree with the component by construction.
const SCHEDULE_FALLBACK_HEIGHT = 260;
const NOW = Date.UTC(2026, 7, 1, 12, 0, 0);

function dockProps(revealSchedule: boolean, clockOverrides: Partial<SolarClock> = {}) {
  const dayStart = startOfZoneDay(NOW);
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
      flush: jest.fn(),
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
  it('keeps the same summary and preview controls when opening and closing', () => {
    const props = dockProps(false, { mode: 'scrub' });
    const { rerender } = render(<PrayerDock {...props} />);
    const summary = screen.getByTestId('dock-summary');
    for (const revealSchedule of [true, false, true]) {
      rerender(<PrayerDock {...props} revealSchedule={revealSchedule} />);
      expect(screen.getByTestId('dock-summary')).toBe(summary);
      expect(within(summary).getByText(PRAYER_LABELS.asr)).toBeTruthy();
      expect(within(summary).getByText('Stockholm')).toBeTruthy();
      expect(within(summary).getByTestId('prayer-preview-time').props.children).toBe('14:00');
      expect(within(summary).getByLabelText('Återgå till nu')).toBeTruthy();
    }
  });

  it('keeps the calendar outside the scrolling rows and reserves its measured height', () => {
    render(<PrayerDock {...dockProps(true)} />);
    const scroll = screen.getByTestId('dock-schedule-scroll');
    expect(within(scroll).queryByTestId('prayer-dock-date')).toBeNull();
    expect(within(screen.getByTestId('dock-calendar-header')).getByTestId('prayer-dock-date')).toBeTruthy();
    const before = StyleSheet.flatten(scroll.props.style).maxHeight;
    fireEvent(screen.getByTestId('dock-calendar-header'), 'layout', {
      nativeEvent: { layout: { height: 104 } },
    });
    expect(StyleSheet.flatten(screen.getByTestId('dock-schedule-scroll').props.style).maxHeight).toBe(before - 40);
  });

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
// that); what is guarded here is the surface — that the controls live with the calendar,
// that they say the right thing about a day that is not today, and that they call the
// clock rather than reimplementing it.
describe('PrayerDock day navigation', () => {
  const scrubbed = { mode: 'scrub' as const };

  it('shows the selected time beside return, matching the timeline spoken time', () => {
    const props = dockProps(false, scrubbed);
    render(<PrayerDock {...props} />);
    expect(screen.getByTestId('prayer-preview-time').props.children).toBe('14:00');
    expect(screen.getByRole('adjustable').props.accessibilityValue.text).toBe('14:00');
    fireEvent.press(screen.getByLabelText('Återgå till nu'));
    expect(props.clock.reset).toHaveBeenCalledTimes(1);
  });

  it('keeps the preview time out of live mode', () => {
    render(<PrayerDock {...dockProps(false)} />);
    expect(screen.queryByTestId('prayer-preview-time')).toBeNull();
  });

  it('keeps day buttons out of the collapsed scrubber', () => {
    render(<PrayerDock {...dockProps(false)} />);
    expect(screen.queryByRole('button', { name: 'Nästa dag' })).toBeNull();
    expect(screen.getByRole('adjustable', { name: 'Dagens tidslinje' })).toBeTruthy();
  });

  it('offers both chevrons alongside the calendar when expanded', () => {
    render(<PrayerDock {...dockProps(true)} />);
    expect(screen.getByRole('button', { name: 'Föregående dag' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Nästa dag' })).toBeTruthy();
  });

  it('steps the clock by exactly one day in each direction', () => {
    const props = dockProps(true);
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
    render(<PrayerDock {...dockProps(true, { dayOffset, ...scrubbed })} />);
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

  it('speaks BOTH dates from the date crown, Hijri first', () => {
    // THE BUG THIS GUARDS: the crown's label named only the Gregorian date. The Hijri line
    // is the one printed above it in the heavier ink — this is a Hijri-calendar app — so a
    // screen reader user heard "Lördag 1 augusti. Välj dag." and never once heard which
    // Hijri day they were on. The label follows the printed order: Hijri, then Gregorian.
    render(<PrayerDock {...dockProps(true)} />);

    // Both printed lines, in printed order, then the action — asserted whole, so a
    // regression names the exact string that changed instead of "expected true".
    expect(screen.getByRole('button', { name: /Välj dag/ }).props.accessibilityLabel).toBe(
      '16 Ṣafar 1448, Lördag 1 augusti. Välj dag.',
    );
    // …and both halves really are on screen, so the label stays a reading of the crown
    // rather than a sentence that drifted away from it.
    expect(screen.getByText('16 Ṣafar 1448')).toBeTruthy();
    expect(screen.getByText('Lördag 1 augusti')).toBeTruthy();
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
    const goToDayCalls = (props.clock.goToDay as jest.Mock).mock.calls;
    expect(typeof first(first(goToDayCalls, 'goToDay calls'), 'goToDay arg')).toBe('number');
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
    const dayStart = startOfZoneDay(NOW);
    const afterMidnight = NIGHT_ORDER.filter((key) => {
      const at = night[key];
      return at !== null && startOfZoneDay(at.getTime()) !== dayStart;
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

// REGRESSION (found on an Android emulator at 1.5× and 2× text, 2026-08-25): the open
// card's height was a constant (396 dp, +108 while the night group was on), so it could
// not know the reader's text size. At 1.5× the rows grew, the bottom-pinned content slid
// up past the card's top edge, and the Hijri line — the reason the crown exists — was
// clipped away entirely while "Tisdag 25 augusti" collided with the grab handle.
//
// The open height is now COLLAPSED + whatever the schedule block measures, so it follows
// the text size, the night group, and a longer month name in any future locale. The
// height itself is a shared value the reanimated shim doesn't animate, so the observable
// is the height the dock reports to its host — which is also the number the map uses for
// its camera padding, and would frame the country wrongly if it drifted from the card.
// Above the Arctic Circle a prayer routinely belongs to a different calendar day than the
// card is headed with, and hh:mm alone cannot say so. At Kiruna on 14 June 2026 the sun never
// sets, adhan's aqrabBalad substitution puts Maghrib at 00:36 the NEXT morning, and the row
// rendered "Maghrib 00:36" directly beneath "ʿAṣr 17:41" — reading as the small hours already
// gone rather than twelve hours away. Found on an emulator, 2026-08-25.
describe('PrayerDock midnight crossing', () => {
  const KIRUNA = { latitude: 67.85572, longitude: 20.22513 };
  // Midsummer, when Kiruna's Maghrib falls past midnight. Local noon so the calendar day is
  // unambiguous whatever zone the suite runs in.
  const MIDSUMMER = Date.UTC(2026, 5, 14, 10, 0, 0);

  // ONE dockProps call. Two would build two independent sets of jest.fn()s, and which set the
  // component received would rest on object-literal key precedence — reorder the keys and the
  // assertions start reading a mock the component never got, which passes silently.
  function polarProps() {
    const base = dockProps(true);
    const dayStart = startOfZoneDay(MIDSUMMER);
    return {
      ...base,
      times: computePrayerTimes(KIRUNA, zonePrayerDate(dayStart), DEFAULT_SETTINGS),
      clock: { ...base.clock, now: MIDSUMMER, dayStart, todayStart: dayStart },
    };
  }

  it('marks where the schedule crosses midnight', () => {
    const props = polarProps();
    // Guard the guard: if adhan ever stops putting this day's Maghrib past midnight, every
    // assertion below would pass vacuously.
    const dayEnd = props.clock.dayStart + props.clock.dayLength;
    expect(props.times.maghrib.getTime()).toBeGreaterThanOrEqual(dayEnd);

    render(<PrayerDock {...props} />);
    // includeHiddenElements because the rule is deliberately pruned from the accessibility
    // tree: every row below it already carries "efter midnatt" in its own label, and
    // announcing the caption too would read the fact twice for one row. It is a visual
    // grouping, and this asserts it as one.
    expect(screen.getByText('Efter midnatt', { includeHiddenElements: true })).toBeTruthy();
  });

  it('says it in words for a screen reader, which cannot see the rule', () => {
    render(<PrayerDock {...polarProps()} />);
    expect(screen.getByLabelText(/^Maghrib \d{2}:\d{2}, efter midnatt/)).toBeTruthy();
    // The rows before the crossing are untouched — no qualifier, no noise.
    expect(screen.getByLabelText(/^Ẓuhr \d{2}:\d{2}$/)).toBeTruthy();
  });

  it('does not offer a post-midnight row as a button', () => {
    // clock.setInstant clamps to the viewed day, so this row can never be scrubbed to: the
    // thumb would park on the far rail at 24:00, and where two slots sit past midnight the
    // EARLIER one would light up as current. Same reasoning as the night landmarks.
    const props = polarProps();
    render(<PrayerDock {...props} />);
    expect(screen.queryByRole('button', { name: /^Maghrib / })).toBeNull();
    // Rows inside the day still scrub, so this is a difference and not a dead list.
    fireEvent.press(screen.getByRole('button', { name: /^Ẓuhr / }));
    expect(props.clock.setInstant).toHaveBeenCalled();
  });

  it('still paints the next-prayer row brass when it is the one past midnight', () => {
    // The row that stopped being pressable is very often the NEXT one — at Kiruna in June the
    // next prayer is the 00:36 Maghrib for most of the evening. The brass ground used to live
    // only on the Pressable branch, where it was unreachable-by-accident, so making these rows
    // plain Views left the text emphasised on no background: a half-painted row.
    const base = polarProps();
    const maghribRowBackground = (nextKey: 'maghrib' | 'asr') => {
      const view = render(
        <PrayerDock
          {...base}
          next={{ key: nextKey, at: base.times[nextKey].getTime(), nextDay: false }}
        />,
      );
      const row = view.getByLabelText(/^Maghrib \d{2}:\d{2}, efter midnatt/);
      const flat = StyleSheet.flatten(row.props.style) as { backgroundColor?: string };
      view.unmount();
      return flat.backgroundColor;
    };
    // Same row, same branch, only `isNext` differs — so the difference IS the highlight.
    expect(maghribRowBackground('maghrib')).toBeTruthy();
    expect(maghribRowBackground('asr')).toBeFalsy();
  });

  it('stays out of the way on an ordinary day', () => {
    // Stockholm in August: every slot lands on the day the card is headed with, so the rule
    // must not appear at all — it is a correction, not decoration.
    render(<PrayerDock {...dockProps(true)} />);
    // Same includeHiddenElements as above, or this would pass whether the rule rendered or
    // not — the caption is invisible to the default query either way.
    expect(screen.queryByText('Efter midnatt', { includeHiddenElements: true })).toBeNull();
    for (const key of PRAYER_ORDER) {
      expect(screen.queryByLabelText(new RegExp(`^${PRAYER_LABELS[key]} .*efter midnatt`))).toBeNull();
    }
  });
});

// How a finished drag on the handle is read. Driving a real gesture through the test renderer
// would exercise gesture-handler's arbitration rather than this rule, so the rule is pure and
// tested directly. `mid` is the halfway height; `startHeight`/`height` are card heights.
describe('resolveToggle — what a finished toggle gesture means', () => {
  const CLOSED = 100;
  const OPEN = 400;
  const MID = 250;
  const at = (o: Partial<Parameters<typeof resolveToggle>[0]>) =>
    resolveToggle({ travelled: 0, startHeight: CLOSED, height: CLOSED, velocityY: 0, mid: MID, ...o });

  // THE BUG THIS PINS: gesture-handler gives the pan priority over the tap as soon as a touch
  // clears its activation slop, so a press whose thumb wobbled a few points arrived here as a
  // drag. Read by height, a card still sitting at its collapsed height is "below MID, so
  // closed" — and the dock sprang back to exactly where it already was, with no state change
  // and no haptic. To the user, pressing the handle simply did nothing, at random.
  it('treats a press that merely drifted as a tap, and toggles', () => {
    // 20 pt: past gesture-handler's ~10 dp activation slop, so this really does arrive as a
    // pan — which is the whole trap — but nowhere near a deliberate pull.
    expect(at({ travelled: 20, startHeight: CLOSED, height: CLOSED + 20 })).toBe(true);
    expect(at({ travelled: 20, startHeight: OPEN, height: OPEN - 20 })).toBe(false);
  });

  // The other side of the same threshold: a pull the user thought better of still snaps back,
  // rather than the fix turning every abandoned drag into a toggle.
  it('still snaps back a small drag the user abandoned', () => {
    expect(at({ travelled: 60, startHeight: CLOSED, height: CLOSED + 60 })).toBe(false);
  });

  // The card is clamped at both ends, so pushing DOWN on an already-closed dock moves it zero
  // points. Measuring the CARD rather than the finger would score that as a no-travel press and
  // open the very thing being pushed shut.
  it('does not open a closed dock that was pushed further shut', () => {
    expect(at({ travelled: 90, startHeight: CLOSED, height: CLOSED, velocityY: 600 })).toBe(false);
  });

  // Likewise a drag that went up and came back: its FINAL translation is zero, so reading that
  // instead of the peak would open a card the user had just decided against.
  it('does not open a drag the user took back to where it started', () => {
    expect(at({ travelled: 120, startHeight: CLOSED, height: CLOSED })).toBe(false);
  });

  // Past the slop it is a real drag, and the ordinary rules apply.
  it('lets a real drag be decided by fling direction, then by position', () => {
    // A fling wins over position: released low, but thrown upward.
    expect(at({ travelled: 60, height: CLOSED + 40, velocityY: -900 })).toBe(true);
    // Thrown downward from high up.
    expect(at({ travelled: 200, height: OPEN - 20, velocityY: 900 })).toBe(false);
    // Slow releases go to the nearer end.
    expect(at({ travelled: 200, height: MID + 1 })).toBe(true);
    expect(at({ travelled: 200, height: MID - 1 })).toBe(false);
  });
});

describe('PrayerDock open height follows the schedule it measured', () => {
  function measure(height: number) {
    fireEvent(screen.getByTestId('dock-calendar-header', { includeHiddenElements: true }), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 64 } },
    });
    // includeHiddenElements: the block is hidden from assistive tech while the dock is shut
    // (that is the point — nothing behind the card should be announced), but it is still in
    // the tree and still laid out.
    fireEvent(screen.getByTestId('dock-schedule', { includeHiddenElements: true }), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 320, height: height - 64 } },
    });
  }

  it('reports collapsed + measured schedule when it opens', () => {
    const onExpandedChange = jest.fn<(open: boolean, height: number) => void>();
    const { rerender } = render(
      <PrayerDock {...dockProps(false)} onExpandedChange={onExpandedChange} />,
    );
    rerender(<PrayerDock {...dockProps(true)} onExpandedChange={onExpandedChange} />);
    measure(260);

    expect(onExpandedChange).toHaveBeenLastCalledWith(true, DOCK_COLLAPSED_BASE + 260);
  });

  it('grows with the text size instead of clipping the date crown', () => {
    const onExpandedChange = jest.fn<(open: boolean, height: number) => void>();
    const { rerender } = render(
      <PrayerDock {...dockProps(false)} onExpandedChange={onExpandedChange} />,
    );
    rerender(<PrayerDock {...dockProps(true)} onExpandedChange={onExpandedChange} />);
    // What the same block measures at the OS's largest text size — every row taller, the
    // crown two bigger lines. The old constant would have left ~150 dp of it above the
    // card's top edge.
    measure(430);

    expect(onExpandedChange).toHaveBeenLastCalledWith(true, DOCK_COLLAPSED_BASE + 430);
  });

  // THE BUG THIS PINS: the block is laid out while the dock is shut too, but the rows are
  // NOT in it then — they are unmounted so a screen reader cannot read a schedule that is
  // behind a closed card. Taking that measurement as the open height set EXPANDED to a
  // number with no schedule inside it, and the dock then opened in two stages: a drag could
  // only pull the card up to the sliver that height described, it sat there under the thumb
  // however much further you pulled, and it reached its real height only after release —
  // when mounting the rows re-laid the block out and the re-report sprang the card the rest
  // of the way. That is what "the dock doesn't open until I let go" was.
  it('ignores a layout taken while the rows are not in the block', () => {
    const onExpandedChange = jest.fn<(open: boolean, height: number) => void>();
    const { rerender } = render(
      <PrayerDock {...dockProps(false)} onExpandedChange={onExpandedChange} />,
    );
    // A closed-dock layout: 74 dp is about what the date crown alone occupies.
    measure(74);
    rerender(<PrayerDock {...dockProps(true)} onExpandedChange={onExpandedChange} />);

    const [open, reported] = last(onExpandedChange.mock.calls, 'onExpandedChange calls');
    expect(open).toBe(true);
    // Opened to the fallback, NOT to a card the height of its own date crown.
    expect(reported).toBe(DOCK_COLLAPSED_BASE + SCHEDULE_FALLBACK_HEIGHT);
  });

  it('re-reports the height when the block changes size while open', () => {
    const onExpandedChange = jest.fn<(open: boolean, height: number) => void>();
    render(<PrayerDock {...dockProps(true)} onExpandedChange={onExpandedChange} />);
    measure(260);
    // Turning the night group on adds two rows under an open card. Without the re-report
    // the card would keep the old height and clip them (and the map would pad for a card
    // that no longer exists).
    measure(368);

    expect(onExpandedChange).toHaveBeenLastCalledWith(true, DOCK_COLLAPSED_BASE + 368);
  });
});

// The schedule must remain reachable when large text exceeds the available map area.
describe('PrayerDock accessible layout', () => {
  it('gives large text more room while bounding the scrollable schedule on a small screen', () => {
    Dimensions.set({ window: { width: 320, height: 640, scale: 2, fontScale: 2 }, screen: { width: 320, height: 640, scale: 2, fontScale: 2 } });
    const onExpandedChange = jest.fn();
    render(<PrayerDock {...dockProps(true)} onExpandedChange={onExpandedChange} />);
    fireEvent(screen.getByTestId('dock-schedule'), 'layout', { nativeEvent: { layout: { height: 900 } } });
    const [, height] = last(onExpandedChange.mock.calls, 'height report');
    expect(height).toBeLessThan(640);
    expect(height).toBeGreaterThan(DOCK_COLLAPSED_BASE);
    const scroll = screen.UNSAFE_getByType(ScrollView);
    expect(scroll.props.scrollEnabled).toBe(true);
    expect(StyleSheet.flatten(scroll.props.style).maxHeight).toBeLessThan(900);
    expect(StyleSheet.flatten(screen.getByRole('button', { name: 'Nästa dag' }).props.style).width).toBeGreaterThanOrEqual(48);
  });
});


describe('map dismissal', () => {
  it('closes an open dock without changing the selected time and allows reopening', () => {
    const ref = createRef<PrayerDockHandle>();
    const props = dockProps(true);
    render(<PrayerDock {...props} ref={ref} />);
    act(() => { expect(ref.current?.collapse()).toBe(true); });
    expect(screen.getByLabelText('Visa alla bönetider')).toBeTruthy();
    expect(props.clock.reset).not.toHaveBeenCalled();
    expect(props.clock.setFraction).not.toHaveBeenCalled();
    act(() => { expect(ref.current?.collapse()).toBe(false); });
    fireEvent(screen.getByTestId('prayer-dock-toggle'), 'accessibilityTap');
    expect(screen.getByLabelText('Dölj bönetider')).toBeTruthy();
    act(() => { expect(ref.current?.collapse()).toBe(true); });
  });
});
