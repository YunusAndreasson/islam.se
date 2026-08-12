import { Redirect } from 'expo-router';

import { useIntro } from '@/lib/intro-context';

// Root entry: "/" is where every cold launch lands, so it is also the gate. A device that
// has not been through the introduction goes there first; everyone else goes straight to
// the map (Bönetider). The other screens (qibla, the settings group) are reached from the
// map and present as sheets, so this leaf just provides the "/" route the dev client opens.
//
// The gate lives here rather than in a Stack.Protected guard because this file redirects
// to /bonetider — a guard that made that route unavailable would leave the redirect with
// nowhere to land, and the fallback behaviour is not something worth depending on. The
// map also checks the status itself before arming its soft-ask queue (see bonetider's
// armOffer), so nothing unprompted can fire behind the introduction.
export default function Index() {
  const { status } = useIntro();
  // One frame while the AsyncStorage read lands. Rendering /bonetider first and correcting
  // afterwards would mount the whole map — camera, Skia field, dock — behind a screen
  // that is about to cover it.
  if (status === 'unknown') return null;
  return <Redirect href={status === 'pending' ? '/valkommen' : '/bonetider'} />;
}
