import { expect, it, jest } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react-native';

import { widgetSnapshot } from './placement';
import { useWidgetPlaced } from './useWidgetPlaced';

jest.mock('./placement', () => ({ widgetSnapshot: jest.fn(), observeWidgetPin: jest.fn() }));

it('reports a placed widget so the prompts can hide', async () => {
  jest.mocked(widgetSnapshot).mockResolvedValue({ present: true, receipts: [] });
  const { result } = await renderHook(() => useWidgetPlaced());
  await waitFor(() => expect(result.current).toBe(true));
});

it('treats an unknown placement as not placed', async () => {
  jest.mocked(widgetSnapshot).mockResolvedValue({ present: null, receipts: [] });
  const { result } = await renderHook(() => useWidgetPlaced());
  await waitFor(() => expect(widgetSnapshot).toHaveBeenCalled());
  expect(result.current).toBe(false);
});
