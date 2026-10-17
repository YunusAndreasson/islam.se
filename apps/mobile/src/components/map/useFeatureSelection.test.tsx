import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, render } from '@testing-library/react-native';
import type { GeoJSONSourceRef } from '@maplibre/maplibre-react-native';
import { useLayoutEffect } from 'react';

import { useFeatureSelection } from './useFeatureSelection';

const nativeSource = () => ({
  setFeatureState: jest.fn<(feature: { id: string }, state: { selected: boolean }) => Promise<void>>().mockResolvedValue(),
  removeFeatureState: jest.fn<(feature: { id: string }, key: string) => Promise<void>>().mockResolvedValue(),
});

function Selection({ id, revision = 0, source }: {
  id: string | null;
  revision?: number;
  source: ReturnType<typeof nativeSource>;
}) {
  const ref = useFeatureSelection(id, revision);
  useLayoutEffect(() => {
    ref.current = source as unknown as GeoJSONSourceRef;
    return () => { ref.current = null; };
  }, [ref, source]);
  return null;
}

afterEach(() => { jest.restoreAllMocks(); });

describe('native place selection', () => {
  it('moves the ring between features and removes it when the card closes', async () => {
    const source = nativeSource();
    const view = await render(<Selection id={null} source={source} />);
    expect(source.setFeatureState).not.toHaveBeenCalled();
    await view.rerender(<Selection id="a" source={source} />);
    expect(source.setFeatureState).toHaveBeenLastCalledWith({ id: 'a' }, { selected: true });
    await view.rerender(<Selection id="b" source={source} />);
    expect(source.removeFeatureState).toHaveBeenLastCalledWith({ id: 'a' }, 'selected');
    expect(source.setFeatureState).toHaveBeenLastCalledWith({ id: 'b' }, { selected: true });
    await view.rerender(<Selection id={null} source={source} />);
    expect(source.removeFeatureState).toHaveBeenLastCalledWith({ id: 'b' }, 'selected');
    expect(source.setFeatureState).toHaveBeenCalledTimes(2);
  });

  // A slow native write used to be able to leave the old ring lit after dismissal.
  it('clears an in-flight selection and skips superseded queued selections', async () => {
    const source = nativeSource();
    let finish!: () => void;
    source.setFeatureState.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const view = await render(<Selection id="a" source={source} />);
    await view.rerender(<Selection id="b" source={source} />);
    await view.rerender(<Selection id={null} source={source} />);
    await act(async () => { finish(); });
    expect(source.setFeatureState).toHaveBeenCalledTimes(1);
    expect(source.removeFeatureState).toHaveBeenLastCalledWith({ id: 'a' }, 'selected');
  });

  it('reapplies an open card after the native style loses its feature state', async () => {
    const source = nativeSource();
    const view = await render(<Selection id="a" source={source} />);
    source.setFeatureState.mockClear();
    await view.rerender(<Selection id="a" source={source} revision={1} />);
    expect(source.setFeatureState).toHaveBeenCalledWith({ id: 'a' }, { selected: true });
  });

  it('recovers from a source-not-attached rejection on the next style-ready event', async () => {
    const source = nativeSource();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    source.setFeatureState.mockRejectedValueOnce(new Error('source_not_attached'));
    const view = await render(<Selection id="a" source={source} />);
    expect(warn).toHaveBeenCalledTimes(1);
    await view.rerender(<Selection id="a" source={source} revision={1} />);
    expect(source.setFeatureState).toHaveBeenCalledTimes(2);
  });

  it('does not issue a queued write after unmount', async () => {
    const source = nativeSource();
    let finish!: () => void;
    source.setFeatureState.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const view = await render(<Selection id="a" source={source} />);
    await view.rerender(<Selection id="b" source={source} />);
    await view.unmount();
    await act(async () => { finish(); });
    expect(source.setFeatureState).toHaveBeenCalledTimes(1);
    expect(source.removeFeatureState).not.toHaveBeenCalled();
  });
});
