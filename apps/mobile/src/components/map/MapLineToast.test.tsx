import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, render } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { MapLineToast } from './MapLineToast';

describe('map line reading time', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('leaves the message up for the system reading time', async () => {
    // The fixed 6.5-second timer dismissed a map explanation even when the reader had
    // chosen a longer timeout in Android accessibility settings.
    jest.spyOn(AccessibilityInfo, 'getRecommendedTimeoutMillis').mockResolvedValue(30_000);
    const dismiss = jest.fn();
    await render(<MapLineToast message="Fajr" top={20} onDismiss={dismiss} />);
    jest.advanceTimersByTime(29_999);
    expect(dismiss).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('uses the usual reading time when the system setting cannot be read', async () => {
    jest.spyOn(AccessibilityInfo, 'getRecommendedTimeoutMillis').mockRejectedValue(new Error());
    const dismiss = jest.fn();
    await render(<MapLineToast message="Fajr" top={20} onDismiss={dismiss} />);
    jest.advanceTimersByTime(6499);
    expect(dismiss).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('ignores a timeout returned after a different line was tapped', async () => {
    // Both messages dismiss the same map overlay. A delayed first answer must never
    // schedule a timer that removes the second message.
    let answer!: (duration: number) => void;
    jest.spyOn(AccessibilityInfo, 'getRecommendedTimeoutMillis')
      .mockImplementationOnce(() => new Promise((resolve) => { answer = resolve; }))
      .mockResolvedValue(30_000);
    const dismiss = jest.fn();
    const view = await render(<MapLineToast message="Fajr" top={20} onDismiss={dismiss} />);
    await view.rerender(<MapLineToast message="Asr" top={20} onDismiss={dismiss} />);
    await act(async () => { answer(6500); });
    jest.advanceTimersByTime(6500);
    expect(dismiss).not.toHaveBeenCalled();
  });
});
