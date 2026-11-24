import * as Location from 'expo-location';
import { Location as Foreground, RequestPermissionsAccuracyOption } from 'expo-location/next';
import { Platform } from 'react-native';

export async function requestPrayerLocation() {
  if (Platform.OS !== 'android') return Location.requestForegroundPermissionsAsync();
  await Foreground.requestForegroundPermissions({ accuracy: RequestPermissionsAccuracyOption.REDUCED });
  return Location.getForegroundPermissionsAsync();
}
