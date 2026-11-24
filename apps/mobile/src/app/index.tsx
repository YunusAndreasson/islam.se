import { Redirect } from 'expo-router';

import { useIntro } from '@/lib/intro-context';

// Hydration distinguishes a fresh opening on the map from a returning reader.
export default function Index() {
  const { status } = useIntro();
  if (status === 'unknown') return null;
  return <Redirect href="/bonetider" />;
}
