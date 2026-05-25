import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';

// Native bottom tabs: UITabBarController on iOS (Liquid Glass on iOS 26),
// Material bottom navigation on Android. Icons are platform-native — SF Symbols
// on iOS (`sf`, no assets), @expo/vector-icons Material glyphs on Android.
const { Trigger } = NativeTabs;

// Default tab when entering the group at "/".
export const unstable_settings = { anchor: 'bonetider' };

export default function TabsLayout() {
  return (
    <NativeTabs>
      <Trigger name="bonetider">
        <Trigger.Label>Bönetider</Trigger.Label>
        {Platform.OS === 'ios' ? (
          <Trigger.Icon sf="clock.fill" />
        ) : (
          <Trigger.Icon src={<Trigger.VectorIcon family={MaterialIcons} name="schedule" />} />
        )}
      </Trigger>
      <Trigger name="installningar">
        <Trigger.Label>Inställningar</Trigger.Label>
        {Platform.OS === 'ios' ? (
          <Trigger.Icon sf="gearshape.fill" />
        ) : (
          <Trigger.Icon src={<Trigger.VectorIcon family={MaterialIcons} name="settings" />} />
        )}
      </Trigger>
      <Trigger name="om">
        <Trigger.Label>Om</Trigger.Label>
        {Platform.OS === 'ios' ? (
          <Trigger.Icon sf="info.circle.fill" />
        ) : (
          <Trigger.Icon src={<Trigger.VectorIcon family={MaterialIcons} name="info" />} />
        )}
      </Trigger>
    </NativeTabs>
  );
}
