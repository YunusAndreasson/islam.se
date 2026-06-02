// App-wide settings state, hydrated from AsyncStorage on mount and persisted on
// every change. All tabs read/write through useSettings() so the (future)
// Bönetider screen and the Inställningar screen share one source of truth.
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { setHapticsEnabled } from '../haptics';
import { loadSettings, saveSettings } from './store';
import { DEFAULT_SETTINGS, type PrayerSettings } from './types';

interface SettingsContextValue {
  settings: PrayerSettings;
  /** True once persisted settings have been read — guards against flashing defaults. */
  loaded: boolean;
  /** Shallow-merge a patch into settings and persist the result. */
  update: (patch: Partial<PrayerSettings>) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PrayerSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  // Hydrate persisted settings once on mount.
  useEffect(() => {
    let active = true;
    loadSettings()
      .then((loadedSettings) => {
        if (!active) return;
        setSettings(loadedSettings);
        setLoaded(true);
      })
      .catch(() => {
        // Unreadable/corrupt storage: unblock with DEFAULT_SETTINGS rather than
        // leaving the app stuck on the unhydrated loading state forever.
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  // Keep the haptics wrapper's module flag in lockstep with the preference. The
  // helpers are called from gesture worklets / non-component code where context
  // isn't reachable, so the value is pushed to them here instead. Runs on mount
  // (default on) and re-runs after hydration and on every toggle.
  useEffect(() => {
    setHapticsEnabled(settings.haptics);
  }, [settings.haptics]);

  // Persist on every change after hydration. Trailing the in-memory state (which
  // is the UI's truth) keeps update() a pure functional setState — the merge sees
  // the latest value even across batched updates, with no ref bookkeeping.
  useEffect(() => {
    if (!loaded) return;
    void saveSettings(settings);
  }, [settings, loaded]);

  const update = useCallback((patch: Partial<PrayerSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, loaded, update }),
    [settings, loaded, update],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
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
