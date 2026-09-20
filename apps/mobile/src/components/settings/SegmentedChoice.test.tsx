// The native segmented control that replaced the Utseende row list.
//
// Most of what this component does is the platform's — SwiftUI's `.segmented` Picker and
// Material 3's SingleChoiceSegmentedButtonRow — and there is nothing useful to assert about
// that off-device. What IS ours, and what a later "tidy-up" is most likely to remove, is the
// description line: a segment fits a word, so the sentence that tells the reader which
// option they are choosing moves underneath and follows the selection. Deleting it would
// look like simplification and would be a straight information loss.
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform, useWindowDimensions } from 'react-native';

import { SETTINGS_STORAGE_KEY } from '@/lib/settings/store';
import { SettingsProvider } from '@/lib/settings/context';
import { DEFAULT_SETTINGS } from '@/lib/settings/types';
import { storage } from '@/lib/storage';

import { SegmentedChoice } from './SegmentedChoice';
import type { Option } from './OptionGroup';

type Theme = 'system' | 'light' | 'dark';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true, default: jest.fn(),
}));
beforeEach(() => {
  jest.mocked(useWindowDimensions).mockReturnValue({ width: 411, height: 914, scale: 2.625, fontScale: 1 });
});

const OPTIONS: readonly Option<Theme>[] = [
  { value: 'system', label: 'Följ system', description: 'Rekommenderad' },
  { value: 'light', label: 'Ljust' },
  { value: 'dark', label: 'Mörkt' },
];

describe('SegmentedChoice', () => {
  it('offers readable radio choices at large text sizes', () => {
    jest.mocked(useWindowDimensions).mockReturnValue({ width: 320, height: 711, scale: 2.625, fontScale: 2 });
    const onChange = jest.fn();
    render(<SegmentedChoice options={OPTIONS} value="system" onChange={onChange} />);
    // OptionGroup's spoken form: label, then the description after a full stop (not a
    // comma, which made a comma-list label run on into its description).
    expect(screen.getByRole('radio', { name: 'Följ system. Rekommenderad', checked: true })).toBeTruthy();
    fireEvent.press(screen.getByRole('radio', { name: 'Ljust' }));
    expect(onChange).toHaveBeenCalledWith('light');
  });
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

// ── The native surface must be told which scheme to paint in ─────────────────────────────
//
// A Host renders real SwiftUI / Jetpack Compose, and left to itself that content reads the
// PHONE's appearance — not the app's Utseende override, which is the very setting this
// control changes. Locked to "Ljust" on a phone in dark mode, Material 3 chose its
// dark-scheme on-surface ink (#a1a2ac) and painted it on the app's light paper: measured on
// device at 2.50:1, where the two agreeing gives 16.9:1. The labels were there and could not
// be read.
//
// Asserted through the app's OWN resolution (useActiveScheme via SettingsProvider) rather
// than by mocking a hook, because the bug lives exactly in the gap between the two: the OS
// says one thing, the reader's preference says another, and the Host must follow the reader.
describe('SegmentedChoice tells the host which scheme to use', () => {
  beforeEach(async () => {
    await storage.removeItem(SETTINGS_STORAGE_KEY);
  });

  /** Renders inside the real provider with a theme preference on disk. Jest's OS scheme is
   *  light, so 'dark' here is a genuine disagreement between phone and preference. */
  async function renderWithTheme(theme: 'system' | 'light' | 'dark') {
    await storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, theme }));
    render(
      <SettingsProvider>
        <SegmentedChoice options={OPTIONS} value="system" onChange={() => {}} />
      </SettingsProvider>,
    );
    await act(async () => {});
  }

  it('paints dark when the reader locked dark on a light phone', async () => {
    await renderWithTheme('dark');
    await waitFor(() => expect(screen.getByTestId('host-dark')).toBeTruthy());
  });

  it('paints light when the reader locked light', async () => {
    await renderWithTheme('light');
    await waitFor(() => expect(screen.getByTestId('host-light')).toBeTruthy());
  });

  it('never leaves the scheme unset', async () => {
    // The regression itself: no colorScheme prop at all, so the native side falls back to
    // the OS. The mock reports that as `host-unset`.
    await renderWithTheme('system');
    await waitFor(() => expect(screen.queryByTestId('host-unset')).toBeNull());
  });
});
