import { useEffect, useEffectEvent, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { widgetSnapshot } from '@/widget/placement';
import { useLocation } from '../location/context';
import { getExactAlarmState, readPrayerEvidence, syncPrayerNotifications } from '../notifications';
import { useSettings } from '../settings/context';
import { notificationSignature } from '../settings/compute-signature';
import { onSetupAssignment } from './first-open';
import { onScheduleVerified, recordSetup, type SetupInput } from './return-setup';

// Reserve write order at the lifecycle edge: a slower exit read cannot overwrite
// the following resume. Each observation captures its own settings and clock.
export function useReturnSetup() {
  const { settings, settingsReady } = useSettings();
  const { coords } = useLocation();
  const pending = useRef(Promise.resolve());
  const started = useRef(false);
  const lifecycle = useRef(0);
  const key = JSON.stringify([notificationSignature(settings), coords, settings.manualLocation]);
  const sample = useEffectEvent((reason: SetupInput['reason'], returned = false) => {
    if (!settingsReady) return;
    const foreground = AppState.currentState === 'active';
    if (!foreground && reason !== 'background') return;
    const edge = Date.now();
    const generation = lifecycle.current;
    const sync = reason === 'reconcile' || returned ? syncPrayerNotifications(coords, settings) : Promise.resolve();
    const result = Promise.all([sync.then(() => readPrayerEvidence(coords, settings)), widgetSnapshot(), getExactAlarmState()])
      .then(([prayer, widget, alarm]): SetupInput => {
        // A scheduler read can cross the cutoff or return after another lifecycle
        // edge. Only evidence obtained during this visit can describe its exit.
        const superseded = generation !== lifecycle.current;
        return { at: superseded ? edge : Date.now(), reason, foreground, returned, origin: 'other',
          prayer: superseded ? { auth: 'unknown', pending: 'unknown', alerts: [] } : prayer,
          widget: superseded ? { present: null, receipts: widget.receipts } : widget,
          exact: Platform.OS === 'ios' ? 'not_applicable' : alarm === 'granted' ? 'allowed' : alarm };
      }).catch(() => null);
    pending.current = pending.current.then(async () => {
      const observation = await result;
      // recordSetup queues the durable write immediately. The following edge
      // must be allowed to queue while its predecessor waits for ingestion.
      if (observation) void recordSetup(observation);
    }).catch(() => undefined);
  });
  useEffect(() => {
    if (!settingsReady) return;
    let seenActive = false;
    function observe(state: string | null | undefined) {
      if (state === 'active') {
        lifecycle.current++;
        seenActive = true;
        sample('resume', true);
      } else if (state === 'background' && seenActive) {
        lifecycle.current++;
        seenActive = false;
        sample('background');
      }
    }
    const cancel = onSetupAssignment(() => {
      if (started.current) return;
      started.current = true;
      observe(AppState.currentState);
    });
    const stopListening = onScheduleVerified(() => { if (started.current) sample('reconcile'); });
    const sub = AppState.addEventListener('change', s => { if (started.current) observe(s); });
    const timer = setInterval(() => { if (started.current && seenActive) sample('resume'); }, 60_000);
    return () => { cancel(); stopListening(); started.current = false; sub.remove(); clearInterval(timer); };
  }, [settingsReady]);
  useEffect(() => { if (started.current) sample('reconcile'); }, [key]);
}
