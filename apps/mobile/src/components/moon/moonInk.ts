// What colour a Moon is.
//
// This is the one place in the app that must NOT use the palette the way everything else
// does, and the reason is worth stating plainly. Semantic tokens flip lightness between
// themes on purpose: `ink` is warm charcoal on cream and warm pale on navy, because both
// mean "the readable foreground". A Moon is not a foreground — it is a DEPICTION of a thing
// with a lit side and a shadowed side, and lit must be the lighter of the two in every theme
// or the drawing says the opposite of what it means. Reaching for `ink` as the lit limb gave
// exactly that: a black gibbous blob on cream, which the eye reads as the shadow.
//
// So the pair is chosen per scheme, and it is chosen to hold ONE physical fact steady: the
// lit limb is the palest surface the theme has, the shadow is its darkest, and a rim draws
// the whole disc so a new Moon is a dark object rather than an absence.
//
// The brass exception is the white days — the ayyām al-bīḍ, named for the full moon they
// fall on. `highlight` is the token reserved for "this is live right now", it is warm and
// light enough to read on both grounds, and it is true three nights a month rather than
// every night, which is what keeps it worth anything.
import { useMemo } from 'react';

import { useActiveScheme, useColors } from '@/theme/useColors';

export interface MoonInk {
  lit: string;
  dark: string;
  rim: string;
}

export function useMoonInk(brass = false): MoonInk {
  const c = useColors();
  const scheme = useActiveScheme();
  return useMemo(() => {
    const ink: MoonInk =
      scheme === 'dark'
        ? // A pale Moon over the deep navy ground — which is simply what one looks like.
          { lit: c.ink, dark: c.paperSunken, rim: c.inkFaint }
        : // On cream the Moon cannot be brighter than the paper, so the drawing works the
          // way a printed almanac's does: the disc is the paper, the shadow is warm grey
          // ink, and the rim is what makes a circle of it.
          { lit: c.surface, dark: c.inkMuted, rim: c.inkFaint };
    return brass ? { ...ink, lit: c.highlight, rim: c.highlightText } : ink;
  }, [c, scheme, brass]);
}
