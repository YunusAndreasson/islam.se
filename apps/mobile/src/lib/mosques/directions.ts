// Open native turn-by-turn directions to a mosque. Platform default, one tap, no
// dialog: iOS hands off to Apple Maps, Android to Google Maps. The origin is left
// unset so the maps app routes from the device's live location.
//
// House style matches src/lib/about/index.ts: fire-and-forget `void`, every path
// wrapped so a missing maps app can never crash the card — a failed directions tap
// is a no-op, not a red screen. The URL shapes mirror the web's directionsLinks()
// (apps/web/src/lib/moskeer/index.ts).
import { Linking, Platform } from 'react-native';

import type { Mosque } from './index';

/** Try `primary`; if no app can open it, fall back to `fallback`. Never throws. */
async function openFirst(primary: string, fallback?: string): Promise<void> {
  try {
    await Linking.openURL(primary);
  } catch {
    if (!fallback) return;
    try {
      await Linking.openURL(fallback);
    } catch {
      // No maps app and no browser — nothing more we can do. Stay silent.
    }
  }
}

/** Directions destination as "lat,lng" — what every maps URL below wants. */
function dest(m: Mosque): string {
  return `${m.lat},${m.lng}`;
}

/** Open driving directions to the mosque in the platform's native maps app. */
export function openDirections(m: Mosque): void {
  const d = dest(m);
  // Universal Google Maps directions link — opens the Google Maps app when
  // installed, otherwise the maps website. Serves as the cross-platform fallback.
  const googleUniversal = `https://www.google.com/maps/dir/?api=1&destination=${d}`;
  if (Platform.OS === 'ios') {
    // Apple Maps: dirflg=d = driving. https universal link hands off to the app.
    void openFirst(`https://maps.apple.com/?daddr=${d}&dirflg=d`, googleUniversal);
    return;
  }
  // Android: google.navigation: launches Google Maps straight into driving nav;
  // fall back to the universal web link if Google Maps isn't installed.
  void openFirst(`google.navigation:q=${d}`, googleUniversal);
}
