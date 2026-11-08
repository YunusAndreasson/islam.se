/**
 * @jest-environment node
 */
// The wash shader against its CPU twin, pixel by pixel.
//
// The SkSL in washShader.ts and the TypeScript in washColor.ts + sun.ts are two copies of
// one computation, and until this test the only thing holding them together was a comment
// asking whoever edits one to mirror the other. Here the SkSL is compiled and rendered by
// CanvasKit (Skia's own WASM build, already installed with react-native-skia) and every
// sampled pixel is compared with what the twin says it must be. A shader that fails to
// compile fails here too, instead of throwing inside the map's first render on a device.
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import CanvasKitInit, { type CanvasKit } from 'canvaskit-wasm';

import { type Camera, unproject } from '@/lib/map/projection';
import { washStopsFor } from '@/lib/solar/palette';
import { solarParams, sunPositionFrom } from '@/lib/solar/sun';
import { washColorAt } from './washColor';
import { buildWashSksl } from './washShader';

let CK: CanvasKit;

beforeAll(async () => {
  const dir = path.dirname(require.resolve('canvaskit-wasm/bin/canvaskit.wasm'));
  CK = await CanvasKitInit({ locateFile: (file: string) => path.join(dir, file) });
});

// jest-expo installs some web globals (URL, structuredClone, expo's import.meta registry) as
// getters that `require` their polyfill on first read. After the last test Jest walks every
// global key to clear mocks, and in this node environment the walk is the first read: the
// `require` then runs outside test code, which Jest 30 refuses, failing the suite after all
// its tests passed (on Node 24, CI's version). Reading them here, inside a hook, settles them.
afterAll(() => {
  for (const key of Object.keys(globalThis)) Reflect.get(globalThis, key);
});

// z3 over Sweden: 96 × 256 px spans roughly 55–68° N, enough latitude for the wash to cross
// day, civil, nautical and astronomical twilight in one frame at the instants below.
const CAMERA: Camera = { lon: 17, lat: 62, zoom: 3, width: 96, height: 256 };
const STEP = 6;

/** Renders the shader for one instant and returns premultiplied RGBA bytes. */
function render(sksl: string, cam: Camera, date: Date, utcMin: number, pixelRatio = 1): Uint8Array {
  const effect = CK.RuntimeEffect.Make(sksl);
  if (!effect) throw new Error('wash SkSL did not compile');
  const { declRad, eotMin } = solarParams(date);
  const ws = 512 * 2 ** cam.zoom;
  const mx = (cam.lon + 180) / 360;
  const phi = (cam.lat * Math.PI) / 180;
  const my = 0.5 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / (2 * Math.PI);
  // Declaration order in the SkSL: u_worldSize, u_viewport, u_center, u_utcMin, u_eotMin,
  // u_sinDecl, u_cosDecl, u_pixelRatio.
  const shader = effect.makeShader([
    ws, cam.width, cam.height, mx, my, utcMin, eotMin, Math.sin(declRad), Math.cos(declRad), pixelRatio,
  ]);
  const surface = CK.MakeSurface(cam.width, cam.height);
  if (!surface) throw new Error('no raster surface');
  const paint = new CK.Paint();
  paint.setShader(shader);
  surface.getCanvas().drawPaint(paint);
  surface.flush();
  const pixels = surface.getCanvas().readPixels(0, 0, {
    width: cam.width,
    height: cam.height,
    colorType: CK.ColorType.RGBA_8888,
    alphaType: CK.AlphaType.Premul,
    colorSpace: CK.ColorSpace.SRGB,
  });
  paint.delete();
  shader.delete();
  effect.delete();
  surface.delete();
  if (!pixels) throw new Error('readPixels returned nothing');
  return pixels as Uint8Array;
}

/** The twin's colour for one pixel, premultiplied into the same 0–255 bytes. */
function expected(
  scheme: 'light' | 'dark',
  cam: Camera,
  x: number,
  y: number,
  date: Date,
  utcMin: number,
): [number, number, number, number] {
  const { lon, lat } = unproject(x + 0.5, y + 0.5, cam);
  const { declRad, eotMin } = solarParams(date);
  const { altDeg, haDeg } = sunPositionFrom(lat, lon, utcMin, declRad, eotMin);
  const [r, g, b, a] = washColorAt(altDeg, haDeg, washStopsFor(scheme));
  return [r * a, g * a, b * a, a * 255];
}

// Instants chosen so every branch of twilight() is crossed somewhere in the frame: an
// autumn dusk (warm glow), a winter night (full veil), a spring dawn (cool glow plus the
// sunrise kiss), and a midsummer midnight (the far north never leaves civil twilight).
const INSTANTS: { name: string; date: Date }[] = [
  { name: 'October dusk', date: new Date(Date.UTC(2026, 9, 17, 15, 40)) },
  { name: 'January night', date: new Date(Date.UTC(2026, 0, 12, 22, 0)) },
  { name: 'April dawn', date: new Date(Date.UTC(2026, 3, 20, 2, 50)) },
  { name: 'midsummer midnight', date: new Date(Date.UTC(2026, 5, 21, 23, 0)) },
];

describe('wash shader', () => {
  for (const scheme of ['light', 'dark'] as const) {
    for (const { name, date } of INSTANTS) {
      it(`matches the CPU twin within the dither (${scheme}, ${name})`, () => {
        expectTwin(scheme, date, 1);
      });
    }
  }

  // Phones are 2–3×. The noise is indexed by device pixel there (u_pixelRatio), and it must
  // still be a dither: within the same bound of the twin, never a tint of its own.
  it('stays within the dither at a 3× pixel ratio', () => {
    expectTwin('dark', INSTANTS[1]!.date, 3);
  });
});

/** Renders one instant and holds every sampled pixel to the twin's colour. */
function expectTwin(scheme: 'light' | 'dark', date: Date, pixelRatio: number): void {
  const sksl = buildWashSksl(washStopsFor(scheme));
  const utcMin = date.getUTCHours() * 60 + date.getUTCMinutes();
  const pixels = render(sksl, CAMERA, date, utcMin, pixelRatio);
  let worst = 0;
  let worstAt = '';
  let tinted = 0;
  for (let y = 0; y < CAMERA.height; y += STEP) {
    for (let x = 0; x < CAMERA.width; x += STEP) {
      const want = expected(scheme, CAMERA, x, y, date, utcMin);
      const i = (y * CAMERA.width + x) * 4;
      if (want[3] > 0) tinted += 1;
      for (let ch = 0; ch < 4; ch++) {
        const diff = Math.abs((pixels[i + ch] ?? 0) - (want[ch] ?? 0));
        if (diff > worst) {
          worst = diff;
          worstAt = `(${x}, ${y}) channel ${ch}: shader ${pixels[i + ch]}, twin ${want[ch]?.toFixed(2)}`;
        }
      }
    }
  }
  // Dither is ±0.5/255 before premultiplication and the bytes round once more, so the
  // two agree to within two steps wherever they compute the same colour. A larger gap
  // means the SkSL and the TypeScript have drifted apart.
  if (worst > 2) {
    throw new Error(`shader and twin disagree by ${worst}/255 at ${worstAt}`);
  }
  // The instant must actually exercise the wash, or the comparison proves nothing.
  expect(tinted).toBeGreaterThan(0);
}
