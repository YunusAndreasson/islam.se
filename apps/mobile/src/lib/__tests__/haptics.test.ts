import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import * as Haptics from 'expo-haptics';

import { hapticLight, hapticSelection, hapticSuccess, setHapticsEnabled } from '../haptics';

// The haptics wrapper is gated by a module-level flag the SettingsProvider syncs from
// the user's "Haptik" preference (a flag rather than context because the helpers fire
// from gesture worklets where context is unreachable). These guard the contract that
// flipping the preference off truly silences EVERY helper — a regression here would let
// disabled haptics still reach the taptic engine. expo-haptics is mocked no-op in
// jest.setup.js, so we assert on whether the native calls were reached at all.
describe('haptics gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setHapticsEnabled(true); // restore the default so each test is isolated from the last
  });

  it('reaches expo-haptics for each helper when enabled', () => {
    setHapticsEnabled(true);
    hapticSelection();
    hapticLight();
    hapticSuccess();
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
  });

  it('stays completely silent once the user turns haptics off', () => {
    setHapticsEnabled(false);
    hapticSelection();
    hapticLight();
    hapticSuccess();
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
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
const CALLS_HELPER = /haptic(?:Selection|Light|Success)\s*\(/;
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
