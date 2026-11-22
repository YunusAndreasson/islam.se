import { expect, it, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';
import { useWindowDimensions } from 'react-native';

import { space } from '@/theme/tokens';
import { NAV_SIDE_INSET, useNavMetrics } from './metrics';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true, default: jest.fn(),
}));

it.each([320, 360, 411])('fits all five map controls at 200%% text on a %i dp screen', async (width) => {
  jest.mocked(useWindowDimensions).mockReturnValue({ width, height: 800, scale: 3, fontScale: 2 });
  const { result } = await renderHook(useNavMetrics);
  const { disc } = result.current;
  expect(disc).toBeGreaterThanOrEqual(44);
  expect(5 * disc + 4 * space.sm + 2 * NAV_SIDE_INSET).toBeLessThanOrEqual(width);
});
