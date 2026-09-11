// The mosque detail card — the shared PlaceCard (see it for the layout and the glass
// chrome), filled from a mosque record: name, the street, "kommun · län" with the distance,
// and — only when known — the year it opened and its huvudman. There is no denomination,
// phone or website in the data (by design), so the card never promises more than the
// dataset holds. Directions hand off to the native maps app (see ../../lib/mosques/directions).
//
// THE STREET IS WHY THE CARD IS USEFUL AT THE KERB. It was missing for a long time — the
// card named the place and its kommun, which tells a reader standing outside a building
// nothing about whether it is THIS building. The dataset held the address the whole time;
// it just needed formatting out of OpenStreetMap's reversed comma chain. See
// formatMosqueAddress, which is where all of that reasoning lives.
//
// The quiet link under the directions button is "Rapportera fel". The dataset is a snapshot
// and the person reading this card is standing near the place, so this is where a
// correction is worth asking for.
import { router } from 'expo-router';

import { type Mosque, formatMosqueAddress, locationLabel } from '@/lib/mosques';
import { openDirections } from '@/lib/mosques/directions';
import type { LatLng } from '@/lib/prayer-times';

import { PlaceCard } from './PlaceCard';

interface Props {
  mosque: Mosque;
  /** The user's location — the origin for the distance readout. */
  userCoords: LatLng;
  /** Distance in dp from the screen bottom, so the card floats above the dock. */
  bottom: number;
  onClose: () => void;
}

export function MosqueCard({ mosque, userCoords, bottom, onClose }: Props) {
  // "Öppnad 2007" and "Huvudman: …" only when the dataset actually has them.
  const meta: string[] = [];
  if (mosque.opened) meta.push(`Öppnad ${mosque.opened}`);
  if (mosque.organisation) meta.push(`Huvudman: ${mosque.organisation}`);

  return (
    <PlaceCard
      title={mosque.name}
      // Null for the thirteen records with no address at all — the line is then simply
      // absent, exactly as `opened` and `organisation` already behave.
      subtitle={formatMosqueAddress(mosque)}
      location={locationLabel(mosque)}
      at={mosque}
      userCoords={userCoords}
      meta={meta.length > 0 ? meta.join('  ·  ') : null}
      bottom={bottom}
      onClose={onClose}
      onDirections={() => openDirections(mosque)}
      secondary={{
        label: 'Rapportera fel',
        accessibilityLabel: `Rapportera fel om ${mosque.name}`,
        onPress: () => router.push({ pathname: '/moske-rattelse', params: { id: mosque.id } }),
      }}
    />
  );
}
