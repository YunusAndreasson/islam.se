// Which way to turn, said once.
//
// One row per direction, so the glyph, the sentence a sighted reader sees and the words a
// screen-reader user hears can never drift apart. These are the screens whose whole purpose
// is a single unambiguous instruction, and two parallel switches over the same three values
// is exactly how the two halves end up saying different things — which is why this is a
// table and not a function with a `switch` in it.
//
// Shared by the qibla compass and the Moon's sky dial: the target differs, the instruction
// does not. A reader who has used one already knows the other.
import type { TurnDir } from '@/lib/aim';
import type { IconName } from './Icon';

export const TURN_CUES: Record<TurnDir, { icon: IconName; text: string; spoken: string }> = {
  right: { icon: 'rotateRight', text: 'Vrid åt höger', spoken: 'vrid åt höger' },
  left: { icon: 'rotateLeft', text: 'Vrid åt vänster', spoken: 'vrid åt vänster' },
  // Side-less on purpose: past AIM_TURN_AROUND the words stop naming a side because the sign
  // is decided by jitter, so a handed arrow here would name one anyway.
  around: { icon: 'turnAround', text: 'Vänd dig om', spoken: 'vänd dig om' },
};
