import {
  Camera,
  type CameraRef,
  Map,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import { useCallback, useRef } from 'react';
import { type NativeSyntheticEvent, StyleSheet, View } from 'react-native';

// Sweden bounding box, flat [west, south, east, north] (MapLibre GL JS style).
const WEST = 10.6;
const SOUTH = 55.0;
const EAST = 24.2;
const NORTH = 69.2;
const SWEDEN_BOUNDS: [number, number, number, number] = [WEST, SOUTH, EAST, NORTH];
// Stop correcting once the visible region is within this much (degrees) of the
// target — avoids endless micro-adjustments from Mercator latitude rounding.
const EPSILON = 0.02;

const POSITRON_STYLE = 'https://tiles.openfreemap.org/styles/positron';

// How far to shift one axis so the visible span [vMin, vMax] sits inside the
// allowed span [min, max]. If the view is wider than the bound, centre on it.
function axisShift(vMin: number, vMax: number, min: number, max: number) {
  if (vMax - vMin >= max - min) return (min + max) / 2 - (vMin + vMax) / 2;
  if (vMin < min) return min - vMin;
  if (vMax > max) return max - vMax;
  return 0;
}

export default function Bonetider() {
  const cameraRef = useRef<CameraRef>(null);
  // The zoom that frames Sweden, captured from the first settled fit so it
  // adapts to the device. The user can't zoom out past it; zoom-in is free.
  const floorZoom = useRef<number | undefined>(undefined);

  // The native maxBounds / minZoom camera props don't constrain on this
  // MapLibre build, so we keep the view on Sweden in JS: after each settled
  // pan/zoom, ease the camera back so the visible region stays within the
  // country and never zooms out past the framing level.
  const onRegionDidChange = useCallback(
    (e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
      const { center, zoom, bounds } = e.nativeEvent;
      // Wait for the initial bounds-fit before enforcing — the map emits a
      // pre-fit default at world zoom (~0.6) we must not act on.
      if (floorZoom.current === undefined) {
        if (zoom > 1) floorZoom.current = zoom;
        return;
      }
      const [west, south, east, north] = bounds;
      const dx = axisShift(west, east, WEST, EAST);
      const dy = axisShift(south, north, SOUTH, NORTH);
      const targetZoom = Math.max(zoom, floorZoom.current);
      if (
        Math.abs(dx) > EPSILON ||
        Math.abs(dy) > EPSILON ||
        targetZoom - zoom > 0.001
      ) {
        cameraRef.current?.easeTo({
          center: [center[0] + dx, center[1] + dy],
          zoom: targetZoom,
          duration: 200,
        });
      }
    },
    [],
  );

  return (
    <View style={styles.container}>
      <Map
        testID="sweden-map"
        style={StyleSheet.absoluteFill}
        mapStyle={POSITRON_STYLE}
        attribution
        compass={false}
        onRegionDidChange={onRegionDidChange}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{
            bounds: SWEDEN_BOUNDS,
            padding: { top: 24, right: 24, bottom: 24, left: 24 },
          }}
        />
      </Map>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
