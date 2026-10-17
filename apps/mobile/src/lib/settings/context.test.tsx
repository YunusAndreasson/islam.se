import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { storage } from '@/lib/storage';
import { SettingsProvider, useSettings } from './context';
import { DEFAULT_SETTINGS } from './types';

let foreground: ((state: AppStateStatus) => void) | undefined;
beforeEach(() => {
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    foreground = listener;
    return { remove: jest.fn() };
  });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { jest.restoreAllMocks(); });

const mount = () => renderHook(() => useSettings(), { wrapper: SettingsProvider });

describe('settings persistence recovery', () => {
  it('does not write defaults after a read failure and merges pending edits on recovery', async () => {
    const stored = { ...DEFAULT_SETTINGS, madhab: 'hanafi' as const };
    jest.spyOn(storage, 'getItem').mockRejectedValueOnce(new Error('disk busy'))
      .mockResolvedValue(JSON.stringify(stored));
    const save = jest.spyOn(storage, 'setItem').mockResolvedValue();
    const { result } = await mount();
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(save).not.toHaveBeenCalled();
    await act(() => result.current.update({ theme: 'dark' }));
    expect(save).not.toHaveBeenCalled();
    await act(() => foreground?.('active'));
    await waitFor(() => expect(result.current.settings.madhab).toBe('hanafi'));
    expect(result.current.settings.theme).toBe('dark');
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(JSON.parse(save.mock.calls[0]![1])).toEqual({ ...stored, theme: 'dark' });
  });

  it('does not rewrite successfully hydrated preferences until the user edits', async () => {
    jest.spyOn(storage, 'getItem').mockResolvedValue(JSON.stringify(DEFAULT_SETTINGS));
    const save = jest.spyOn(storage, 'setItem').mockResolvedValue();
    const { result } = await mount();
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(save).not.toHaveBeenCalled();
    await act(() => result.current.update({ madhab: 'hanafi' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  });

  it('retries a failed save on foreground without an unhandled rejection', async () => {
    jest.spyOn(storage, 'getItem').mockResolvedValue(null);
    const save = jest.spyOn(storage, 'setItem').mockRejectedValueOnce(new Error('disk busy'))
      .mockResolvedValue();
    const { result } = await mount();
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(() => result.current.update({ theme: 'dark' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    await act(() => foreground?.('active'));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(JSON.parse(save.mock.calls[1]![1]).theme).toBe('dark');
  });

  it('serializes writes so a slow old save cannot replace a newer edit', async () => {
    jest.spyOn(storage, 'getItem').mockResolvedValue(null);
    let finish: (() => void) | undefined;
    const save = jest.spyOn(storage, 'setItem').mockImplementationOnce(
      () => new Promise<void>((resolve) => { finish = resolve; }),
    ).mockResolvedValue();
    const { result } = await mount();
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(() => result.current.update({ theme: 'dark' }));
    await act(() => result.current.update({ madhab: 'hanafi' }));
    expect(save).toHaveBeenCalledTimes(1);
    await act(() => finish?.());
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(JSON.parse(save.mock.calls[1]![1]).madhab).toBe('hanafi');
  });
});
