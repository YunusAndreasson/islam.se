// A live device-heading subscription, distilled from the Qibla screen so chrome that
// wants to point somewhere — the map's qibla compass button today — can share one
// battery- and permission-safe source. Returns the normalized heading (for a readout),
// a `noCompass` flag for the honest fallback, and an UNWRAPPED rotation shared value so
// a needle eases the short way around (359°→1° is +2°, not −358°) on the UI thread.
//
// Permission is the caller's choice: `request:false` only *checks* (never prompts), for
// passive chrome like the home-screen button — the dedicated Qibla screen is the place
// that owns the prompt (`request:true`). The subscription is gated by `active` (pass the
// screen's focus) so the magnetometer isn't running while the screen is off-screen.
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type SharedValue, useSharedValue, withTiming } from 'react-native-reanimated';

interface Options {
  /** Subscribe only while true (pass `useIsFocused()`); unsubscribes on false/unmount. */
  active: boolean;
  /** true → prompt for permission (explicit-intent screens); false → check only, never prompt. */
  request: boolean;
}

interface Heading {
  /** Normalized 0–360 heading, or null until the first event arrives. */
  heading: number | null;
  /** No sensor / permission denied / no event within 2.5 s — show the static fallback. */
  noCompass: boolean;
  /** Continuous, unwrapped heading (deg), smoothed; rotate a needle by this on the UI thread. */
  rotation: SharedValue<number>;
}

export function useHeading({ active, request }: Options): Heading {
  const [heading, setHeading] = useState<number | null>(null);
  const [noCompass, setNoCompass] = useState(false);
  const rotation = useSharedValue(0);
  const lastRaw = useRef(0);
  const unwrapped = useRef(0);

  const onHeading = useCallback(
    (raw: number) => {
      const norm = ((raw % 360) + 360) % 360;
      // Unwrap so the needle takes the short path across the 0/360 seam.
      const delta = ((norm - lastRaw.current + 540) % 360) - 180;
      unwrapped.current += delta;
      lastRaw.current = norm;
      // Idiomatic reanimated: drive the shared value from JS. The compiler's
      // immutability rule can't see a SharedValue is meant to be mutated.
      // eslint-disable-next-line react-hooks/immutability
      rotation.value = withTiming(unwrapped.current, { duration: 110 });
      setHeading(norm);
      setNoCompass((v) => (v ? false : v));
    },
    [rotation],
  );

  useEffect(() => {
    if (!active) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    let gotEvent = false;
    const timer = setTimeout(() => {
      if (!gotEvent) setNoCompass(true);
    }, 2500);

    // Errors handled inside; `void` marks the IIFE as intentionally floating.
    void (async () => {
      try {
        // Heading needs the foreground location permission on both platforms. Passive
        // chrome only *checks* (getForegroundPermissionsAsync) so the home screen never
        // throws a prompt; the Qibla screen, opened on purpose, requests it.
        const perm = request
          ? await Location.requestForegroundPermissionsAsync()
          : await Location.getForegroundPermissionsAsync();
        if (cancelled) return;
        if (!perm.granted) {
          setNoCompass(true);
          return;
        }
        const s = await Location.watchHeadingAsync((h) => {
          const raw = h.trueHeading != null && h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
          if (raw == null || Number.isNaN(raw)) return;
          gotEvent = true;
          onHeading(raw);
        });
        if (cancelled) s.remove();
        else sub = s;
      } catch {
        setNoCompass(true);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      sub?.remove();
    };
  }, [active, request, onHeading]);

  return { heading, noCompass, rotation };
}
