// The app's one switch: the platform control, wearing the palette.
//
// It exists because there were three hand-copies of these colour props and they had
// already drifted. Two (Toggle, DisclosureGroup) agreed; the third, on the first-run
// reminder list, set only the "on" track — so its off track and its knob were whatever
// the platform felt like, on the one screen every new reader sees.
//
// THE OFF TRACK IS `handle`, NOT `track`. `track` is the timeline's base line: context,
// meant to recede (1.3:1 off the card). A switch that is off is still a control, and its
// knob is the card's own colour — so at `track` the whole thing was a pale disc on a pale
// pill on a pale card, findable by its shadow. `handle` is the tier for exactly this, the
// quiet body of a control that must still be found (about 2:1 in both themes).
import { Switch, type SwitchProps } from 'react-native';

import { useColors } from '@/theme/useColors';

type Props = Omit<SwitchProps, 'trackColor' | 'thumbColor' | 'ios_backgroundColor'>;

export function AppSwitch(props: Props) {
  const c = useColors();
  return (
    <Switch
      {...props}
      trackColor={{ true: c.accent, false: c.handle }}
      thumbColor={c.thumb}
      ios_backgroundColor={c.handle}
    />
  );
}
