import { describe, expect, it, jest } from '@jest/globals';
import { Modal } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { addZoneDays, startOfZoneDay, zoneParts } from '@/lib/zone-time';
import { adjacentMonth, DayPicker, GRID_CELLS, hijriSpan, monthGrid } from './DayPicker';
import { first } from '@/test-utils/at';

const day = (y: number, m: number, d: number) => startOfZoneDay(Date.UTC(y, m - 1, d, 12));

function renderPicker(dayStart: number, todayStart = dayStart) {
  const onPick = jest.fn();
  const onClose = jest.fn();
  render(
    <DayPicker dayStart={dayStart} todayStart={todayStart} onPick={onPick} onClose={onClose} />,
  );
  return { onPick, onClose };
}

describe('monthGrid', () => {
  it('spans exactly the month the anchor falls in, from any day of it', () => {
    for (const d of [1, 14, 31]) {
      const grid = monthGrid(day(2026, 7, d));
      const days = grid.cells.filter((c): c is number => c != null);
      expect(days).toHaveLength(31); // July
      expect(zoneParts(grid.first).d).toBe(1);
      expect(zoneParts(grid.last).d).toBe(31);
      expect(grid.title).toBe('juli 2026');
    }
  });

  // Monday-first, as Swedish calendars are. 1 July 2026 is a Wednesday, so two blanks.
  it('pads the first row so the 1st lands under its weekday', () => {
    const grid = monthGrid(day(2026, 7, 15));
    expect(grid.cells.slice(0, 3)).toEqual([null, null, grid.first]);
  });

  // REGRESSION (found on an emulator, 2026-08-25): the grid was as tall as the month
  // needed — four rows for a February starting on a Monday, six for a 31-day month
  // starting on a Sunday. The sheet is anchored to the dock's bottom and grows upward, so
  // paging between two such months slid the ‹ › ✕ row up to 80 dp up from under the
  // reader's finger; the tap that followed landed in the grid, which PICKS a day and
  // closes the sheet. Every month is six rows now, whatever it holds.
  it('is always six rows tall, whatever the month', () => {
    const shortest = monthGrid(day(2027, 2, 10)); // 28 days, starts Monday — 4 rows of days
    const longest = monthGrid(day(2026, 11, 10)); // 30 days, starts Sunday — 6 rows of days
    for (const grid of [shortest, longest, monthGrid(day(2026, 7, 15))]) {
      expect(grid.cells).toHaveLength(GRID_CELLS);
    }
    // The padding is trailing blanks, not repeated or invented days.
    expect(shortest.cells.filter((c) => c != null)).toHaveLength(28);
    expect(first(shortest.cells.slice(-1), 'last cell')).toBeNull();
  });

  it('handles February, leap and common', () => {
    expect(monthGrid(day(2027, 2, 10)).cells.filter(Boolean)).toHaveLength(28);
    expect(monthGrid(day(2028, 2, 10)).cells.filter(Boolean)).toHaveLength(29);
  });

  // The month containing the 25-hour autumn day. Building the grid by stepping days is
  // exactly where a naive +24 h would stall and loop forever (or duplicate the 25th).
  it('walks a month containing a DST transition without stalling or duplicating', () => {
    const october = monthGrid(day(2026, 10, 4));
    const days = october.cells.filter((c): c is number => c != null);
    expect(days).toHaveLength(31);
    expect(new Set(days).size).toBe(31);
    expect(days.map((d) => zoneParts(d).d)).toEqual(
      Array.from({ length: 31 }, (_, i) => i + 1),
    );
  });
});

// THE BUG THIS GUARDS, and it was in the first version of this file: paging by "anchor ±
// 28 days" leaves you in the SAME month whenever the month is longer than 28 days and the
// anchor is early in it — from 1 July, +28 is 29 July. The pager silently did nothing.
describe('adjacentMonth', () => {
  it.each([
    [day(2026, 1, 1), 2, 12],
    [day(2026, 7, 1), 8, 6],
    [day(2026, 7, 31), 8, 6],
    [day(2026, 12, 31), 1, 11],
    [day(2027, 2, 28), 3, 1],
  ])('steps off the end of the month, not 28 days along', (anchor, nextMo, prevMo) => {
    const grid = monthGrid(anchor);
    expect(zoneParts(adjacentMonth(grid, 1)).mo).toBe(nextMo);
    expect(zoneParts(adjacentMonth(grid, -1)).mo).toBe(prevMo);
  });

  it('crosses the year in both directions', () => {
    expect(zoneParts(adjacentMonth(monthGrid(day(2026, 12, 5)), 1)).y).toBe(2027);
    expect(zoneParts(adjacentMonth(monthGrid(day(2026, 1, 5)), -1)).y).toBe(2025);
  });

  it('always lands inside the adjacent month, never skipping one', () => {
    // Walk a whole year forward one month at a time; every step must advance by exactly
    // one month. A 28-day step would repeat January, July, August, October and December.
    let anchor = day(2026, 1, 15);
    const seen: number[] = [];
    for (let i = 0; i < 12; i++) {
      seen.push(zoneParts(anchor).mo);
      anchor = adjacentMonth(monthGrid(anchor), 1);
    }
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

// The line under the sheet's title: which Hijri months the Gregorian month on screen spans.
describe('hijriSpan', () => {
  it('names both months and writes a shared year once', () => {
    expect(hijriSpan(monthGrid(day(2026, 9, 10)))).toBe('Rabīʿ al-awwal – Rabīʿ al-ākhir 1448');
  });

  // June 2026 contains 1 Muḥarram 1448. Writing the year once there would put Dhū al-ḥijja in
  // the wrong year — the one span where "month – month year" is simply false.
  it('writes each year when the span crosses Muḥarram', () => {
    expect(hijriSpan(monthGrid(day(2026, 6, 10)))).toBe('Dhū al-ḥijja 1447 – Muḥarram 1448');
  });

  // Same adjustment the dock's own Hijri line takes, so the sheet and the crown agree.
  it('honours the reader’s Hijri offset', () => {
    const grid = monthGrid(day(2026, 9, 10));
    expect(hijriSpan(grid, 30)).not.toBe(hijriSpan(grid));
  });
});

describe('DayPicker', () => {
  it('opens on the month of the day being viewed', () => {
    renderPicker(day(2026, 9, 14));
    expect(screen.getByText('September 2026')).toBeTruthy();
  });

  it('hands back the picked day', () => {
    const viewed = day(2026, 9, 14);
    const { onPick } = renderPicker(viewed);

    fireEvent.press(screen.getByRole('button', { name: /^3 september 2026/ }));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(first(first(onPick.mock.calls, 'onPick calls'), 'onPick arg')).toBe(day(2026, 9, 3));
  });

  // The spoken label anchors the number: "3" alone tells a screen-reader user nothing
  // about how far away it is, which is the one thing a day picker is for.
  it('speaks each day relative to today as well as by date', () => {
    const today = day(2026, 9, 1);
    renderPicker(today);
    expect(screen.getByRole('button', { name: '1 september 2026, i dag' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '2 september 2026, i morgon' })).toBeTruthy();
  });

  it('pages to the next and previous month', () => {
    renderPicker(day(2026, 9, 14));

    fireEvent.press(screen.getByRole('button', { name: 'Nästa månad' }));
    expect(screen.getByText('Oktober 2026')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Föregående månad' }));
    fireEvent.press(screen.getByRole('button', { name: 'Föregående månad' }));
    expect(screen.getByText('Augusti 2026')).toBeTruthy();
  });

  // REGRESSION (found on an emulator, 2026-08-25): twelve quick taps on "Nästa månad"
  // paged TWO months. Every tap reached the handler — re-rendering the 42-cell sheet over
  // the open dock takes long enough that the taps landing during it are delivered together
  // once JS frees, and React batches them into one render, where every call read the same
  // committed month and asked for the same neighbour. Paging a year ahead (to find
  // Ramadan, say) is exactly what this pager is for.
  //
  // Each press in its own act() commits in between and hides it, which is why the presses
  // below share one.
  it('counts every tap in a batch, not just the last one', () => {
    renderPicker(day(2026, 8, 25));

    act(() => {
      for (let i = 0; i < 12; i++) {
        fireEvent.press(screen.getByRole('button', { name: 'Nästa månad' }));
      }
    });
    expect(screen.getByText('Augusti 2027')).toBeTruthy();

    act(() => {
      for (let i = 0; i < 5; i++) {
        fireEvent.press(screen.getByRole('button', { name: 'Föregående månad' }));
      }
    });
    expect(screen.getByText('Mars 2027')).toBeTruthy();
  });

  // A burst that runs past the rail stops AT it — and leaves no debt behind, so the next
  // tap back moves one month rather than unwinding an overshoot first.
  it('stops a batch at the rail instead of running past it', () => {
    const today = day(2026, 8, 25);
    renderPicker(today, today);

    act(() => {
      for (let i = 0; i < 24; i++) {
        fireEvent.press(screen.getByRole('button', { name: 'Nästa månad' }));
      }
    });
    // +365 days from 25 Aug 2026 is 25 Aug 2027, so August 2027 is the last month with a
    // reachable day in it.
    expect(screen.getByText('Augusti 2027')).toBeTruthy();

    act(() => fireEvent.press(screen.getByRole('button', { name: 'Föregående månad' })));
    expect(screen.getByText('Juli 2027')).toBeTruthy();
  });

  // The rails are ±365 days. A day outside them cannot be picked, and the pager stops
  // rather than letting the user wander into years where adhan's accuracy is a fiction.
  it('disables days and paging beyond the ±365-day rails', () => {
    const today = day(2026, 9, 14);
    const lastMonth = monthGrid(addZoneDays(today, 365));
    renderPicker(lastMonth.first, today);

    // The far rail falls inside this month, so paging forward is done.
    expect(
      screen.getByRole('button', { name: 'Nästa månad' }).props.accessibilityState.disabled,
    ).toBe(true);
    expect(
      screen.getByRole('button', { name: 'Föregående månad' }).props.accessibilityState.disabled,
    ).toBe(false);

    // ...and the days past it are inert.
    const beyond = zoneParts(addZoneDays(today, 366)).d;
    expect(
      screen.getByRole('button', { name: new RegExp(`^${beyond} `) }).props.accessibilityState
        .disabled,
    ).toBe(true);
  });

  it('dismisses through Android Back and the backdrop without changing the selected day', () => {
    const { onPick, onClose } = renderPicker(day(2026, 9, 14));
    fireEvent(screen.UNSAFE_getByType(Modal), 'requestClose');
    fireEvent.press(screen.getByTestId('calendar-backdrop', { includeHiddenElements: true }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('closes without picking anything', () => {
    const { onPick, onClose } = renderPicker(day(2026, 9, 14));
    fireEvent.press(screen.getByRole('button', { name: 'Stäng kalendern' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
  });
});
