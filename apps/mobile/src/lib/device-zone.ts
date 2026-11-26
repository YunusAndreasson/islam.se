// Resolve civil time from the device before any route computes prayer times.
import { requireOptionalNativeModule, type EventSubscription } from 'expo';
import * as Localization from 'expo-localization';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { getDisplayZone, setDisplayZone } from './zone-time';

interface ClockModule {
  addListener(event: 'onClockChanged', listener: () => void): EventSubscription;
}

const clock = requireOptionalNativeModule<ClockModule>('IslamDeviceClock');
const listeners = new Set<() => void>();
let revision = 0;
let unsubscribe: (() => void) | undefined;

export function refreshDisplayZone(): string {
  setDisplayZone(Localization.getCalendars()[0]?.timeZone);
  return getDisplayZone();
}

let lastZone = refreshDisplayZone();

/** Also used by Expo Localization's iOS calendar observer. */
export function updateDeviceClock(force = false) {
  const zone = refreshDisplayZone();
  if (!force && lastZone === zone) return;
  lastZone = zone;
  revision += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    const native = clock?.addListener('onClockChanged', () => updateDeviceClock(true));
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') updateDeviceClock();
    });
    unsubscribe = () => { native?.remove(); appState.remove(); };
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) unsubscribe?.();
  };
}

export function useDeviceClockRevision(): number {
  return useSyncExternalStore(subscribe, () => revision);
}
