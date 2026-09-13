// Regenerates the moskéskärm's shaded relief:
//   src/assets/bonetider/relief-screen.webp   the shading, as one image
//   src/lib/bonetider/relief-screen.ts        where that image sits in Web Mercator
//
// Parity with the app. The app draws a MapLibre `hillshade` layer from AWS Terrain Tiles,
// lit from three directions at once, in shadow and highlight colours of its own
// (apps/mobile/src/lib/map/nordicStyle.ts, the DARK palette). The wall has no map engine
// and must not fetch tiles while it runs, so the same shading is computed ONCE here —
// from the same elevation tiles, with the same three lights and the same colours — and
// shipped as a single image the canvas draws over the land and under the lakes.
//
// Elevation: AWS Terrain Tiles (Mapzen), terrarium encoding — credited on /bonetider/metod/.
//
// One-off: `node scripts/build-screen-relief.mjs`
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const Z = 6;
const TILE = 256;
// Wider than the wall's widest frame (about lon −8…44, lat 51…74 at 1080p), so the relief
// never ends inside the picture.
const BOUNDS = [-10, 50, 46, 75];
const DEM = (x, y) => `https://elevation-tiles-prod.s3.amazonaws.com/terrarium/${Z}/${x}/${y}.png`;

// nordicStyle.ts DARK: one primary light from the north-west, two fills.
const LIGHTS = [
	{ azimuth: 315, altitude: 55 },
	{ azimuth: 45, altitude: 40 },
	{ azimuth: 135, altitude: 30 },
];
const SHADOW = { rgb: [6, 10, 20], alpha: [0.6, 0.28, 0.17] };
const HIGHLIGHT = { rgb: [186, 202, 240], alpha: [0.32, 0.15, 0.09] };
const ACCENT = { rgb: [150, 170, 215], alpha: 0.22 };
// How strongly slope drives the shading. The tiles are ~1.2 km a pixel at this latitude,
// where even the Scandes are gentle slopes, so the slope is exaggerated before it is lit —
// the same job MapLibre's hillshade-exaggeration does — and tuned by eye against the app.
const EXAGGERATION = 4;
const GAIN = 1.5;

const tileX = (lon) => Math.floor(((lon + 180) / 360) * 2 ** Z);
const tileY = (lat) => {
	const r = (lat * Math.PI) / 180;
	return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** Z);
};
const x0 = tileX(BOUNDS[0]);
const x1 = tileX(BOUNDS[2]);
const y0 = tileY(BOUNDS[3]);
const y1 = tileY(BOUNDS[1]);
const cols = x1 - x0 + 1;
const rows = y1 - y0 + 1;
const W = cols * TILE;
const H = rows * TILE;

// ---- elevation -------------------------------------------------------------
const elev = new Float32Array(W * H);
const jobs = [];
for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) jobs.push([tx, ty]);

async function fetchTile([tx, ty]) {
	for (let attempt = 0; attempt < 3; attempt++) {
		const res = await fetch(DEM(tx, ty));
		if (!res.ok) continue;
		const { data, info } = await sharp(Buffer.from(await res.arrayBuffer()))
			.raw()
			.toBuffer({ resolveWithObject: true });
		const ox = (tx - x0) * TILE;
		const oy = (ty - y0) * TILE;
		for (let py = 0; py < TILE; py++)
			for (let px = 0; px < TILE; px++) {
				const i = (py * TILE + px) * info.channels;
				const e = data[i] * 256 + data[i + 1] + data[i + 2] / 256 - 32768;
				// The tiles carry bathymetry. Sea floor is flattened to sea level, or the drop
				// from coast to seabed shades a bright band along every shore.
				elev[(oy + py) * W + ox + px] = e > 0 ? e : 0;
			}
		return;
	}
	throw new Error(`terrain tile ${tx}/${ty} failed`);
}

for (let i = 0; i < jobs.length; i += 8) await Promise.all(jobs.slice(i, i + 8).map(fetchTile));
console.log(`fetched ${jobs.length} tiles → ${W}x${H}`);

// One pass of a 3×3 box blur. Terrarium heights are whole metres, and on the gentle
// Swedish uplands that quantisation shades as speckle; the app's GPU hillshade samples
// between texels and never shows it.
{
	const src = elev.slice();
	for (let y = 1; y < H - 1; y++)
		for (let x = 1; x < W - 1; x++) {
			let sum = 0;
			for (let dy = -1; dy <= 1; dy++)
				for (let dx = -1; dx <= 1; dx++) sum += src[(y + dy) * W + x + dx];
			elev[y * W + x] = sum / 9;
		}
}

// ---- shading ---------------------------------------------------------------
const rgba = new Uint8ClampedArray(W * H * 4);
const lights = LIGHTS.map(({ azimuth, altitude }) => {
	const a = (azimuth * Math.PI) / 180;
	const h = (altitude * Math.PI) / 180;
	return [Math.sin(a) * Math.cos(h), Math.cos(a) * Math.cos(h), Math.sin(h)];
});
const at = (x, y) => elev[y * W + x];

for (let y = 1; y < H - 1; y++) {
	// Ground metres per pixel on this row, from its latitude.
	const my = (y0 + (y + 0.5) / TILE) / 2 ** Z;
	const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * my)));
	const mpp = (40075016.686 * Math.cos(lat)) / (TILE * 2 ** Z);
	for (let x = 1; x < W - 1; x++) {
		// Horn's method. y grows southward in the image, so north is −dy.
		const dzdx =
			(at(x + 1, y - 1) +
				2 * at(x + 1, y) +
				at(x + 1, y + 1) -
				(at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1))) /
			(8 * mpp);
		const dzdn =
			(at(x - 1, y - 1) +
				2 * at(x, y - 1) +
				at(x + 1, y - 1) -
				(at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1))) /
			(8 * mpp);
		const p = dzdx * EXAGGERATION;
		const q = dzdn * EXAGGERATION;
		const norm = Math.hypot(p, q, 1);
		const n = [-p / norm, -q / norm, 1 / norm];
		let shadow = 0;
		let highlight = 0;
		for (let i = 0; i < lights.length; i++) {
			const l = lights[i];
			const delta = (n[0] * l[0] + n[1] * l[1] + n[2] * l[2] - l[2]) * GAIN;
			if (delta < 0) shadow += SHADOW.alpha[i] * Math.min(1, -delta);
			else highlight += HIGHLIGHT.alpha[i] * Math.min(1, delta);
		}
		// Ruggedness: steep ground picks up the accent, whatever the light.
		const accent = ACCENT.alpha * Math.min(1, (1 - n[2]) * 3);
		const layers = [
			[SHADOW.rgb, Math.min(1, shadow)],
			[ACCENT.rgb, accent],
			[HIGHLIGHT.rgb, Math.min(1, highlight)],
		];
		// Straight-alpha "over", bottom to top.
		let r = 0;
		let g = 0;
		let b = 0;
		let a = 0;
		for (const [rgb, ta] of layers) {
			const na = ta + a * (1 - ta);
			if (na <= 0) continue;
			r = (rgb[0] * ta + r * a * (1 - ta)) / na;
			g = (rgb[1] * ta + g * a * (1 - ta)) / na;
			b = (rgb[2] * ta + b * a * (1 - ta)) / na;
			a = na;
		}
		const o = (y * W + x) * 4;
		rgba[o] = r;
		rgba[o + 1] = g;
		rgba[o + 2] = b;
		rgba[o + 3] = a * 255;
	}
}

// ---- write -----------------------------------------------------------------
const imageDest = join(ROOT, "src/assets/bonetider/relief-screen.webp");
mkdirSync(dirname(imageDest), { recursive: true });
const info = await sharp(Buffer.from(rgba.buffer), { raw: { width: W, height: H, channels: 4 } })
	.webp({ quality: 78, alphaQuality: 70, effort: 6 })
	.toFile(imageDest);
writeFileSync(
	join(ROOT, "src/lib/bonetider/relief-screen.ts"),
	`// AUTO-GENERATED by scripts/build-screen-relief.mjs — do not edit by hand.
// Where relief-screen.webp sits: a block of z${Z} Web Mercator tiles, ${TILE} px each.
export const RELIEF_SCREEN = { z: ${Z}, x0: ${x0}, y0: ${y0}, cols: ${cols}, rows: ${rows} } as const;
`,
);
console.log(`wrote ${imageDest} (${Math.round(info.size / 1024)} kB, ${W}x${H})`);
