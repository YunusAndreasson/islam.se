import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

import {
  hapticGrab,
  hapticLight,
  hapticRelease,
  hapticSelection,
  hapticSuccess,
  hapticToggle,
  hapticWarning,
  setHapticsEnabled,
} from '@/lib/haptics';

// The haptics wrapper is gated by a module-level flag the SettingsProvider syncs from
// the user's "Haptik" preference (a flag rather than context because the helpers fire
// from gesture worklets where context is unreachable). These guard two contracts:
//   1. flipping the preference off truly silences EVERY helper, and
//   2. each helper reaches the RIGHT native API for the platform — on iOS the Taptic
//      generators, on Android the semantic haptic engine (performAndroidHapticsAsync)
//      rather than the Vibrator waveform Expo's own docs flag as "not recommended".
// expo-haptics is mocked no-op in jest.setup.js, so we assert on which native calls were reached.

const ORIGINAL_OS = Platform.OS;
const ORIGINAL_VERSION = Platform.Version;

function setPlatform(os: 'ios' | 'android'): void {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
}
function setAndroidVersion(v: number): void {
  Object.defineProperty(Platform, 'Version', { configurable: true, get: () => v });
}

beforeEach(() => {
  jest.clearAllMocks();
  setHapticsEnabled(true); // restore the default so each test is isolated from the last
});

afterEach(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => ORIGINAL_OS });
  Object.defineProperty(Platform, 'Version', { configurable: true, get: () => ORIGINAL_VERSION });
});

describe('haptics gate', () => {
  it('stays completely silent once the user turns haptics off (iOS)', () => {
    setPlatform('ios');
    setHapticsEnabled(false);
    hapticSelection();
    hapticLight();
    hapticSuccess();
    hapticWarning();
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    expect(Haptics.performAndroidHapticsAsync).not.toHaveBeenCalled();
  });

  it('stays completely silent once the user turns haptics off (Android)', () => {
    setPlatform('android');
    setAndroidVersion(34);
    setHapticsEnabled(false);
    hapticSelection();
    hapticLight();
    hapticSuccess();
    hapticWarning();
    expect(Haptics.performAndroidHapticsAsync).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });
});

describe('haptics on iOS reach the Taptic generators', () => {
  beforeEach(() => setPlatform('ios'));

  it('routes each helper to its iOS generator, never the Android engine', () => {
    hapticSelection();
    hapticLight();
    hapticSuccess();
    hapticWarning();
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    expect(Haptics.notificationAsync).toHaveBeenNthCalledWith(
      1,
      Haptics.NotificationFeedbackType.Success,
    );
    expect(Haptics.notificationAsync).toHaveBeenNthCalledWith(
      2,
      Haptics.NotificationFeedbackType.Warning,
    );
    // The Android-only semantic engine is never touched on iOS.
    expect(Haptics.performAndroidHapticsAsync).not.toHaveBeenCalled();
  });
});

describe('haptics on Android reach the semantic engine (API 30+)', () => {
  beforeEach(() => {
    setPlatform('android');
    setAndroidVersion(34); // Android 14 — Segment_Tick, Confirm and Reject all available
  });

  it('routes selection/light/success/warning to performAndroidHapticsAsync, never the Vibrator', () => {
    hapticSelection();
    hapticLight();
    hapticSuccess();
    hapticWarning();
    // Segment_Tick, not Clock_Tick: Android's constant for "switching between a series of
    // potential choices" — what every class-3 moment is. Clock_Tick names a clock face.
    expect(Haptics.performAndroidHapticsAsync).toHaveBeenNthCalledWith(
      1,
      Haptics.AndroidHaptics.Segment_Tick,
    );
    expect(Haptics.performAndroidHapticsAsync).toHaveBeenNthCalledWith(
      2,
      Haptics.AndroidHaptics.Virtual_Key,
    );
    expect(Haptics.performAndroidHapticsAsync).toHaveBeenNthCalledWith(
      3,
      Haptics.AndroidHaptics.Confirm,
    );
    expect(Haptics.performAndroidHapticsAsync).toHaveBeenNthCalledWith(
      4,
      Haptics.AndroidHaptics.Reject,
    );
    // The iOS generators and the raw-Vibrator notification are never used on modern Android.
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it('falls back to Clock_Tick for a selection on Android 13, which has no Segment_Tick', () => {
    // Segment_Tick is API 34. expo-haptics resolves constants by reflection and throws for a
    // missing one, so sending it to Android 13 would make every class-3 tick silent.
    setAndroidVersion(33);
    hapticSelection();
    expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledWith(
      Haptics.AndroidHaptics.Clock_Tick,
    );
    expect(Haptics.performAndroidHapticsAsync).not.toHaveBeenCalledWith(
      Haptics.AndroidHaptics.Segment_Tick,
    );
  });
});

// Below API 30 there is no Confirm or Reject. The fallback USED to be expo-haptics'
// notificationAsync — a raw Vibrator waveform, which ignores the system touch-feedback
// setting, so an Android 7–10 reader who had switched touch feedback off for the whole phone
// was still buzzed on a GPS denial. It now stays on performHapticFeedback, which honours that
// setting, and lands on constants every API level has.
describe('haptics on old Android stay on the semantic engine (API < 30)', () => {
  beforeEach(() => {
    setPlatform('android');
    setAndroidVersion(26); // Android 8 — no Confirm, Reject, Segment_Tick or Gesture_*
  });

  it('falls back to always-available constants for every helper', () => {
    hapticSelection();
    hapticLight();
    hapticSuccess();
    hapticWarning();
    const P = Haptics.performAndroidHapticsAsync;
    expect(P).toHaveBeenNthCalledWith(1, Haptics.AndroidHaptics.Clock_Tick);
    expect(P).toHaveBeenNthCalledWith(2, Haptics.AndroidHaptics.Virtual_Key);
    // success → a click; warning → Long_Press, the heavier click, so a failure still feels
    // stronger than a success the way Reject does next to Confirm.
    expect(P).toHaveBeenNthCalledWith(3, Haptics.AndroidHaptics.Virtual_Key);
    expect(P).toHaveBeenNthCalledWith(4, Haptics.AndroidHaptics.Long_Press);
    expect(P).not.toHaveBeenCalledWith(Haptics.AndroidHaptics.Confirm);
    expect(P).not.toHaveBeenCalledWith(Haptics.AndroidHaptics.Reject);
  });

  it('never reaches the Vibrator on Android at any API level, for any helper', () => {
    // A Vibrator buzz ignores the reader's system touch-feedback setting (see above). Walk
    // every helper across the floors this module switches on and prove none of them gets there.
    for (const version of [24, 29, 30, 33, 34, 36]) {
      setAndroidVersion(version);
      hapticSelection();
      hapticLight();
      hapticToggle(true);
      hapticToggle(false);
      hapticGrab();
      hapticRelease();
      hapticSuccess();
      hapticWarning();
    }
    expect({
      selectionAsync: jest.mocked(Haptics.selectionAsync).mock.calls.length,
      impactAsync: jest.mocked(Haptics.impactAsync).mock.calls.length,
      notificationAsync: jest.mocked(Haptics.notificationAsync).mock.calls.length,
    }).toEqual({ selectionAsync: 0, impactAsync: 0, notificationAsync: 0 });
  });
});

// The three named class-4 helpers exist ONLY to reach an Android constant that says what the
// moment actually is; on iOS they are deliberately indistinguishable from hapticLight. Both
// halves are worth pinning: the Android half because a wrong constant is inaudible in review
// (it still buzzes, just as the wrong thing), and the iOS half because "the same as
// hapticLight" is a claim the next session could quietly break by reaching for Rigid or Soft.
describe('the named class-4 helpers', () => {
  it('reach the exact Android constant on a device that has it', () => {
    setPlatform('android');
    setAndroidVersion(34); // Android 14 — Toggle_* exist here and nowhere earlier
    hapticToggle(true);
    hapticToggle(false);
    hapticGrab();
    hapticRelease();
    const P = Haptics.performAndroidHapticsAsync;
    expect(P).toHaveBeenNthCalledWith(1, Haptics.AndroidHaptics.Toggle_On);
    expect(P).toHaveBeenNthCalledWith(2, Haptics.AndroidHaptics.Toggle_Off);
    expect(P).toHaveBeenNthCalledWith(3, Haptics.AndroidHaptics.Gesture_Start);
    expect(P).toHaveBeenNthCalledWith(4, Haptics.AndroidHaptics.Gesture_End);
  });

  it('falls back to Virtual_Key rather than throwing on a device that lacks it', () => {
    // Android 11: Gesture_* landed at API 30 and DO exist; Toggle_* are API 34 and do not.
    // expo-haptics resolves by reflection and throws for a missing constant, so sending one
    // here would be silence — the fallback is what keeps an old phone buzzing at all.
    setPlatform('android');
    setAndroidVersion(30);
    hapticToggle(true);
    hapticGrab();
    const P = Haptics.performAndroidHapticsAsync;
    expect(P).toHaveBeenNthCalledWith(1, Haptics.AndroidHaptics.Virtual_Key);
    expect(P).toHaveBeenNthCalledWith(2, Haptics.AndroidHaptics.Gesture_Start);
    // The constant this device does not have must never be sent: expo-haptics would throw,
    // and the swallowed rejection would leave the toggle silent instead of merely plainer.
    expect(P).not.toHaveBeenCalledWith(Haptics.AndroidHaptics.Toggle_On);
  });

  it('is the same light impact as hapticLight on iOS, which has no such constants', () => {
    setPlatform('ios');
    hapticToggle(true);
    hapticGrab();
    hapticRelease();
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(3);
    expect(Haptics.impactAsync).toHaveBeenNthCalledWith(1, Haptics.ImpactFeedbackStyle.Light);
    expect(Haptics.impactAsync).toHaveBeenNthCalledWith(2, Haptics.ImpactFeedbackStyle.Light);
    expect(Haptics.impactAsync).toHaveBeenNthCalledWith(3, Haptics.ImpactFeedbackStyle.Light);
    expect(Haptics.performAndroidHapticsAsync).not.toHaveBeenCalled();
  });

  it('is silenced by the user preference like every other helper', () => {
    setPlatform('android');
    setAndroidVersion(34);
    setHapticsEnabled(false);
    hapticToggle(true);
    hapticGrab();
    hapticRelease();
    expect(Haptics.performAndroidHapticsAsync).not.toHaveBeenCalled();
  });
});

// --- Policy guard: surfaces the 2026-06 consistency pass deliberately made haptic-free.
// GlassRoundButton is the shared disc behind ALL navigation chrome (open Qibla / Settings,
// modal ✕ / back ←), and the two accordions are content reveals. Re-introducing a haptic
// helper in any of them would silently resurrect the modal open/close/back + accordion
// buzzing that was removed (see the policy in src/lib/haptics.ts). This reads the source
// and fails if the haptics module is imported or a helper is *called* there, so the removal
// can't drift back in unnoticed: a future edit that genuinely wants a haptic on one of these
// must consciously update this guard AND the written policy. Matching is on import/call
// syntax (not the substring "haptic") so the explanatory "// No haptic: …" comments in
// those files don't trip it.
const SRC = path.join(__dirname, '../..'); // resolves to <app>/src
const IMPORTS_HAPTICS = /import\s[^;]*from\s+['"][^'"]*\/haptics['"]/;
const CALLS_HELPER = /haptic(?:Selection|Light|Success|Warning|Toggle|Grab|Release)\s*\(/;
const SILENCED = [
  'components/nav/GlassRoundButton.tsx',
  'components/settings/DisclosureGroup.tsx',
  'components/about/FaqItem.tsx',
  // 2026-09 pass: each of these only navigates or dismisses — the byt-plats link, the
  // almanac sheet's close, and directions out to a maps app.
  'components/ui/PlaceHeader.tsx',
  'components/moon/MoonAlmanacSheet.tsx',
  'components/map/PlaceCard.tsx',
] as const;

describe('haptics policy — silenced surfaces stay haptic-free', () => {
  it.each(SILENCED)('%s neither imports nor calls a haptics helper', (rel) => {
    const source = fs.readFileSync(path.join(SRC, rel), 'utf8');
    // Object shape (not two bare booleans) so a failure names the offending file.
    expect({
      file: rel,
      importsHaptics: IMPORTS_HAPTICS.test(source),
      callsHaptic: CALLS_HELPER.test(source),
    }).toEqual({ file: rel, importsHaptics: false, callsHaptic: false });
  });

  // Positive control: prove the regexes actually detect haptics, so the guard above can't
  // pass vacuously (a broken pattern that never matches would otherwise green-light a
  // silently re-added haptic). Stepper legitimately keeps its step-snap hapticLight.
  it('detects a real haptic (positive control on Stepper)', () => {
    const source = fs.readFileSync(path.join(SRC, 'components/settings/Stepper.tsx'), 'utf8');
    expect(IMPORTS_HAPTICS.test(source)).toBe(true);
    expect(CALLS_HELPER.test(source)).toBe(true);
  });
});
