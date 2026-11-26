import type { CameraRef } from '@maplibre/maplibre-react-native';
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { SharedValue } from 'react-native-reanimated';

import { cityCameraTarget, cityFlightMs, cityIsInView, reachedCameraTarget } from '@/lib/map/camera-travel';
import type { Camera } from '@/lib/map/projection';
import type { NamedLocation } from '@/lib/settings/types';

const CITY_ZOOM = 9.3;
const VISIBLE_CITY_MS = 420;
const SETTLE_GRACE_MS = 220;
const STOP_BEARING = 0.0001;

type Flight = {
  target: Camera;
  place: NamedLocation | null;
  timer: ReturnType<typeof setTimeout>;
};

export function useCityPreview({
  camera, cameraRef, top, bottom, reduceMotion,
}: {
  camera: SharedValue<Camera>;
  cameraRef: RefObject<CameraRef | null>;
  top: number;
  bottom: number;
  reduceMotion: boolean;
}) {
  const [destination, setDestination] = useState<NamedLocation | null>(null);
  const [shown, setShown] = useState<NamedLocation | null>(null);
  const [returning, setReturning] = useState(false);
  const [hasPreviewed, setHasPreviewed] = useState(false);
  const origin = useRef<Camera | null>(null);
  const beforeSearch = useRef<Camera | null>(null);
  const flight = useRef<Flight | null>(null);

  useEffect(() => () => {
    if (flight.current) clearTimeout(flight.current.timer);
  }, []);

  function finish(current: Flight) {
    if (flight.current !== current) return;
    clearTimeout(current.timer);
    flight.current = null;
    setShown(current.place);
    if (!current.place) {
      origin.current = null;
      setReturning(false);
    }
  }

  function move(place: NamedLocation | null, from: Camera, target: Camera, visible: boolean, instant = reduceMotion) {
    if (flight.current) clearTimeout(flight.current.timer);
    const native = cameraRef.current;
    const duration = !native || instant || reachedCameraTarget(from, target)
      ? 0 : visible ? VISIBLE_CITY_MS : cityFlightMs(from, target);
    const current: Flight = {
      target,
      place,
      // A constrained or unavailable basemap can omit a settle or land slightly
      // off target. Prayer times use local data and still need to appear.
      timer: setTimeout(() => finish(current), duration + SETTLE_GRACE_MS),
    };
    flight.current = current;

    const options = { center: [target.lon, target.lat] as [number, number], zoom: target.zoom, bearing: 0 };
    if (duration === 0) {
      native?.jumpTo(options);
      // Keep the flight registered through the native settle, including jumps
      // that omit region events. The reading itself can update immediately.
      setShown(place);
    } else if (visible) {
      native?.easeTo({ ...options, duration });
    } else {
      native?.flyTo({ ...options, duration });
    }
  }

  function prepareSearch() {
    beforeSearch.current = origin.current ?? camera.get();
  }

  function select(place: NamedLocation) {
    if (destination?.name === place.name && destination.latitude === place.latitude &&
        destination.longitude === place.longitude) return false;
    const from = camera.get();
    if (!origin.current) origin.current = beforeSearch.current ?? from;
    const city = { lon: place.longitude, lat: place.latitude, zoom: Math.max(CITY_ZOOM, from.zoom) };
    const visible = cityIsInView(from, city, top, bottom);
    // Preserve street detail for a nearby result, but use one regional scale to
    // orient the reader when crossing between distant cities.
    if (!visible) city.zoom = CITY_ZOOM;
    setHasPreviewed(true);
    setReturning(false);
    setDestination(place);
    move(place, from, cityCameraTarget(from, city, top, bottom), visible);
    return true;
  }

  function close(instant = reduceMotion) {
    const target = origin.current;
    if (!target || (returning && !instant)) return;
    const from = camera.get();
    setDestination(null);
    setReturning(true);
    move(null, from, { ...from, lon: target.lon, lat: target.lat, zoom: target.zoom },
      reachedCameraTarget({ ...from, zoom: target.zoom }, target), instant);
  }

  function settle(frame: Camera, userInteraction: boolean) {
    const current = flight.current;
    if (current && (userInteraction || reachedCameraTarget(frame, current.target))) finish(current);
    // Preview camera settles must never teach the ordinary reset or lean a new home.
    return current !== null || origin.current !== null;
  }

  function interrupt() {
    const current = flight.current;
    if (!current) return false;
    // Android skips a camera update identical to its current pose before it
    // cancels the flight. A subpixel bearing change makes this update reach the
    // cancellation path while the native camera keeps its current centre and zoom.
    void cameraRef.current?.setStop({ duration: 0, bearing: STOP_BEARING }).catch(() => {});
    finish(current);
    return current.place === null;
  }

  return { destination, shown, returning, hasPreviewed, prepareSearch, select, close, settle, interrupt };
}
