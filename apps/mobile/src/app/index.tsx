import { router, useFocusEffect } from 'expo-router';

import { useIntro } from '@/lib/intro-context';

// Hydration distinguishes a fresh opening on the map from a returning reader.
export default function Index() {
  const { status } = useIntro();
  useFocusEffect(() => {
    if (status !== 'unknown') router.dismissTo('/bonetider');
  });
  return null;
}
