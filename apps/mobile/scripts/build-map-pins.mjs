#!/usr/bin/env node
// Render the map's two place pins — the PNGs MosqueLayer and BurialGroundLayer register with
// MapLibre — one per theme in PLACE_GOLD, at the @1x/@2x/@3x densities React Native's asset
// resolver chooses between. The mosque and the grave are one family on the map: same gold,
// same 24-unit grid, same pixel size; only the shape tells them apart.
//
// THE GRAVE comes from the ONE glyph path both maps share
// (apps/web/src/lib/begravningsplatser/glyph.ts) — change it there, then re-run this.
//
// THE MOSQUE is Material Design Icons' `mosque`, whose outline is written out below. It
// used to be drawn on the device: @expo/vector-icons rasterised the glyph from its bundled
// font at runtime (getImageSource), in an effect, and the symbol layer waited on the result.
// That was the last thing in the app still importing @expo/vector-icons — a package Expo's
// own docs call "will be deprecated" — and it shipped a whole icon font to draw one shape.
// Bundled, the pin is there on the first frame and re-tints by picking the other file.
//
// ⚠️ TINTS must equal PLACE_GOLD in src/components/map/place-layer-style.ts. They are copied,
// not imported — this script cannot load a .ts module graph — so change both together.
//
// Needs `rsvg-convert` (librsvg). Run it only when a glyph or the colours change:
//   node scripts/build-map-pins.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const GLYPH_MODULE = join(here, '../../web/src/lib/begravningsplatser/glyph.ts');
const OUT_DIR = join(here, '../assets/map');

/** The pins' logical size (GLYPH_PX), which icon-size then scales down on the map. */
const BASE_PX = 48;
const TINTS = { light: '#967038', dark: '#e8c894' };

/**
 * Material Design Icons `mosque` (U+F0D45), © Pictogrammers and contributors, Apache
 * License 2.0 — see NOTICE.md. The outline as the font carries it, on the icon's own
 * 24-unit grid with y down; the curves are quadratic because the font is TrueType.
 */
const MOSQUE_GLYPH_GRID = 24;
const MOSQUE_GLYPH_PATH =
  'M6.98 8.02L17.02 8.02Q17.16 8.02 17.48 8.06L17.81 8.11Q18 7.5 18 7.08Q18 6.09 17.55 5.25Q17.11 4.41 16.31 3.89L12 0.98L7.69 3.8Q6.94 4.41 6.47 5.27Q6 6.14 6 7.08Q6 7.5 6.19 8.11L6.52 8.06Q6.84 8.02 6.98 8.02Z' +
  'M24 6.98Q24 6.33 23.02 5.11Q22.5 4.45 21.98 3.98L21.47 4.55Q20.91 5.16 20.53 5.72Q20.02 6.52 20.02 7.03Q20.02 7.55 20.27 8.02Q20.53 8.48 21 8.72L21 12.98L18.98 12.98L18.98 11.02Q18.98 10.17 18.4 9.59Q17.81 9 17.02 9L6.98 9Q6.19 9 5.6 9.59Q5.02 10.17 5.02 11.02L5.02 12.98L3 12.98L3 8.72Q3.47 8.48 3.73 8.02Q3.98 7.55 3.98 6.98Q3.98 6.33 3 5.11Q2.48 4.45 2.02 3.98L1.5 4.55Q0.89 5.16 0.52 5.72Q0 6.52 0 7.03Q0 7.55 0.28 8.02Q0.56 8.48 0.98 8.72L0.98 21L9.98 21L9.98 17.02Q9.98 16.17 10.57 15.59Q11.16 15 12 15Q12.84 15 13.43 15.59Q14.02 16.17 14.02 17.02L14.02 21L23.02 21L23.02 8.72Q23.44 8.48 23.72 8.02Q24 7.55 24 6.98Z';

const source = readFileSync(GLYPH_MODULE, 'utf8');
const burialPath = /BURIAL_GLYPH_PATH\s*=\s*"([^"]+)"/.exec(source)?.[1];
const burialGrid = Number(/BURIAL_GLYPH_GRID\s*=\s*(\d+)/.exec(source)?.[1]);
if (!burialPath || !burialGrid) {
  console.error(`✖ build-map-pins: could not read BURIAL_GLYPH_PATH / BURIAL_GLYPH_GRID from ${GLYPH_MODULE}`);
  process.exit(1);
}

const PINS = {
  burial: { path: burialPath, grid: burialGrid },
  mosque: { path: MOSQUE_GLYPH_PATH, grid: MOSQUE_GLYPH_GRID },
};

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, { path, grid }] of Object.entries(PINS)) {
  for (const [theme, fill] of Object.entries(TINTS)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${grid} ${grid}"><path fill="${fill}" d="${path}"/></svg>`;
    for (const scale of [1, 2, 3]) {
      const px = String(BASE_PX * scale);
      const file = join(OUT_DIR, `${name}-pin-${theme}${scale === 1 ? '' : `@${scale}x`}.png`);
      execFileSync('rsvg-convert', ['-w', px, '-h', px, '-o', file], { input: svg });
      console.log(`✔ ${file}`);
    }
  }
}
