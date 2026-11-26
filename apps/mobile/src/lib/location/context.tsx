// Resolves the coordinate prayer times are computed for, from the user's location
// settings: an explicit manual city, or the device's GPS position with graceful
// fallbacks (cached fix → Stockholm) so times are always shown, even offline or
// before a permission prompt is answered.
import { requestPrayerLocation } from '@/lib/location/request';
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
import { AppState } from 'react-native';

import type { PermissionSource } from '@/lib/analytics';
import { trackPermissionPrompt, trackPermissionResult } from '@/lib/analytics/permission-events';
import { useFirstRunGpsPolicy } from '@/lib/intro-context';
import { isValidLatLng } from '@/lib/coordinates';
import { acceptedGpsForResume, withinGpsHandoff } from '@/lib/first-run';
import { useSettings } from '@/lib/settings/context';
import type { LatLng } from '@/lib/prayer-times';
import type { SwedishPlace } from '@/lib/places/data';
import { allowsAutomaticGps, keepGpsFallback, readCachedFix, writeCachedFix } from './gps-cache';
import { toLocationPermissionState, type LocationPermissionState } from './permission';
import { type LocationSource, resolveLocation } from './resolve';

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
  permissionStatus: LocationPermissionState;
}

/** Outcome of a refresh() call, so a caller can give the right feedback: `ok` = a fresh fix
 *  landed, `denied` = permission refused with another prompt available,
 *  `blocked` = permission must be changed in Settings, `error` = services off / timeout, `busy` = a fix was
 *  already in flight so this call was a no-op. Lets Inställningar buzz success vs warning
 *  correctly (and stop firing a success haptic on a denied permission). */
export type GpsOutcome = 'ok' | 'denied' | 'blocked' | 'error' | 'busy';

/** The volatile GPS-fetch status, split out of the main value so its frequent flips
 *  (every fix sets locating true→false) don't re-render the map / nav / sync consumers
 *  that only read the resolved coordinate. Only Inställningar consumes this. */
interface LocationStatusValue {
  /** True while a GPS fix is in flight. */
  locating: boolean;
  resumedCandidate: LatLng | null;
  dismissResumedCandidate: () => void;
  /** Re-request permission (if needed) and fetch a fresh GPS fix. Resolves to the outcome so
   *  the caller can pick success vs warning feedback; auto-acquire callers ignore it.
   *  `source` is the surface the tap came from, for the permission events. */
  refresh: (source: PermissionSource, onFix?: (coords: LatLng) => void, candidateOnly?: boolean) => Promise<GpsOutcome>;
  keepFirstRunFallback: () => Promise<void>;
  confirmFirstRunGps: (coords: LatLng) => void;
}

const LocationContext = createContext<LocationContextValue | null>(null);
const LocationStatusContext = createContext<LocationStatusValue | null>(null);

/** The foreground permission, read without asking; null when it cannot be read. */
async function readPermissionQuietly(): Promise<Location.LocationPermissionResponse | null> {
  try {
    return (await Location.getForegroundPermissionsAsync()) ?? null;
  } catch {
    return null;
  }
}

export function LocationProvider({ children }: { children: ReactNode }) {
  // Memoised by hand (every value and callback below), and uncompilable as written: the
  // three fix paths release their guard in `finally`, which the React Compiler cannot lower.
  'use no memo';
  const { settings, loaded } = useSettings();
  const { locationMode, manualLocation } = settings;

  const gpsPolicy = useFirstRunGpsPolicy();
  const [confirmedFix, setConfirmedFix] = useState<LatLng | null>(null);
  const [gpsCoords, setGpsCoords] = useState<LatLng | null>(null);
  const [resumedCandidate, setResumedCandidate] = useState<LatLng | null>(null);
  const resumeGeneration = useRef(0);
  const dismissResumedCandidate = useCallback(() => {
    resumeGeneration.current++;
    setResumedCandidate(null);
  }, []);
  const keepFirstRunFallback = useCallback(async () => {
    dismissResumedCandidate();
    await keepGpsFallback();
    setConfirmedFix(null);
    setGpsCoords(null);
  }, [dismissResumedCandidate]);
  const confirmFirstRunGps = useCallback((fix: LatLng) => {
    dismissResumedCandidate();
    setConfirmedFix(fix);
    setGpsCoords(fix);
    writeCachedFix(fix);
  }, [dismissResumedCandidate]);
  const [permissionStatus, setPermissionStatus] = useState<LocationPermissionState>('undetermined');
  const [locating, setLocating] = useState(false);
  // Guards against overlapping fixes (e.g. mount effect + a manual refresh).
  const inFlight = useRef(false);

  // The fix itself, once permission is known to be granted. Shared by both entry
  // points below so the prompting and non-prompting paths can never drift.
  const fetchFix = useCallback(async (mayShowUserSettingsDialog: boolean, onFix?: (coords: LatLng) => void, candidateOnly?: boolean): Promise<GpsOutcome> => {
    setLocating(true);
    let expired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<GpsOutcome>((resolve) => {
        timer = setTimeout(() => {
          expired = true;
          resolve('error');
        }, 20_000);
      });
      const acquire = async (): Promise<GpsOutcome> => {
        // Only show a recent, city-level preview while obtaining the fresh fix.
        const last = await Location.getLastKnownPositionAsync({
          maxAge: 5 * 60_000,
          requiredAccuracy: 1_000,
        }).catch(() => null);
        if (expired) return 'error';
        const lastCoords = last
          ? { latitude: last.coords.latitude, longitude: last.coords.longitude }
          : null;
        if (!candidateOnly && isValidLatLng(lastCoords)) setGpsCoords(lastCoords);

        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.LocationAccuracy.Balanced,
          mayShowUserSettingsDialog,
        });
        // Native one-shot requests cannot be cancelled. Never let a timed-out
        // request replace coordinates obtained by a later refresh.
        if (expired) return 'error';
        const next = { latitude: current.coords.latitude, longitude: current.coords.longitude };
        const accuracy = current.coords.accuracy;
        if (!isValidLatLng(next) || (accuracy != null && (!Number.isFinite(accuracy) || accuracy < 0))) return 'error';
        onFix?.(next);
        if (!candidateOnly) {
          setGpsCoords(next);
          writeCachedFix(next);
        }
        return 'ok';
      };
      return await Promise.race([acquire(), timeout]);
    } catch {
      return 'error';
    } finally {
      expired = true;
      clearTimeout(timer);
      setLocating(false);
    }
  }, []);

  /** Prompts. Call ONLY from an explicit gesture — Inställningar's "Uppdatera plats"
   *  row, the introduction's location step, or the map's location soft-ask card. See
   *  acquireIfPermitted for why. */
  const acquireGps = useCallback(async (source: PermissionSource, onFix?: (coords: LatLng) => void, candidateOnly?: boolean): Promise<GpsOutcome> => {
    if (inFlight.current) return 'busy';
    inFlight.current = true;
    try {
      // Read first, without asking, only to know whether the request below will put the OS
      // dialog on screen: an answered permission (granted, or refused for good) comes back
      // without one, and Permission Prompt Shown must mean the dialog really appeared. A
      // failed read just means not knowing; the request still decides.
      if (candidateOnly && gpsPolicy === 'explicit') await keepFirstRunFallback();
      const before = await readPermissionQuietly();
      const prompted = before !== null && !before.granted && before.canAskAgain !== false;
      if (prompted) trackPermissionPrompt('location', source);
      // Await the permission first so no state is set synchronously inside the
      // effect that calls this (keeps the effect side-effect-free on entry).
      const perm = await requestPrayerLocation();
      trackPermissionResult('location', source, perm.granted, prompted);
      setPermissionStatus(perm.granted ? 'granted' : 'denied');
      if (!perm.granted) return perm.canAskAgain === false ? 'blocked' : 'denied';
      return await fetchFix(true, onFix, candidateOnly);
    } catch {
      return 'error';
    } finally {
      inFlight.current = false;
    }
  }, [fetchFix, gpsPolicy, keepFirstRunFallback]);

  /** Reads the permission WITHOUT prompting and fetches a fix only if it is already
   *  granted. This is what the mount effect calls.
   *
   *  It used to call acquireGps, which meant the OS location dialog fired from a mount
   *  effect: on a first launch it landed on top of the daybreak intro, asking about a
   *  screen the user had not seen yet, and a reflexive "Don't allow" is permanent. The
   *  map now offers a soft-ask card instead (components/map/LocationHint), whose button
   *  is the one thing in the app that prompts. Until then the cached fix and the
   *  Stockholm fallback already keep times on screen, so nothing is blank meanwhile. */
  const acquireIfPermitted = useCallback(async (isCurrent: () => boolean): Promise<void> => {
    if (inFlight.current) return;
    inFlight.current = true;
    const generation = resumeGeneration.current;
    try {
      if (!await allowsAutomaticGps()) return;
      const perm = await Location.getForegroundPermissionsAsync();
      // `granted: false` covers BOTH "not asked yet" and "refused", and conflating them
      // would make the map show a denied-state card to someone who was never asked.
      setPermissionStatus(toLocationPermissionState(perm));
      if (!perm.granted) return;
      // Returning from Android's accuracy settings also triggers this refresh.
      // Only a reader-initiated lookup may open that system dialog.
      if (gpsPolicy === 'fresh') {
        const accepted = await acceptedGpsForResume();
        await fetchFix(false, fix => {
          if (!isCurrent() || generation !== resumeGeneration.current) return;
          if (withinGpsHandoff(accepted, fix)) confirmFirstRunGps(fix);
          else setResumedCandidate(fix);
        }, true);
      } else await fetchFix(false);
    } catch {
      // An unreadable permission is not worth surfacing: the fallback already applies.
    } finally {
      inFlight.current = false;
    }
  }, [confirmFirstRunGps, fetchFix, gpsPolicy]);

  // Seed from the cached fix on mount so GPS mode shows times before a new fix.
  useEffect(() => {
    let active = true;
    void readCachedFix().then((cached) => {
      if (active && cached) setGpsCoords((prev) => prev ?? cached);
    });
    return () => {
      active = false;
    };
  }, []);

  // Fetch a fix whenever GPS mode is active AND permission is already granted, including
  // when the app returns from system settings. This is
  // the allowed "subscribe to an external system" effect — acquireIfPermitted only
  // setStates inside async callbacks after awaiting the platform APIs, which the rule's
  // static analysis can't see. It never prompts: see acquireIfPermitted.
  useEffect(() => {
    if (!loaded || locationMode !== 'gps' || gpsPolicy === 'explicit') return;
    let current = true;
    const isCurrent = () => current;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async GPS fetch, no synchronous setState
    void acquireIfPermitted(isCurrent);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void acquireIfPermitted(isCurrent);
    });
    return () => { current = false; sub.remove(); };
  }, [loaded, locationMode, gpsPolicy, acquireIfPermitted]);

  // Single source of truth for the manual → GPS → Stockholm resolution, shared with
  // the home-screen widget's timeline builder via ./resolve so the two never drift.
  const readingCoords = gpsPolicy === 'normal' ? gpsCoords : confirmedFix;
  const resolved = useMemo(
    () => resolveLocation(locationMode, manualLocation, readingCoords),
    [locationMode, manualLocation, readingCoords],
  );

  const value = useMemo<LocationContextValue>(
    () => ({ ...resolved, permissionStatus }),
    [resolved, permissionStatus],
  );

  const status = useMemo<LocationStatusValue>(
    () => ({ locating, refresh: acquireGps, confirmFirstRunGps, keepFirstRunFallback, resumedCandidate, dismissResumedCandidate }),
    [locating, acquireGps, confirmFirstRunGps, keepFirstRunFallback, resumedCandidate, dismissResumedCandidate],
  );

  return (
    <LocationContext value={value}>
      <LocationStatusContext value={status}>{children}</LocationStatusContext>
    </LocationContext>
  );
}

export function useLocation(): LocationContextValue {
  const ctx = useContext(LocationContext);
  if (!ctx) {
    throw new Error('useLocation must be used within a LocationProvider');
  }
  return ctx;
}

/** The GPS-fetch status + refresh action, in its own context so its frequent flips
 *  don't re-render the resolved-coordinate consumers. Used by Inställningar. */
export function useLocationStatus(): LocationStatusValue {
  const ctx = useContext(LocationStatusContext);
  if (!ctx) {
    throw new Error('useLocationStatus must be used within a LocationProvider');
  }
  return ctx;
}
