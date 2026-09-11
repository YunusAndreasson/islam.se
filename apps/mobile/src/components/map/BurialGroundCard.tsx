// The burial-ground card — the shared PlaceCard, filled from a burial-ground record.
//
// Under the cemetery's name sits the SECTION, not a street. At a large cemetery the
// question at the gate is which part is the Muslim one, and "Kvarter 18" or "Ängen och
// Dalen" answers it where a street would only repeat the gate. The meta line carries what
// the source states and nothing more: the address when there is one, and the year the
// section was taken into use.
//
// The quiet link is the SOURCE, labelled with its domain ("Källa: svenskakyrkan.se"), where
// the mosque card has a correction form. That form is built around the mosque list; a
// burial ground's page is where its huvudman publishes opening hours and a phone number,
// which is what a family arranging a burial needs next. Naming the domain tells the reader,
// before they tap, whose word the pin rests on.
import { Linking } from 'react-native';

import { type BurialGround, sectionLabel } from '@/lib/burial-grounds';
import { locationLabel } from '@/lib/mosques';
import { openDirections } from '@/lib/mosques/directions';
import type { LatLng } from '@/lib/prayer-times';

import { PlaceCard } from './PlaceCard';

interface Props {
  ground: BurialGround;
  /** The user's location — the origin for the distance readout. */
  userCoords: LatLng;
  /** Distance in dp from the screen bottom, so the card floats above the dock. */
  bottom: number;
  onClose: () => void;
}

/** "svenskakyrkan.se" from its URL. A regex, not `new URL()`: the card must not depend on
 *  how complete the JS runtime's URL implementation is. */
function sourceHost(url: string): string {
  return /^https?:\/\/(?:www\.)?([^/?#]+)/i.exec(url)?.[1] ?? url;
}

export function BurialGroundCard({ ground, userCoords, bottom, onClose }: Props) {
  const meta: string[] = [];
  if (ground.address) meta.push(ground.address);
  if (ground.opened) meta.push(`I bruk sedan ${ground.opened}`);
  const host = sourceHost(ground.source);

  return (
    <PlaceCard
      title={ground.name}
      subtitle={sectionLabel(ground)}
      location={locationLabel(ground)}
      at={ground}
      userCoords={userCoords}
      meta={meta.length > 0 ? meta.join('  ·  ') : null}
      bottom={bottom}
      onClose={onClose}
      onDirections={() => openDirections(ground)}
      secondary={{
        label: `Källa: ${host}`,
        accessibilityLabel: `Källa för ${ground.name}: ${host}. Öppnas i webbläsaren.`,
        // A missing browser is a no-op, never a red screen — the house style of
        // lib/mosques/directions.
        onPress: () => {
          Linking.openURL(ground.source).catch(() => {});
        },
      }}
    />
  );
}
