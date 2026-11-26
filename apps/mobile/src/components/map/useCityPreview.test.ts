import { expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import type { CameraRef } from '@maplibre/maplibre-react-native';
import { useSharedValue } from 'react-native-reanimated';

import { cityCameraTarget } from '@/lib/map/camera-travel';
import type { Camera } from '@/lib/map/projection';
import type { NamedLocation } from '@/lib/settings/types';
import { useCityPreview } from './useCityPreview';

const LUND = { name: 'Lund', latitude: 55.7058, longitude: 13.191 };
const KIRUNA = { name: 'Kiruna', latitude: 67.8557, longitude: 20.225 };
const INITIAL: Camera = { lon: 13, lat: 55.56, zoom: 9.3, width: 411, height: 914 };
const TOP = 110;
const BOTTOM = 155;

async function setup(reduceMotion = false) {
  const native = {
    jumpTo: jest.fn(),
    easeTo: jest.fn(),
    flyTo: jest.fn(),
    fitBounds: jest.fn(),
    zoomTo: jest.fn(),
    setStop: jest.fn<CameraRef['setStop']>(async () => {}),
  } satisfies CameraRef;
  const mounted = await renderHook(() => {
    const camera = useSharedValue(INITIAL);
    return {
      camera,
      ...useCityPreview({ camera, cameraRef: { current: native }, top: TOP, bottom: BOTTOM, reduceMotion }),
    };
  });
  await act(() => mounted.result.current.prepareSearch());
  return { ...mounted, camera: mounted.result.current.camera, native };
}

function target(place: NamedLocation) {
  return cityCameraTarget(INITIAL, { lon: place.longitude, lat: place.latitude, zoom: INITIAL.zoom }, TOP, BOTTOM);
}

it('keeps the previous reading through the flight and restores the view captured before search', async () => {
  const { result, camera, native } = await setup();
  await act(() => result.current.select(LUND));
  expect(native.easeTo).toHaveBeenCalledWith(expect.objectContaining({ duration: 420 }));
  expect(result.current.shown).toBeNull();
  await act(() => result.current.settle(target(LUND), false));
  expect(result.current.shown).toBe(LUND);
  camera.set(target(LUND));
  await act(() => result.current.close());
  expect(result.current.shown).toBe(LUND);
  expect(native.flyTo).toHaveBeenCalledWith(expect.objectContaining({ center: [INITIAL.lon, INITIAL.lat], zoom: INITIAL.zoom }));
  await act(() => result.current.settle(INITIAL, false));
  expect(result.current.shown).toBeNull();
  expect(result.current.returning).toBe(false);
});

it('ignores stale settles and repeated selections when a new search retargets a flight', async () => {
  const { result, native } = await setup();
  await act(() => result.current.select(KIRUNA));
  expect(native.flyTo).toHaveBeenCalledWith(expect.objectContaining({ duration: 1800 }));
  await act(() => result.current.select(KIRUNA));
  expect(native.flyTo).toHaveBeenCalledTimes(1);
  await act(() => result.current.prepareSearch());
  await act(() => result.current.select(LUND));
  await act(() => result.current.settle(target(KIRUNA), false));
  expect(result.current.shown).toBeNull();
  await act(() => result.current.settle(target(LUND), false));
  expect(result.current.shown).toBe(LUND);
});

it('hands the current native position to an interrupting touch', async () => {
  const { result, native } = await setup();
  await act(() => result.current.select(KIRUNA));
  await act(() => result.current.interrupt());
  expect(native.setStop).toHaveBeenCalledWith({ duration: 0, bearing: 0.0001 });
  expect(native.jumpTo).not.toHaveBeenCalled();
  expect(result.current.shown).toBe(KIRUNA);
});

it('jumps and changes the reading immediately with Reduce Motion', async () => {
  const { result, camera, native } = await setup(true);
  await act(() => result.current.select(KIRUNA));
  expect(result.current.shown).toBe(KIRUNA);
  expect(native.jumpTo).toHaveBeenCalledTimes(1);
  expect(native.flyTo).not.toHaveBeenCalled();
  camera.set(target(KIRUNA));
  await act(() => result.current.close());
  expect(native.jumpTo).toHaveBeenLastCalledWith({ center: [INITIAL.lon, INITIAL.lat], zoom: INITIAL.zoom, bearing: 0 });
  expect(result.current.shown).toBeNull();
});
