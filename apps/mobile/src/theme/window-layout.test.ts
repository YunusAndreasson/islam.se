import { expect, it, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';
import { useWindowDimensions } from 'react-native';

import { useCardInsets, useReadingColumn } from './window-layout';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true, default: jest.fn(),
}));

it('keeps phone gutters and centres the dock and text after unfolding or resizing', async () => {
  const dimensions = jest.mocked(useWindowDimensions);
  dimensions.mockReturnValue({ width: 390, height: 800, fontScale: 2, scale: 2 });
  const hook = await renderHook(() => ({ card: useCardInsets(12), text: useReadingColumn() }));
  expect(hook.result.current).toEqual({ card: { left: 12, right: 12 }, text: undefined });
  dimensions.mockReturnValue({ width: 1000, height: 600, fontScale: 2, scale: 2 });
  await hook.rerender(undefined);
  expect(hook.result.current.card).toEqual({ left: 200, right: 200 });
  expect(hook.result.current.text).toMatchObject({ alignSelf: 'center', maxWidth: 600 });
});
