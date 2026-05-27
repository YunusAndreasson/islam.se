import { Redirect } from 'expo-router';

// Root entry: send "/" to the home screen (Bönetider, the map). The other screens
// (qibla, the settings group) are reached from the map and present as sheets, so this
// leaf just provides the "/" route the dev client opens.
export default function Index() {
  return <Redirect href="/bonetider" />;
}
