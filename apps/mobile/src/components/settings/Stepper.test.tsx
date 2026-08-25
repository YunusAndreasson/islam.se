// The −/value/+ row behind the per-prayer minute adjustments and the Hijri day offset.
//
// REGRESSION (found on an emulator, 2026-08-25): ten quick taps on "Öka Fajr" moved the
// offset FOUR minutes. Every tap reached the handler — writing a setting rebuilds the
// screen's live prayer preview, so the taps that land during that work are delivered
// together the moment JS frees up and React batches them into one render. The old
// `clamp(value + delta)` read the same `value` prop for every call in the batch, so a
// burst of four taps moved the number by one.
//
// Anything that steps a number off a prop has this shape, which is why the tests below
// press repeatedly INSIDE one act() — a press per act() commits in between and hides it.
import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { Stepper } from './Stepper';

/** A parent that owns the value the way the settings screens do. */
function Controlled({
  initial = 0,
  min,
  max,
  onChange,
}: {
  initial?: number;
  min?: number;
  max?: number;
  onChange?: (value: number) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <Stepper
      label="Fajr"
      value={value}
      min={min}
      max={max}
      onChange={(next) => {
        onChange?.(next);
        setValue(next);
      }}
    />
  );
}

describe('Stepper', () => {
  it('counts every tap in a batch, not just the last one', () => {
    render(<Controlled />);
    const plus = screen.getByLabelText('Öka Fajr');

    act(() => {
      fireEvent.press(plus);
      fireEvent.press(plus);
      fireEvent.press(plus);
    });

    expect(screen.getByText('3')).toBeTruthy();
  });

  it('keeps counting across batches, in both directions', () => {
    render(<Controlled />);
    const plus = screen.getByLabelText('Öka Fajr');
    const minus = screen.getByLabelText('Minska Fajr');

    act(() => {
      fireEvent.press(plus);
      fireEvent.press(plus);
    });
    act(() => {
      fireEvent.press(plus);
    });
    expect(screen.getByText('3')).toBeTruthy();

    act(() => {
      fireEvent.press(minus);
      fireEvent.press(minus);
    });
    expect(screen.getByText('1')).toBeTruthy();

    // Mixed directions inside one batch cancel exactly rather than both being lost.
    act(() => {
      fireEvent.press(plus);
      fireEvent.press(minus);
    });
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('clamps a burst at the limit and steps straight back off it', () => {
    const onChange = jest.fn<(value: number) => void>();
    render(<Controlled min={0} max={3} onChange={onChange} />);
    const plus = screen.getByLabelText('Öka Fajr');
    const minus = screen.getByLabelText('Minska Fajr');

    act(() => {
      for (let i = 0; i < 6; i++) fireEvent.press(plus);
    });
    expect(screen.getByText('3')).toBeTruthy();
    // No "debt" left behind by the three taps that hit the rail: one tap back is 2, not a
    // silent walk down from 6.
    act(() => fireEvent.press(minus));
    expect(screen.getByText('2')).toBeTruthy();
    expect(onChange).toHaveBeenLastCalledWith(2);
  });

  it('reports the value it is showing to a screen reader', () => {
    render(<Controlled initial={5} />);
    // The number lives in its own Text node, so the row has to carry it — pressing "Öka
    // Fajr" otherwise changes something nothing announces.
    expect(screen.getByLabelText('Fajr')).toHaveAccessibilityValue({ text: '5' });
  });
});
