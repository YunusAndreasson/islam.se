import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

import {
  hapticLight,
  hapticSelection,
  hapticSuccess,
  hapticWarning,
  setHapticsEnabled,
} from '../haptics';

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
    setAndroidVersion(34); // Android 14 — Confirm/Reject available
  });

  it('routes selection/light/success/warning to performAndroidHapticsAsync, never the Vibrator', () => {
    hapticSelection();
    hapticLight();
    hapticSuccess();
    hapticWarning();
    expect(Haptics.performAndroidHapticsAsync).toHaveBeenNthCalledWith(
      1,
      Haptics.AndroidHaptics.Clock_Tick,
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
});

describe('haptics on old Android fall back to the Vibrator for success/warning (API < 30)', () => {
  beforeEach(() => {
    setPlatform('android');
    setAndroidVersion(26); // Android 8 — Confirm/Reject don't exist, so notificationAsync fallback
  });

  it('keeps universal ticks on the semantic engine but falls back for Confirm/Reject', () => {
    hapticSelection();
    hapticLight();
    hapticSuccess();
    hapticWarning();
    // Clock_Tick (API 21) and Virtual_Key (API 5) are universal — still the semantic engine.
    expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledWith(
      Haptics.AndroidHaptics.Clock_Tick,
    );
    expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledWith(
      Haptics.AndroidHaptics.Virtual_Key,
    );
    // success/warning fall back to the Vibrator notification so pre-Android-11 still buzzes.
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Warning);
    // Confirm/Reject must NOT be sent to a device that doesn't have them.
    expect(Haptics.performAndroidHapticsAsync).not.toHaveBeenCalledWith(
      Haptics.AndroidHaptics.Confirm,
    );
    expect(Haptics.performAndroidHapticsAsync).not.toHaveBeenCalledWith(
      Haptics.AndroidHaptics.Reject,
    );
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
const CALLS_HELPER = /haptic(?:Selection|Light|Success|Warning)\s*\(/;
const SILENCED = [
  'components/nav/GlassRoundButton.tsx',
  'components/settings/DisclosureGroup.tsx',
  'components/about/FaqItem.tsx',
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
