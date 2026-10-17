import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { hapticToggle } from '@/lib/haptics';
import { Toggle } from './Toggle';

jest.mock('@/lib/haptics', () => ({ hapticToggle: jest.fn() }));

describe('Toggle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // THE BUG THIS GUARDS: the row was a plain View, so only the switch itself — about
  // 51×31 inside a 48 dp row — answered a tap. Every other list row in this app
  // (OptionGroup, NavRow, PlacePicker) is pressable along its full width, so a reader who
  // taps the words "Visa moskéer" and watches nothing happen has been told a lie by the
  // rest of the app.
  it('flips from a press anywhere on the row, not just on the switch', async () => {
    const onValueChange = jest.fn();
    await render(<Toggle label="Visa moskéer" value={false} onValueChange={onValueChange} />);

    await fireEvent.press(screen.getByRole('switch', { name: 'Visa moskéer' }));

    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  // The row is ONE accessibility node that declares its own state. Before, the label Text
  // and the Switch were two nodes, so a screen reader announced the label and then
  // announced it a second time as part of the switch's name.
  it('is a single switch node carrying its own checked state', async () => {
    await render(
      <Toggle
        label="Visa nattens tider"
        description="Räknas från Maghrib till nästa Fajr."
        value
        onValueChange={jest.fn()}
      />,
    );

    // Label and description join with a full stop, not a comma — the grammar OptionGroup
    // documents, so a description never runs on into the label as one more list item.
    const row = screen.getByRole('switch', {
      name: 'Visa nattens tider. Räknas från Maghrib till nästa Fajr.',
    });
    expect(row.props.accessibilityState.checked).toBe(true);
  });

  // lib/haptics' policy exempts the native Switch because it carries its own platform
  // feedback. A press on the ROW writes the value programmatically, and a programmatic
  // write produces nothing — so that path has to tick itself, or half of one control
  // would buzz and half would not. Class 4: a control snapping under direct manipulation.
  it('ticks on the row press, with the value it is moving to', async () => {
    await render(<Toggle label="Haptisk återkoppling" value onValueChange={jest.fn()} />);

    await fireEvent.press(screen.getByRole('switch', { name: 'Haptisk återkoppling' }));

    expect(hapticToggle).toHaveBeenCalledWith(false);
  });

  it('does nothing at all when disabled', async () => {
    const onValueChange = jest.fn();
    await render(<Toggle label="Påminnelse" value={false} onValueChange={onValueChange} disabled />);

    await fireEvent.press(screen.getByRole('switch', { name: 'Påminnelse' }));

    expect(onValueChange).not.toHaveBeenCalled();
    expect(hapticToggle).not.toHaveBeenCalled();
  });
});
