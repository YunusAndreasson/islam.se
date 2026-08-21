// Where the app learns which clock its reader is actually on.
//
// The zone itself lives in ./zone-time (a pure module, deliberately free of native
// imports so the whole calendar core stays testable without a device). This is the thin
// native edge that feeds it: expo-localization reads the handset's own zone, and the hook
// re-reads it on every return to the foreground.
//
// ⚠️ RE-READING MATTERS AS MUCH AS READING. A phone changes zone mid-life — the reader
// lands in Jeddah and the OS moves the clock while the app sits backgrounded. Resolving
// once at process start would mean the app only got it right after a force-quit, which is
// exactly the kind of "works on my desk" correctness this app tries not to ship.
import * as Localization from 'expo-localization';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { getDisplayZone, setDisplayZone } from './zone-time';

/** The device's IANA zone, or undefined if the platform declines to say. */
function deviceZone(): string | undefined {
  return Localization.getCalendars()[0]?.timeZone ?? undefined;
}

// Module scope, not an effect: `zoneParts` and friends are called during the first
// render (the splash gate's screen choice, the solar clock's initial day anchor), so the
// zone has to be in force before React runs, not after its first commit.
setDisplayZone(deviceZone());

/**
 * The zone in force, re-resolved on every foreground.
 *
 * Returned as state so a consumer can fold it into a sync key — a zone change invalidates
 * a scheduled notification window and a widget timeline just as surely as a settings
 * change does, because both are split into days by it.
 *
 * The visible screens need no such wiring, but not for the reason it first appears. The
 * solar clock's tick re-anchors `now`/`dayStart` only while LIVE — a scrubbed view would
 * never have picked the new zone up at all — so useSolarClock watches the zone itself and
 * re-anchors BOTH of its midnights together, in every mode, the first tick after it changes.
 * See the `anchorZone` note there for what breaks when the two disagree. The practical
 * consequence here is a lag of up to one 30 s tick before the map, the dock and the prayer
 * rows show the new zone; nothing is ever shown in a mixture of the two.
 */
export function useDisplayZone(): string {
  const [zone, setZone] = useState(getDisplayZone);

  useEffect(() => {
    const apply = () => {
      setDisplayZone(deviceZone());
      // A no-op re-render when the zone is unchanged, which is every launch but the one
      // that matters.
      setZone(getDisplayZone());
    };
    apply();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') apply();
    });
    return () => sub.remove();
  }, []);

  return zone;
}
