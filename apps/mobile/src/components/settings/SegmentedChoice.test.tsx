// The native segmented control that replaced the Utseende row list.
//
// Most of what this component does is the platform's — SwiftUI's `.segmented` Picker and
// Material 3's SingleChoiceSegmentedButtonRow — and there is nothing useful to assert about
// that off-device. What IS ours, and what a later "tidy-up" is most likely to remove, is the
// description line: a segment fits a word, so the sentence that tells the reader which
// option they are choosing moves underneath and follows the selection. Deleting it would
// look like simplification and would be a straight information loss.
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { SegmentedChoice } from './SegmentedChoice';
import type { Option } from './OptionGroup';

type Theme = 'system' | 'light' | 'dark';

const OPTIONS: readonly Option<Theme>[] = [
  { value: 'system', label: 'Följ system', description: 'Rekommenderad' },
  { value: 'light', label: 'Ljust' },
  { value: 'dark', label: 'Mörkt' },
];

describe('SegmentedChoice', () => {
  it('shows every option', () => {
    render(<SegmentedChoice options={OPTIONS} value="system" onChange={() => {}} />);

    for (const option of OPTIONS) expect(screen.getByText(option.label)).toBeTruthy();
  });

  it('carries the selected option’s description below the control', () => {
    render(<SegmentedChoice options={OPTIONS} value="system" onChange={() => {}} />);
    expect(screen.getByText('Rekommenderad')).toBeTruthy();
  });

  it('drops the description when the chosen option has none', () => {
    // Not a stale line from the previous selection, and not an empty reserved row that
    // makes the section jump as the reader steps through the options.
    render(<SegmentedChoice options={OPTIONS} value="dark" onChange={() => {}} />);
    expect(screen.queryByText('Rekommenderad')).toBeNull();
  });

  it('reports the pressed option', () => {
    const onChange = jest.fn();
    render(<SegmentedChoice options={OPTIONS} value="system" onChange={onChange} />);

    fireEvent.press(screen.getByText('Mörkt'));

    expect(onChange).toHaveBeenCalledWith('dark');
  });

  it('does not fire for the option already selected', () => {
    // Same rule OptionGroup follows: re-tapping where you already are is not a change, and
    // buzzing for it makes the haptic meaningless. See lib/haptics for the written policy.
    const onChange = jest.fn();
    render(<SegmentedChoice options={OPTIONS} value="dark" onChange={onChange} />);

    fireEvent.press(screen.getByText('Mörkt'));

    expect(onChange).not.toHaveBeenCalled();
  });
});

// ── The Android branch ───────────────────────────────────────────────────────────────────
//
// jest-expo runs this suite as iOS, so every assertion above exercises the SwiftUI path and
// NONE of them touch the Jetpack Compose one. That gap shipped a real bug: Compose's
// `SegmentedButton.Label` is a slot, and handed a bare string it rendered nothing — three
// blank segments on the device, with React Native logging "Text strings must be rendered
// within a <Text> component" behind them. Every test was green.
//
// So the Compose path gets the same treatment, with Platform.OS pinned. The mock in
// jest.setup.js deliberately does NOT wrap Label's children in a <Text>, which is what lets
// this fail the way the device does.
describe('SegmentedChoice on Android', () => {
  function withAndroid(run: () => void): void {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'android' });
    try {
      run();
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, get: () => original });
    }
  }

  it('labels every segment', () => {
    withAndroid(() => {
      render(<SegmentedChoice options={OPTIONS} value="system" onChange={() => {}} />);
      for (const option of OPTIONS) expect(screen.getByText(option.label)).toBeTruthy();
    });
  });

  it('reports the pressed segment', () => {
    withAndroid(() => {
      const onChange = jest.fn();
      render(<SegmentedChoice options={OPTIONS} value="system" onChange={onChange} />);
      fireEvent.press(screen.getByText('Ljust'));
      expect(onChange).toHaveBeenCalledWith('light');
    });
  });

  it('still carries the description', () => {
    withAndroid(() => {
      render(<SegmentedChoice options={OPTIONS} value="system" onChange={() => {}} />);
      expect(screen.getByText('Rekommenderad')).toBeTruthy();
    });
  });
});
