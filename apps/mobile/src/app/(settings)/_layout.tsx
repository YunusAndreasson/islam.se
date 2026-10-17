import { Stack } from 'expo-router';

import { useColors } from '@/theme/useColors';

// The Settings sheet is a nested stack so "Om appen" can push the full About page
// *inside* it (the iOS-Settings pattern: a sheet whose rows push detail screens, a
// back arrow returns). The root _layout presents this whole group as a modal; here we
// just stack installningar → om with no native header (each screen draws its own
// editorial title + its own close/back control, consistent with the rest of the app).
// The anchor puts Inställningar under a screen deep-linked straight into the group, so its
// back control has somewhere to go.
export const unstable_settings = { anchor: 'installningar' };

export default function SettingsLayout() {
  const c = useColors();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.paper } }} />;
}
