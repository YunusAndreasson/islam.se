#!/usr/bin/env node
// Render the burial-ground map pin — the PNGs BurialGroundLayer registers with MapLibre —
// from the ONE glyph path both maps share (apps/web/src/lib/begravningsplatser/glyph.ts).
//
// WHY PNGs, when the mosque pin is rasterised on the device: that pin is a glyph of the
// bundled MaterialCommunityIcons font, which @expo/vector-icons can draw to a bitmap at
// runtime (getImageSource). This glyph is in no font, so it ships as images — one per theme
// in the SAME warm gold the mosque glyph wears, at the @1x/@2x/@3x densities React Native's
// asset resolver chooses between. The mosque and the grave are one family on the map; only
// the shape tells them apart.
//
// ⚠️ TINTS must equal MosqueLayer's SNOW_LIGHT.color and SNOW_DARK.color. They are copied,
// not imported — this script cannot load a .tsx module — so change both together.
//
// Needs `rsvg-convert` (librsvg). Run it only when the glyph or the colours change:
//   node scripts/build-burial-pins.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const GLYPH_MODULE = join(here, '../../web/src/lib/begravningsplatser/glyph.ts');
const OUT_DIR = join(here, '../assets/map');

/** MosqueLayer's GLYPH_PX: the pin's logical size, which icon-size then scales down. */
const BASE_PX = 48;
const TINTS = { light: '#967038', dark: '#e8c894' };

const source = readFileSync(GLYPH_MODULE, 'utf8');
const path = /BURIAL_GLYPH_PATH\s*=\s*"([^"]+)"/.exec(source)?.[1];
const grid = Number(/BURIAL_GLYPH_GRID\s*=\s*(\d+)/.exec(source)?.[1]);
if (!path || !grid) {
  console.error(`✖ build-burial-pins: could not read BURIAL_GLYPH_PATH / BURIAL_GLYPH_GRID from ${GLYPH_MODULE}`);
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const [theme, fill] of Object.entries(TINTS)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${grid} ${grid}"><path fill="${fill}" d="${path}"/></svg>`;
  for (const scale of [1, 2, 3]) {
    const px = String(BASE_PX * scale);
    const file = join(OUT_DIR, `burial-pin-${theme}${scale === 1 ? '' : `@${scale}x`}.png`);
    execFileSync('rsvg-convert', ['-w', px, '-h', px, '-o', file], { input: svg });
    console.log(`✔ ${file}`);
  }
}
