// The sky-tinted card colour, shared by every surface floating on the live map.
//
// A context rather than a prop, for the reason the value exists at all: the dock, the four
// nav discs and the map's floating cards must all paint from ONE number or they drift apart
// (see the note in lib/solar/sky-chrome.ts about the discs disagreeing at dawn). Prop-drilling
// it through MapNav into CompassButton and MoonButton would have worked and would also have
// been the thing a later edit quietly forgets to pass.
//
// ⚠️ THE FALLBACK IS LOAD-BEARING. Without a provider this returns the plain palette tokens,
// which is what every surface OFF the map should use — the modal sheets' ModalBar, and the
// settings screens — because they cover the map rather than float on it, so they have no sky
// to belong to. It is also what keeps every component test that renders a card on its own
// rendering exactly the colours it did before.
import { createContext, type ReactNode, useContext } from 'react';

import type { SkyChrome } from '@/lib/solar/sky-chrome';
import { useColors } from './useColors';

const SkyChromeContext = createContext<SkyChrome | null>(null);

export function SkyChromeProvider({
  value,
  children,
}: {
  value: SkyChrome;
  children: ReactNode;
}) {
  return <SkyChromeContext value={value}>{children}</SkyChromeContext>;
}

/** The card ground for a surface on the map — the live sky's, or the palette's when there
 *  is no map behind this surface. */
export function useSkyGlass(): SkyChrome {
  const c = useColors();
  const sky = useContext(SkyChromeContext);
  return sky ?? { surface: c.surface, cardGlass: c.cardGlass };
}
