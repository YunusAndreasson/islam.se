import { router, type Href } from 'expo-router';
import { Alert } from 'react-native';

import { saveIntroStep } from '@/lib/intro';
import { useOptionalIntroStatus, useOptionalMapLesson } from '@/lib/intro-context';

// All three map instruments can leave the timetable before onboarding finishes.
// Keep a fresh install identifiable before a destination gets to write settings.
export function useMapNavigate() {
  const status = useOptionalIntroStatus();
  const { replaying } = useOptionalMapLesson();
  return (route: Href) => {
    if (status === 'unknown') return;
    if (status !== 'pending' || replaying) {
      router.navigate(route);
      return;
    }
    void saveIntroStep(1, true).then(saved => {
      if (saved) router.navigate(route);
      else Alert.alert('Det gick inte att spara. Försök igen.');
    });
  };
}
