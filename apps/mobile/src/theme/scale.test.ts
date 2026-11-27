// The scale, enforced.
//
// theme/tokens.ts says of its spacing scale "the only gaps/paddings the app should use",
// and of its type scale "a few sizes, deliberate weights". Nothing held the app to either.
// The screens written with the tokens in view kept to them; the ones written fast did not —
// by 2026-11 the first-run flow alone carried three page gutters (20, 22, 23), five corner
// radii (14, 18, 20, 22, 24) and a title at 30 where every other screen's is 28, each a
// near-miss of a token that already existed. None of it was a decision. It was drift, and
// it is invisible in review because every individual number looks reasonable.
//
// So this reads the source. A size, a gap or a radius is either a tier of the scale
// (written as the token), or it is listed here with the reason it is not. The list is the
// app's complete set of deliberate exceptions, which is short enough to read in one sitting
// — and that is the point of having it.
//
// What it does NOT police: values under 4 (hairlines and optical nudges of 1–3 dp are
// drawing, not layout), negative margins (an overlap is geometry, not a gap),
// widths/heights/offsets, and src/widgets (the home-screen widgets are another renderer
// with its own units).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { radius, space, type } from './tokens';

const SRC = path.join(process.cwd(), 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      return ['__tests__', 'test-utils', 'widgets'].includes(entry) ? [] : sourceFiles(full);
    }
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });
}

/** Every `<prop>: <positive number>` in the app's own source, by file, comments excluded. */
function literals(prop: RegExp): Map<string, number[]> {
  const found = new Map<string, number[]>();
  for (const file of sourceFiles(SRC)) {
    const name = path.relative(SRC, file);
    if (name === path.join('theme', 'tokens.ts')) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
      const pattern = new RegExp(`\\b(?:${prop.source}): *(\\d+(?:\\.\\d+)?)\\b`, 'g');
      for (const match of line.matchAll(pattern)) {
        found.set(name, [...(found.get(name) ?? []), Number(match[1])]);
      }
    }
  }
  return found;
}

/** What is in the source and not on the list, as `file: values` lines. */
function unlisted(found: Map<string, number[]>, allowed: Record<string, readonly number[]>): string[] {
  return [...found]
    .map(([file, values]) => [file, values.filter((v) => !(allowed[file] ?? []).includes(v))] as const)
    .filter(([, values]) => values.length > 0)
    .map(([file, values]) => `${file}: ${[...new Set(values)].join(', ')}`);
}

describe('the type scale', () => {
  // Each of these is a DRAWING — a numeral or a map annotation set once, for one place —
  // and says so where it is written. A size that is meant to recur belongs in `type`.
  const EXCEPTIONS: Record<string, readonly number[]> = {
    'app/qibla.tsx': [54], //                        the bearing numeral, the screen's one display figure
    'components/intro/FirstReading.tsx': [46], //    the opening plate's next-prayer time
    'components/intro/FirstMapTitle.tsx': [32], //   the opening title, in Literata
    'components/intro/WidgetGuide.tsx': [22], //     a mock of the home-screen widget's own numeral
    'components/map/PrayerDock.tsx': [11, 12, 13, 15, 16], // the countdown block and the hour ruler (see its styles)
    'components/map/MapMarkersOverlay.tsx': [10, 14], //       labels drawn ON the map, sized as cartography
    'components/ui/chip.ts': [11], //                the one chip label, bold, under `micro` on purpose
  };

  it('is the only place a font size comes from, apart from the listed drawings', () => {
    const stray = unlisted(literals(/fontSize/), EXCEPTIONS);
    // A new entry here means a new size has entered the app. If it is a tier — something a
    // second screen will want — add it to `type` in theme/tokens.ts instead; if it really is
    // a one-off drawing, list it above with what it draws.
    expect({ 'font sizes outside the type scale': stray }).toEqual({ 'font sizes outside the type scale': [] });
  });

  it('keeps every tier a distinct size, weight or leading', () => {
    // Two tiers with the same metrics are one tier with two names, and call sites then pick
    // between them at random — which is how a scale stops being a hierarchy.
    const signatures = Object.entries(type).map(
      ([name, tier]) => [name, `${tier.fontSize}/${tier.fontWeight}/${'lineHeight' in tier ? tier.lineHeight : '-'}`] as const,
    );
    const seen = new Map<string, string>();
    for (const [name, signature] of signatures) {
      expect({ tier: name, sameAs: seen.get(signature) }).toEqual({ tier: name, sameAs: undefined });
      seen.set(signature, name);
    }
  });
});

describe('the spacing scale', () => {
  const STEPS = Object.values(space) as number[];
  // Off-scale on purpose, each explained where it is written.
  const EXCEPTIONS: Record<string, readonly number[]> = {
    'app/qibla.tsx': [13, 22], //                           the Kaaba's seat and the fact row: dial geometry
    'components/settings/theme.ts': [14], //                the card header's top inset (cardHeaderStyle)
    'components/settings/DisclosureGroup.tsx': [14], //     14 + 28 + 14 = the 56 dp header
    'components/settings/NavRow.tsx': [6], //               icon-to-label, optical
    'components/map/MapMarkersOverlay.tsx': [6, 7], //      the prayer pill: a map label chip, tight on purpose
    'components/map/PrayerDock.tsx': [6], //                the 44 dp row's own padding
    'components/intro/FirstReading.tsx': [10], //           the rail's inset: half the thumb, so its ends are reachable
  };

  it('is written as tokens wherever a gap or padding lands on a step', () => {
    const found = literals(/gap|rowGap|columnGap|padding[A-Za-z]*|margin[A-Za-z]*/);
    const onScale = [...found]
      .map(([file, values]) => [file, values.filter((v) => v >= 4 && STEPS.includes(v))] as const)
      .filter(([, values]) => values.length > 0)
      .map(([file, values]) => `${file}: ${[...new Set(values)].join(', ')} — write space.*`);
    // A bare 16 is not wrong today. It is wrong the day the scale moves and it stays behind.
    expect({ 'scale steps written as bare numbers': onScale }).toEqual({ 'scale steps written as bare numbers': [] });
  });

  it('has no off-scale gap or padding except the listed ones', () => {
    const found = literals(/gap|rowGap|columnGap|padding[A-Za-z]*|margin[A-Za-z]*/);
    const offScale = new Map([...found].map(([file, values]) => [file, values.filter((v) => v >= 4 && !STEPS.includes(v))]));
    expect({ 'off-scale spacing': unlisted(offScale, EXCEPTIONS) }).toEqual({ 'off-scale spacing': [] });
  });
});

describe('the corner radii', () => {
  // A literal radius is allowed where it is half a fixed size (a circle), which is geometry.
  const CIRCLES: Record<string, readonly number[]> = {
    'app/qibla.tsx': [30], //                         the 60 dp glow
    'theme/dial.ts': [8], //                          the 16 dp hub
    'components/intro/FirstReading.tsx': [4], //      the 8 dp rail thumb
    'components/intro/FirstMapTitle.tsx': [5], //     the app icon's own corner, at 18 dp
  };

  it('come from the radius scale, apart from circles', () => {
    const found = new Map([...literals(/borderRadius/)].map(([file, values]) => [file, values.filter((v) => v >= 4)]));
    expect({ 'radii outside the scale': unlisted(found, CIRCLES) }).toEqual({ 'radii outside the scale': [] });
  });

  it('keeps the scale itself strictly increasing', () => {
    const steps = [radius.sm, radius.md, radius.lg, radius.xl, radius.round];
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
    expect(new Set(steps).size).toBe(steps.length);
  });
});
