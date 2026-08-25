// `size` means dp, on both platforms — the contract every call site lays out against.
//
// On Android that is not free. expo-symbols' SymbolView draws the glyph as a
// `<Text fontSize={size} lineHeight={size}>` inside a flat `size × size` <View>, and a React
// Native <Text> font-scales while a <View> does not — so at the reader's text size the glyph
// is drawn at size × fontScale inside a box still measuring size, and the box wins. At
// Android's 1.6× the map dock's 18 pt calendar rendered as the top-left corner of a 29 pt
// glyph and nothing else (found on an emulator, 2026-08-25, and reported by a reader looking
// at that screen). iOS never had the bug: there SymbolView is a native image view that does
// not font-scale at all, which is why dp is the contract worth restoring rather than replacing.
//
// This pins the arithmetic, not the pixels. The Android branch is selected by a module-scope
// `Platform.OS` read that a suite running under the preset's iOS platform cannot flip, and the
// pixels are drawn by a native view the test renderer never runs — so the rendering itself was
// verified on a device at 1.0× and 1.6× instead.
import { describe, expect, it } from '@jest/globals';

import { androidGlyphSize } from './Icon';

describe('androidGlyphSize', () => {
  it('asks for exactly the requested size when the reader has not changed their text size', () => {
    expect(androidGlyphSize(18, 1)).toBe(18);
    expect(androidGlyphSize(26, 1)).toBe(26);
  });

  it('pre-divides so the OS multiplication lands back on the requested size', () => {
    // The regression, in numbers: the glyph used to be asked for at 18, drawn at 28.8, and
    // then clipped by a box still measuring 18.
    for (const fontScale of [1.15, 1.3, 1.6, 2]) {
      expect(androidGlyphSize(18, fontScale) * fontScale).toBeCloseTo(18, 10);
    }
  });

  it('works in the other direction too — Android goes down to 0.85', () => {
    // A smaller-than-default setting has to make the ASK bigger, or the glyph would draw
    // under its own footprint and float in a too-large box.
    expect(androidGlyphSize(24, 0.85)).toBeGreaterThan(24);
    expect(androidGlyphSize(24, 0.85) * 0.85).toBeCloseTo(24, 10);
  });

  it('never returns Infinity if the platform reports a nonsense scale', () => {
    // An icon at its plain requested size is a far better failure than one of size Infinity,
    // which lays out as a blank the size of the screen.
    expect(androidGlyphSize(18, 0)).toBe(18);
    expect(androidGlyphSize(18, Number.NaN)).toBe(18);
  });
});
