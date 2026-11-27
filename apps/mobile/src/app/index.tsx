import { useFocusEffect, useRouter } from 'expo-router';

import { useIntro } from '@/lib/intro-context';

// Hydration distinguishes a fresh opening on the map from a returning reader.
export default function Index() {
  const router = useRouter();
  const { status } = useIntro();
  useFocusEffect(() => {
    if (status !== 'unknown') router.dismissTo('/bonetider');
  });
  return null;
}
