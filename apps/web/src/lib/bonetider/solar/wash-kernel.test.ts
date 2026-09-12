import { describe, expect, it } from "vitest";
import { mercX, mercY } from "../map/projection";
import { washStopsDark, washStopsLight } from "./palette";
import { solarParams, sunPositionAt } from "./sun";
import { bakeWashRows, type WashFootprint } from "./wash-kernel";
import { washColorAt } from "./washColor";

/** Sweden plus the sea the prayer lines sweep across — the real footprint. */
function footprint(): WashFootprint {
	return { mxMin: mercX(-35), mxMax: mercX(57), myMin: mercY(72.6), myMax: mercY(48.6) };
}

describe("wash kernel", () => {
	// The kernel is a hand-inlined transcription of washColorAt + sunPositionAt, written
	// for speed. washColorAt is the tested spec, mirrored step for step against the app's
	// SkSL shader. If the two ever diverge, the mosque screen paints a different sky from
	// the phone in the reader's pocket and nothing else would catch it — so this sweeps
	// the whole frame at four instants and demands an exact match, channel by channel.
	for (const [label, stops] of [
		["light", washStopsLight],
		["dark", washStopsDark],
	] as const) {
		it(`reproduces washColorAt exactly across the frame (${label})`, () => {
			const fp = footprint();
			const texW = 61;
			const texH = 43;
			const out = new Uint8ClampedArray(texW * texH * 4);

			for (const iso of [
				"2026-09-12T17:10:00Z", // maghrib sweeping across Sweden
				"2026-09-12T03:30:00Z", // the dawn band, golden-hour kiss live
				"2026-06-21T23:00:00Z", // midnight sun over Kiruna
				"2026-12-21T12:00:00Z", // polar night over Kiruna
			]) {
				const date = new Date(iso);
				const { declRad, eotMin } = solarParams(date);
				const utcMin = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
				out.fill(0);
				bakeWashRows(out, texW, texH, 0, texH, fp, stops, declRad, eotMin, utcMin);

				for (let j = 0; j < texH; j++) {
					for (let i = 0; i < texW; i++) {
						const lat = invLat(fp, j, texH);
						const lon = invLon(fp, i, texW);
						const { altDeg, haDeg } = sunPositionAt(lat, lon, utcMin, declRad, eotMin);
						const [r, g, b, a] = washColorAt(altDeg, haDeg, stops);
						const k = (j * texW + i) * 4;
						const where = `${iso} lat ${lat.toFixed(2)} lon ${lon.toFixed(2)}`;
						expect([out[k], out[k + 1], out[k + 2], out[k + 3]], where).toEqual([
							r,
							g,
							b,
							Math.round(a * 255),
						]);
					}
				}
			}
		});
	}

	it("bakes only the rows it is given, so a slice can be spread over idle time", () => {
		const fp = footprint();
		const texW = 20;
		const texH = 10;
		const date = new Date("2026-09-12T17:10:00Z");
		const { declRad, eotMin } = solarParams(date);

		const whole = new Uint8ClampedArray(texW * texH * 4);
		bakeWashRows(whole, texW, texH, 0, texH, fp, washStopsLight, declRad, eotMin, 1030);

		const sliced = new Uint8ClampedArray(texW * texH * 4);
		for (let r = 0; r < texH; r += 3)
			bakeWashRows(
				sliced,
				texW,
				texH,
				r,
				Math.min(texH, r + 3),
				fp,
				washStopsLight,
				declRad,
				eotMin,
				1030,
			);

		expect(sliced, "a sliced bake must equal a whole one").toEqual(whole);
	});
});

function invLat(fp: WashFootprint, j: number, texH: number): number {
	const my = fp.myMin + ((j + 0.5) / texH) * (fp.myMax - fp.myMin);
	const t = Math.exp((0.5 - my) * 2 * Math.PI);
	return (2 * (Math.atan(t) - Math.PI / 4) * 180) / Math.PI;
}

function invLon(fp: WashFootprint, i: number, texW: number): number {
	return (fp.mxMin + ((i + 0.5) / texW) * (fp.mxMax - fp.mxMin)) * 360 - 180;
}
