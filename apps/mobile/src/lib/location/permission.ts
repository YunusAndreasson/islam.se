// Reading the foreground-location permission WITHOUT asking for it.
//
// The twin of getNotificationPermissionState in ../notifications, and it exists for the
// same reason: the map's soft-ask card must decide whether to offer itself, and the only
// honest input to that decision is "has the OS been asked yet?". Calling expo-location's
// *request* variant to find out would spend the prompt the card exists to protect.
import * as Location from 'expo-location';

/** 'undetermined' is the only state where the soft-ask has anything to offer: a granted
 *  user needs no card, and a refused one can no longer be prompted from inside the app. */
export type LocationPermissionState = 'granted' | 'denied' | 'undetermined';

/** Maps expo-location's PermissionResponse onto our three states. Exported for tests —
 *  `granted: false` covers BOTH "not asked yet" and "refused", so the status string is
 *  what separates them, and getting that wrong is what makes an app ask twice or never. */
export function toLocationPermissionState(perm: {
  granted: boolean;
  status?: string;
}): LocationPermissionState {
  if (perm.granted) return 'granted';
  return perm.status === 'denied' ? 'denied' : 'undetermined';
}

export async function getLocationPermissionState(): Promise<LocationPermissionState> {
  try {
    return toLocationPermissionState(await Location.getForegroundPermissionsAsync());
  } catch {
    // An unreadable permission resolves to 'denied' deliberately — that is the state
    // that suppresses the card. Offering a button we cannot promise will do anything is
    // worse than staying quiet, and the manual city picker is still one tap away.
    return 'denied';
  }
}
