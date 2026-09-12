// The twilight wash, baked in bulk.
//
// washColor.ts is the *spec*: a readable RGBA function mirrored step for step against
// the app's SkSL shader, and pinned by its own unit tests. This module is its
// allocation-free twin for the one caller that runs it millions of times — the canvas
// wash, which solves the sun per texel.
//
// Why a twin rather than a rewrite of the spec: washColorAt returns an RGBA tuple and
// calls mix4 twice, so it allocates three arrays per texel, and sunPositionAt
// allocates a fourth for its {altDeg, haDeg}. The garbage, not the trigonometry, was
// the bill. Inlining both into scalar locals measured 496 → 165 ns/texel, a 3.0×
// speed-up that is not only for the mosque screen: at the 480×270 buffer the city
// pages already use at 1920 px, the wash block goes from 64 ms to 21 ms, and
// render-field.ts already names it "the larger half of the remaining long task" on
// all 2 128 of them.
//
// The two MUST agree. washKernelMatchesSpec in wash-kernel.test.ts sweeps the
// altitude/hour-angle plane and fails on any divergence, so the spec stays the single
// source of truth and this stays a transcription of it.
//
// The buffer is laid out in NORMALISED MERCATOR space, not in latitude. That is what
// lets the renderer blit it under a moving camera with a plain source rect:
// screen space is a uniform scale-and-translate of mercator space, so
// texel → screen is affine and axis-aligned at every latitude, including 72° N.
// A latitude-spaced buffer would need a per-row resample, because mercY is a
// log-tangent and not linear in lat.

import { invMercY } from "../map/projection";
import type { WashStops } from "./palette";

const DEG = Math.PI / 180;

/** The rectangle a buffer covers, in normalised Mercator units (mercX/mercY, 0..1). */
export interface WashFootprint {
	mxMin: number;
	mxMax: number;
	myMin: number;
	myMax: number;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
	const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
	return t * t * (3 - 2 * t);
}

/**
 * Solve rows [row0, row1) of an RGBA buffer. Writes into `out` and allocates nothing.
 *
 * Sliced by row so the caller can spread a bake across idle callbacks or hand whole
 * bands to a worker without the kernel knowing which.
 */
export function bakeWashRows(
	out: Uint8ClampedArray,
	texW: number,
	texH: number,
	row0: number,
	row1: number,
	fp: WashFootprint,
	stops: WashStops,
	declRad: number,
	eotMin: number,
	utcMin: number,
): void {
	// Hoisted out of the loops: every stop is read per texel and a property lookup
	// through two objects is not free at a hundred million iterations.
	const nightR = stops.NIGHT[0];
	const nightG = stops.NIGHT[1];
	const nightB = stops.NIGHT[2];
	const nightA = stops.NIGHT[3];
	const coolR = stops.DAWN_COOL[0];
	const coolG = stops.DAWN_COOL[1];
	const coolB = stops.DAWN_COOL[2];
	const coolA = stops.DAWN_COOL[3];
	const warmR = stops.DUSK_WARM[0];
	const warmG = stops.DUSK_WARM[1];
	const warmB = stops.DUSK_WARM[2];
	const warmA = stops.DUSK_WARM[3];
	const goldR = stops.DAWN_WARM[0];
	const goldG = stops.DAWN_WARM[1];
	const goldB = stops.DAWN_WARM[2];
	const goldA = stops.DAWN_WARM[3];
	const dayR = stops.DAY[0];
	const dayG = stops.DAY[1];
	const dayB = stops.DAY[2];
	const dayA = stops.DAY[3];

	const sinDecl = Math.sin(declRad);
	const cosDecl = Math.cos(declRad);
	const mxSpan = fp.mxMax - fp.mxMin;
	const mySpan = fp.myMax - fp.myMin;

	for (let j = row0; j < row1; j++) {
		const my = fp.myMin + ((j + 0.5) / texH) * mySpan;
		const latR = invMercY(my) * DEG;
		// Latitude is constant across a row, so its two trig calls are paid once per row
		// rather than once per texel.
		const sinLat = Math.sin(latR);
		const cosLat = Math.cos(latR);
		let k = j * texW * 4;

		for (let i = 0; i < texW; i++) {
			const lon = (fp.mxMin + ((i + 0.5) / texW) * mxSpan) * 360 - 180;

			// --- sun.ts solarPosition, inlined ---
			const tst = utcMin + eotMin + 4 * lon;
			let ha = tst / 4 - 180;
			ha -= 360 * Math.floor((ha + 180) / 360);
			const sinAlt = sinLat * sinDecl + cosLat * cosDecl * Math.cos(ha * DEG);
			const altDeg = Math.asin(Math.max(-1, Math.min(1, sinAlt))) / DEG;

			// --- washColor.ts washColorAt, inlined ---
			if (altDeg >= 0) {
				// Sun up (including the midnight sun): the basemap is left clear. The
				// literal DAY rgb is written rather than left at zero — invisible at
				// alpha 0 through a premultiplying drawImage, but a straight-alpha
				// filter anywhere downstream would pull black out of the gap.
				out[k] = dayR;
				out[k + 1] = dayG;
				out[k + 2] = dayB;
				out[k + 3] = Math.round(dayA * 255);
				k += 4;
				continue;
			}
			const d = -altDeg;
			const dark = smoothstep(1, 14, d);
			const glow = smoothstep(0, 2, d) * (1 - smoothstep(5, 10, d));
			const warmth = Math.sin(ha * DEG);

			const t = Math.min(1, Math.max(0, warmth * 0.5 + 0.5));
			const hR = coolR + (warmR - coolR) * t;
			const hG = coolG + (warmG - coolG) * t;
			const hB = coolB + (warmB - coolB) * t;
			const hA = coolA + (warmA - coolA) * t;

			const morning = Math.min(1, Math.max(0, -warmth));
			const kiss = morning * smoothstep(0, 0.5, d) * (1 - smoothstep(0.5, 4, d));
			const zR = hR + (goldR - hR) * kiss;
			const zG = hG + (goldG - hG) * kiss;
			const zB = hB + (goldB - hB) * kiss;
			const zA = hA + (goldA - hA) * kiss;

			const a = Math.max(nightA * dark, zA * glow);
			// Rounded before assignment on purpose: Uint8ClampedArray rounds half to
			// even, washColorAt rounds half up, and an off-by-one on a channel would
			// make the twin disagree with the spec at exactly .5.
			out[k] = Math.round(nightR + (zR - nightR) * glow);
			out[k + 1] = Math.round(nightG + (zG - nightG) * glow);
			out[k + 2] = Math.round(nightB + (zB - nightB) * glow);
			out[k + 3] = Math.round(a * 255);
			k += 4;
		}
	}
}
