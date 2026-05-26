// Shares the map's current night factor (0 day → 1 deep night) with chrome that
// lives *outside* the map screen — chiefly the global <AppMenu>, mounted once over
// the whole stack. The Bönetider screen already derives this factor from the user's
// location and the (scrubbable) clock instant; it publishes it here so the menu can
// dim into night in lockstep with the dock and the map, instead of floating as a
// bright slab over a dark country. Anything not on the map reads 0 (see AppMenu).
import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';

interface NightContextValue {
  night: number;
  setNight: (n: number) => void;
}

const NightContext = createContext<NightContextValue | null>(null);

export function NightProvider({ children }: { children: ReactNode }) {
  const [night, setNight] = useState(0);
  const value = useMemo(() => ({ night, setNight }), [night]);
  return <NightContext.Provider value={value}>{children}</NightContext.Provider>;
}

/** The published night factor (0 if no provider / not yet set). */
export function useNight(): number {
  return useContext(NightContext)?.night ?? 0;
}

/** Setter for the screen that owns the map; no-op if there's no provider. */
export function useSetNight(): (n: number) => void {
  return useContext(NightContext)?.setNight ?? (() => {});
}
