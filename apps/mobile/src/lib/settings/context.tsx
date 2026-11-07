// App-wide settings state, hydrated from storage on mount and persisted on
// every change. All tabs read/write through useSettings() so the (future)
// Bönetider screen and the Inställningar screen share one source of truth.
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

import { setHapticsEnabled } from '@/lib/haptics';
import { loadSettings, saveSettings } from './store';
import { DEFAULT_SETTINGS, type PrayerSettings } from './types';

interface SettingsContextValue {
  settings: PrayerSettings;
  /** True once the initial read attempt finishes; unavailable storage never blocks the UI. */
  loaded: boolean;
  /** Shallow-merge a patch into settings and persist the result.
   *
   *  Pass a FUNCTION whenever the patch is built from the settings it is replacing —
   *  every nested record (`adjustments`, `notifications`) is, because a shallow merge
   *  means the patch has to carry the whole sub-object. `{ adjustments: { ...settings
   *  .adjustments, fajr: 4 } }` spreads the render's copy, so two writes landing in one
   *  React batch (a burst of stepper taps, a toggle behind an awaited permission dialog)
   *  make the second one silently undo the first. The function form is handed the latest
   *  state instead. */
  update: (patch: SettingsPatch | ((prev: PrayerSettings) => SettingsPatch)) => void;
  /** Restore every setting to the app's defaults (DEFAULT_SETTINGS) and persist. */
  reset: () => void;
}

type SettingsPatch = Partial<PrayerSettings>;

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  // Memoised by hand, and uncompilable as written: hydration releases its queue in
  // `finally`, which the React Compiler cannot lower.
  'use no memo';
  const [settings, setSettings] = useState<PrayerSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  const hydrated = useRef(false);
  const pending = useRef<((previous: PrayerSettings) => PrayerSettings)[]>([]);
  const saved = useRef<PrayerSettings | null>(null);
  const writes = useRef(Promise.resolve());
  const [retry, setRetry] = useState(0);

  // A failed read unlocks the UI, but never authorizes a write of fallback defaults.
  // Retry on foreground and replay edits made while storage was unavailable.
  useEffect(() => {
    let active = true;
    const hydrate = async () => {
      if (hydrated.current) {
        setRetry((value) => value + 1);
        return;
      }
      try {
        const stored = await loadSettings();
        if (!active || hydrated.current) return;
        saved.current = stored;
        hydrated.current = true;
        const recovered = pending.current.reduce((value, edit) => edit(value), stored);
        pending.current = [];
        setSettings(recovered);
      } catch (error) {
        console.warn('Could not read settings; saved preferences are preserved.', error);
      } finally {
        if (active) setLoaded(true);
      }
    };
    void hydrate();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void hydrate();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  // Keep the haptics wrapper's module flag in lockstep with the preference. The
  // helpers are called from gesture worklets / non-component code where context
  // isn't reachable, so the value is pushed to them here instead. Runs on mount
  // (default on) and re-runs after hydration and on every toggle.
  useEffect(() => {
    setHapticsEnabled(settings.haptics);
  }, [settings.haptics]);

  // Serialize writes so a slow older save cannot overwrite a newer edit. Failed
  // saves remain dirty and retry when the app next becomes active.
  useEffect(() => {
    if (!loaded || !hydrated.current || settings === saved.current) return;
    writes.current = writes.current.then(async () => {
      try {
        await saveSettings(settings);
        saved.current = settings;
      } catch (error) {
        console.warn('Could not save settings; will retry on foreground.', error);
      }
    });
  }, [settings, loaded, retry]);

  const edit = useCallback((apply: (previous: PrayerSettings) => PrayerSettings) => {
    if (!hydrated.current) pending.current.push(apply);
    setSettings(apply);
  }, []);

  const update = useCallback((patch: SettingsPatch | ((prev: PrayerSettings) => SettingsPatch)) => {
    edit((prev) => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }));
  }, [edit]);

  // Restore to DEFAULT_SETTINGS, deep-cloning the nested objects so the in-memory
  // state never shares a reference with the exported constant (a later in-place edit
  // would otherwise mutate the default for the whole app). The persist effect writes
  // the cleared settings back to storage like any other change.
  const reset = useCallback(() => {
    edit(() => ({
      ...DEFAULT_SETTINGS,
      adjustments: { ...DEFAULT_SETTINGS.adjustments },
      notifications: {
        ...DEFAULT_SETTINGS.notifications,
        prayers: { ...DEFAULT_SETTINGS.notifications.prayers },
        // `lead` and `sound` are nested records too — a shallow spread of `notifications`
        // would leave both aliasing the exported constant, so one later in-place edit
        // would rewrite the app's defaults for the rest of the process. A value-comparing
        // `toEqual` in settings-reset.test.tsx cannot catch that; the by-reference
        // assertion there can.
        lead: { ...DEFAULT_SETTINGS.notifications.lead },
        sound: { ...DEFAULT_SETTINGS.notifications.sound },
      },
    }));
  }, [edit]);

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, loaded, update, reset }),
    [settings, loaded, update, reset],
  );

  return <SettingsContext value={value}>{children}</SettingsContext>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return ctx;
}

/** Non-throwing variant for hooks (e.g. useActiveScheme) that should still work
 *  when called from a screen outside the provider — most relevantly the
 *  ErrorScreen, which expo-router mounts as an app-wide boundary and which
 *  itself must not crash if the SettingsProvider hasn't initialised yet.
 *  Returns null when there's no provider; callers then fall back to defaults. */
export function useOptionalSettings(): SettingsContextValue | null {
  return useContext(SettingsContext);
}
