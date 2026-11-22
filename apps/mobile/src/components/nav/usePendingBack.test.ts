import { expect, it, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';
import { useIsFocused } from 'expo-router';
import { BackHandler } from 'react-native';

import { first } from '@/test-utils/at';
import { usePendingBack } from './usePendingBack';

jest.mock('expo-router', () => ({ useIsFocused: jest.fn() }));

// A sheet can cover a still-mounted map preview. Only the visible route may consume
// Back, even if the map remains pending for the whole time the sheet is open.
it('releases Back on blur and handles the current callback when the route regains focus', async () => {
  const focus = jest.mocked(useIsFocused);
  const remove = jest.fn();
  const subscribe = jest.spyOn(BackHandler, 'addEventListener').mockReturnValue({ remove });
  const closePreview = jest.fn();
  try {
    focus.mockReturnValue(false);
    const hook = await renderHook((close: () => void) => usePendingBack(true, close), { initialProps: closePreview });
    expect(subscribe).not.toHaveBeenCalled();
    focus.mockReturnValue(true);
    await hook.rerender(closePreview);
    const [, back] = first(subscribe.mock.calls, 'focused back listener');
    const closeCurrentPreview = jest.fn();
    await hook.rerender(closeCurrentPreview);
    expect(back({ type: 'hardwareBackPress', timeStamp: 0 })).toBe(true);
    expect(closeCurrentPreview).toHaveBeenCalledTimes(1);
    expect(closePreview).not.toHaveBeenCalled();
    focus.mockReturnValue(false);
    await hook.rerender(closeCurrentPreview);
    expect(remove).toHaveBeenCalledTimes(1);
    focus.mockReturnValue(true);
    await hook.rerender(closeCurrentPreview);
    expect(subscribe).toHaveBeenCalledTimes(2);
    await hook.unmount();
    expect(remove).toHaveBeenCalledTimes(2);
  } finally {
    subscribe.mockRestore();
  }
});
