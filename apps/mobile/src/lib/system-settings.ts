import { Linking, Platform } from 'react-native';

/** User-facing name for the OS-owned settings surface. */
export const systemSettingsName = (): string =>
  Platform.OS === 'ios' ? 'iOS-inställningar' : 'appinställningar';

// Seven places in the app hand the reader over to the OS: the Plats and Notiser sections
// of Inställningar, the Qibla screen, both map hint cards, and both introduction steps.
// They render in four different vocabularies (a settings-card row, a card link, an intro
// link) and should keep doing so — the layout belongs to the surface. What must never
// drift is the destination and the words: seven copies of `Linking.openSettings()` and
// seven hand-written `Öppna ${systemSettingsName()}` is seven chances for one of them to
// say something the others don't.
/** Open this app's page in the OS settings. Never throws. */
export const openSystemSettings = (): void => {
  void Linking.openSettings();
};

/** The visible label on every control that leads there. */
export const openSystemSettingsLabel = (): string => `Öppna ${systemSettingsName()}`;

/**
 * The spoken label. `reason` names what the reader is going there to allow — "plats",
 * "notiser" — so a screen reader announces the destination AND the purpose, which the
 * visible label leaves to context.
 */
export const openSystemSettingsA11yLabel = (reason: string): string =>
  `${openSystemSettingsLabel()} för ${reason}`;
