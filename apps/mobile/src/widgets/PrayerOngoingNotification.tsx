// RemoteViews are a static presentation: show the scheduled time, never a JS-derived
// "minutes remaining" value that would freeze when the app is suspended.
import { Column, Text } from '@expo/ui/jetpack-compose';
import { paddingAll } from '@expo/ui/jetpack-compose/modifiers';
import { createCustomNotification, type CustomNotificationEnvironment } from 'expo-widgets';

import type { PrayerActivityProps } from './PrayerLiveActivity';

function PrayerOngoingNotificationLayout(
  props: PrayerActivityProps,
  environment: CustomNotificationEnvironment,
) {
  'widget';
  const color = environment.colorScheme === 'dark' ? '#e8e3d8' : '#1a1712';
  const muted = environment.colorScheme === 'dark' ? '#c1c6d4' : '#6f6456';
  const heading = `${props.isMarker ? 'Nästa tid' : 'Nästa bön'}: ${props.nextArabic} ${props.nextTime}`;
  return {
    collapsed: (
      <Column modifiers={[paddingAll(4)]}>
        <Text style={{ fontSize: 16, fontWeight: 'bold' }} color={color} maxLines={1}>{heading}</Text>
        <Text style={{ fontSize: 13 }} color={muted} maxLines={1}>{props.nextSwedish}</Text>
      </Column>
    ),
    expanded: (
      <Column modifiers={[paddingAll(8)]}>
        <Text style={{ fontSize: 20, fontWeight: 'bold' }} color={color} maxLines={1}>{heading}</Text>
        <Text style={{ fontSize: 14 }} color={muted} maxLines={1}>{props.nextSwedish}</Text>
        {props.followingArabic && props.followingTime ? (
          <Text style={{ fontSize: 13 }} color={muted} maxLines={1}>
            {`Därefter ${props.followingArabic} ${props.followingTime}`}
          </Text>
        ) : null}
      </Column>
    ),
  };
}

export default createCustomNotification<PrayerActivityProps>(
  'PrayerOngoingNotification',
  PrayerOngoingNotificationLayout,
);
