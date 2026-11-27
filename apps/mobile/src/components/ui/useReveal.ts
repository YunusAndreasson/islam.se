// The fold: a body that opens and closes on a boolean, at its own measured height.
//
// DisclosureGroup and FaqItem both do this, and both used to drive it the long way round —
// a shared value, an effect that pushed `withTiming` into it whenever the boolean changed,
// and two or three `useAnimatedStyle` worklets reading it back. That is the machinery for
// an animation driven by a gesture or a sensor. This one is driven by STATE, which is the
// case Reanimated's CSS transitions exist for: say what the style is when open and when
// closed, name the properties that should travel between the two, and there is no shared
// value, no effect and no worklet left to keep in step.
//
// ⚠️ THE FIRST MEASUREMENT MUST NOT ANIMATE. The body's height is measured, so it is 0 for
// one frame and then the real number. With the transition live from the start, a fold that
// mounts already open would grow from nothing on every screen entry, and the summary line
// would visibly settle from its one-line estimate to its true height. So the duration is 0
// until one frame AFTER the first layout has landed (`settled`), and only then the real
// one. A later re-measure does animate, which is what a body that gains a row should do.
//
// Reduce Motion is honoured here, not left to the library: the duration simply stays 0.
import { useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { motion } from '@/theme/tokens';

export function useReveal(expanded: boolean) {
  const reduceMotion = useReducedMotion();
  const [height, setHeight] = useState(0);
  const [settled, setSettled] = useState(false);
  const measured = useRef(false);

  const onLayout = (event: LayoutChangeEvent): void => {
    setHeight(event.nativeEvent.layout.height);
    if (!measured.current) {
      measured.current = true;
      requestAnimationFrame(() => setSettled(true));
    }
  };

  /** Spread into any style that should travel with the fold (the chevron, a summary line),
   *  beside that style's own `transitionProperty`. */
  const timing = {
    transitionDuration: settled && !reduceMotion ? motion.base : 0,
    transitionTimingFunction: 'ease-in-out',
  } as const;

  return {
    /** For the absolutely-positioned child that holds the content at its natural height. */
    onLayout,
    timing,
    /** For the clipping body around it. */
    body: {
      height: expanded ? height : 0,
      opacity: expanded ? 1 : 0,
      transitionProperty: ['height', 'opacity'],
      ...timing,
    },
  };
}
