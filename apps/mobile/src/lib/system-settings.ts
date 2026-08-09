import { Platform } from 'react-native';

/** User-facing name for the OS-owned settings surface. */
export const systemSettingsName = (): string =>
  Platform.OS === 'ios' ? 'iOS-inställningar' : 'appinställningar';
