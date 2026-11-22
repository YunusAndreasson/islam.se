import { useIsFocused } from 'expo-router';
import { useEffectEvent, useLayoutEffect } from 'react';
import { BackHandler } from 'react-native';

/** Reserve Android Back for transient content only while its route is on top. */
export function usePendingBack(pending: boolean, handleBack: () => void) {
  const focused = useIsFocused();
  const onBack = useEffectEvent(handleBack);
  useLayoutEffect(() => {
    if (!focused || !pending) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [focused, pending]);
}
