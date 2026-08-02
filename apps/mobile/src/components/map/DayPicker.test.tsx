import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { addStockholmDays, startOfStockholmDay, stockholmParts } from '../../lib/stockholm-time';
import { adjacentMonth, DayPicker, monthGrid } from './DayPicker';

const day = (y: number, m: number, d: number) => startOfStockholmDay(Date.UTC(y, m - 1, d, 12));

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
      expect(stockholmParts(grid.first).d).toBe(1);
      expect(stockholmParts(grid.last).d).toBe(31);
      expect(grid.title).toBe('juli 2026');
    }
  });

  // Monday-first, as Swedish calendars are. 1 July 2026 is a Wednesday, so two blanks.
  it('pads the first row so the 1st lands under its weekday', () => {
    const grid = monthGrid(day(2026, 7, 15));
    expect(grid.cells.slice(0, 3)).toEqual([null, null, grid.first]);
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
    expect(days.map((d) => stockholmParts(d).d)).toEqual(
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
    expect(stockholmParts(adjacentMonth(grid, 1)).mo).toBe(nextMo);
    expect(stockholmParts(adjacentMonth(grid, -1)).mo).toBe(prevMo);
  });

  it('crosses the year in both directions', () => {
    expect(stockholmParts(adjacentMonth(monthGrid(day(2026, 12, 5)), 1)).y).toBe(2027);
    expect(stockholmParts(adjacentMonth(monthGrid(day(2026, 1, 5)), -1)).y).toBe(2025);
  });

  it('always lands inside the adjacent month, never skipping one', () => {
    // Walk a whole year forward one month at a time; every step must advance by exactly
    // one month. A 28-day step would repeat January, July, August, October and December.
    let anchor = day(2026, 1, 15);
    const seen: number[] = [];
    for (let i = 0; i < 12; i++) {
      seen.push(stockholmParts(anchor).mo);
      anchor = adjacentMonth(monthGrid(anchor), 1);
    }
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

describe('DayPicker', () => {
  it('opens on the month of the day being viewed', () => {
    renderPicker(day(2026, 9, 14));
    expect(screen.getByText('september 2026')).toBeTruthy();
  });

  it('hands back the picked day', () => {
    const viewed = day(2026, 9, 14);
    const { onPick } = renderPicker(viewed);

    fireEvent.press(screen.getByRole('button', { name: /^3 september 2026/ }));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0]).toBe(day(2026, 9, 3));
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
    expect(screen.getByText('oktober 2026')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Föregående månad' }));
    fireEvent.press(screen.getByRole('button', { name: 'Föregående månad' }));
    expect(screen.getByText('augusti 2026')).toBeTruthy();
  });

  // The rails are ±365 days. A day outside them cannot be picked, and the pager stops
  // rather than letting the user wander into years where adhan's accuracy is a fiction.
  it('disables days and paging beyond the ±365-day rails', () => {
    const today = day(2026, 9, 14);
    const lastMonth = monthGrid(addStockholmDays(today, 365));
    renderPicker(lastMonth.first, today);

    // The far rail falls inside this month, so paging forward is done.
    expect(
      screen.getByRole('button', { name: 'Nästa månad' }).props.accessibilityState.disabled,
    ).toBe(true);
    expect(
      screen.getByRole('button', { name: 'Föregående månad' }).props.accessibilityState.disabled,
    ).toBe(false);

    // ...and the days past it are inert.
    const beyond = stockholmParts(addStockholmDays(today, 366)).d;
    expect(
      screen.getByRole('button', { name: new RegExp(`^${beyond} `) }).props.accessibilityState
        .disabled,
    ).toBe(true);
  });

  it('closes without picking anything', () => {
    const { onPick, onClose } = renderPicker(day(2026, 9, 14));
    fireEvent.press(screen.getByRole('button', { name: 'Stäng kalendern' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
  });
});
