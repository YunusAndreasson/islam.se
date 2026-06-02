// Resolves the coordinate prayer times are computed for, from the user's location
// settings: an explicit manual city, or the device's GPS position with graceful
// fallbacks (cached fix → Stockholm) so times are always shown, even offline or
// before a permission prompt is answered.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useSettings } from '../settings/context';
import type { LatLng } from '../prayer-times';
import type { SwedishPlace } from '../places/data';
import { type LocationSource, resolveLocation } from './resolve';

const GPS_CACHE_KEY = 'lastGpsCoords:v1';

type PermissionStatus = 'undetermined' | 'granted' | 'denied';

interface LocationContextValue {
  /** The coordinate to compute prayer times for, given current settings. */
  coords: LatLng;
  /** A human label for `coords` (city name in manual mode, the snapped place
   *  in GPS mode, "Stockholm (standard)" while no fix is in). */
  label: string;
  /** Where `coords` came from — drives the Inställningar status line. */
  source: LocationSource;
  /** The Swedish tätort `coords` snaps to (nearestPlace in GPS, the picked
   *  place in manual, the fallback in default). Drives the map marker label. */
  place: SwedishPlace | null;
  permissionStatus: PermissionStatus;
  /** True while a GPS fix is in flight. */
  locating: boolean;
  /** Re-request permission (if needed) and fetch a fresh GPS fix. */
  refresh: () => Promise<void>;
}

const LocationContext = createContext<LocationContextValue | null>(null);

export function LocationProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const { locationMode, manualLocation } = settings;

  const [gpsCoords, setGpsCoords] = useState<LatLng | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('undetermined');
  const [locating, setLocating] = useState(false);
  // Guards against overlapping fixes (e.g. mount effect + a manual refresh).
  const inFlight = useRef(false);

  const acquireGps = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      // Await the permission first so no state is set synchronously inside the
      // mount effect that calls this (keeps the effect side-effect-free on entry).
      const perm = await Location.requestForegroundPermissionsAsync();
      setPermissionStatus(perm.granted ? 'granted' : 'denied');
      if (!perm.granted) return;
      setLocating(true);

      // Last-known is instant; current is authoritative. Use last-known first so
      // the UI updates immediately, then upgrade to the fresh fix.
      const last = await Location.getLastKnownPositionAsync();
      if (last) setGpsCoords({ latitude: last.coords.latitude, longitude: last.coords.longitude });

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.LocationAccuracy.Balanced,
      });
      const next = { latitude: current.coords.latitude, longitude: current.coords.longitude };
      setGpsCoords(next);
      void AsyncStorage.setItem(GPS_CACHE_KEY, JSON.stringify(next));
    } catch {
      // Services off / timeout: keep whatever we have (cached or default).
    } finally {
      inFlight.current = false;
      setLocating(false);
    }
  }, []);

  // Seed from the cached fix on mount so GPS mode shows times before a new fix.
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(GPS_CACHE_KEY)
      .then((raw) => {
        if (!active || !raw) return;
        try {
          setGpsCoords((prev) => prev ?? (JSON.parse(raw) as LatLng));
        } catch {
          // ignore corrupt cache
        }
      })
      .catch(() => {
        // ignore unreadable cache; a fresh fix will repopulate it
      });
    return () => {
      active = false;
    };
  }, []);

  // Fetch a fix whenever GPS mode is active. This is the allowed "subscribe to an
  // external system" effect — acquireGps only setStates inside async callbacks
  // after awaiting the platform APIs, which the rule's static analysis can't see.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async GPS fetch, no synchronous setState
    if (locationMode === 'gps') void acquireGps();
  }, [locationMode, acquireGps]);

  // Single source of truth for the manual → GPS → Stockholm resolution, shared with
  // the home-screen widget's timeline builder via ./resolve so the two never drift.
  const resolved = useMemo(
    () => resolveLocation(locationMode, manualLocation, gpsCoords),
    [locationMode, manualLocation, gpsCoords],
  );

  const value = useMemo<LocationContextValue>(
    () => ({ ...resolved, permissionStatus, locating, refresh: acquireGps }),
    [resolved, permissionStatus, locating, acquireGps],
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation(): LocationContextValue {
  const ctx = useContext(LocationContext);
  if (!ctx) {
    throw new Error('useLocation must be used within a LocationProvider');
  }
  return ctx;
}
