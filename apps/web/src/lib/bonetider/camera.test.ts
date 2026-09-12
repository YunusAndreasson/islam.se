import { describe, expect, it } from "vitest";
import {
	type BBox,
	type Camera,
	type CameraSchedule,
	cameraAround,
	cameraAt,
	cameraForBBox,
	DEFAULT_SCHEDULE,
	easeInOutCubic,
	lerpCamera,
	type Viewport,
	visibleBBox,
} from "./camera";
import { mercX, mercY } from "./map/projection";

/** The frame render-field.ts has always drawn. */
const VIEW_BBOX: BBox = [-8, 50, 30, 72];

/**
 * fitTransform exactly as render-field.ts computed it before the camera existed.
 * Copied rather than imported on purpose: this is the frozen reference the new path
 * has to reproduce, and importing the live one would make the test agree with
 * whatever the code currently does.
 */
function legacyFitTransform(w: number, h: number, padX: number, padTop: number, padBottom: number) {
	const [W, S, E, N] = VIEW_BBOX;
	const mxMin = mercX(W);
	const mxMax = mercX(E);
	const myMin = mercY(N);
	const myMax = mercY(S);
	const availW = w - 2 * padX;
	const availH = h - padTop - padBottom;
	const scale = Math.min(availW / (mxMax - mxMin), availH / (myMax - myMin));
	const ox = padX + (availW - (mxMax - mxMin) * scale) / 2;
	const oy = padTop + (availH - (myMax - myMin) * scale) / 2;
	return { scale, ox, oy, mxMin, myMin };
}

/** What render-field.ts will do with a Camera: fold the offset into the origin. */
function transformForCamera(cam: Camera, w: number, h: number) {
	return {
		scale: cam.scale,
		ox: 0,
		oy: 0,
		mxMin: cam.cx - w / 2 / cam.scale,
		myMin: cam.cy - h / 2 / cam.scale,
	};
}

const projX = (lon: number, t: { ox: number; mxMin: number; scale: number }): number =>
	t.ox + (mercX(lon) - t.mxMin) * t.scale;
const projY = (lat: number, t: { oy: number; myMin: number; scale: number }): number =>
	t.oy + (mercY(lat) - t.myMin) * t.scale;

describe("cameraForBBox reproduces the framing the site already ships", () => {
	// If this drifts, every one of the 2 128 city pages and the home hub silently
	// re-frame their map. The camera refactor is only safe because this is pinned.
	const cases: Array<[string, number, number, number, number, number]> = [
		// [label, w, h, padX, padTop, padBottom]
		["full card, no reserved band", 384, 480, 19.2, 19.2, 19.2],
		["home card, dock band reserved", 304, 380, 15.2, 15.2, 68.2],
		["wide screen panel", 864, 1080, 43.2, 43.2, 43.2],
		["tall and narrow", 300, 900, 15, 15, 15],
	];

	for (const [label, w, h, padX, padTop, padBottom] of cases) {
		it(label, () => {
			const legacy = legacyFitTransform(w, h, padX, padTop, padBottom);
			const camera = cameraForBBox(VIEW_BBOX, { w, h, padX, padTop, padBottom });
			const next = transformForCamera(camera, w, h);

			expect(next.scale).toBeCloseTo(legacy.scale, 10);
			// The origins differ (ox/oy folded in), so compare where points LAND —
			// which is the only thing the renderer actually depends on.
			const probes: Array<[number, number]> = [
				[-8, 50],
				[30, 72],
				[18.069, 59.329], // Stockholm
				[20.226, 67.856], // Kiruna
				[13.0, 55.605], // Malmö
			];
			for (const [lon, lat] of probes) {
				expect(projX(lon, next), `${label} x at ${lon}`).toBeCloseTo(projX(lon, legacy), 8);
				expect(projY(lat, next), `${label} y at ${lat}`).toBeCloseTo(projY(lat, legacy), 8);
			}
		});
	}

	it("puts the reserved band at the bottom, never under the silhouette", () => {
		// The asymmetric-padding term is easy to drop in a refactor and the failure is
		// subtle: the map slides down behind the home variant's floating readout.
		const vp: Viewport = { w: 304, h: 380, padX: 15.2, padTop: 15.2, padBottom: 68.2 };
		const cam = cameraForBBox(VIEW_BBOX, vp);
		const t = transformForCamera(cam, vp.w, vp.h);
		const bottomOfFrame = projY(50, t);
		expect(bottomOfFrame).toBeLessThanOrEqual(vp.h - vp.padBottom + 0.001);
	});
});

describe("camera geometry", () => {
	const vp: Viewport = { w: 864, h: 1080, padX: 0, padTop: 0, padBottom: 0 };

	it("centres the point exactly and spans about what it was asked for", () => {
		// Mercator cannot give both: it stretches northward, so a frame spanning exactly
		// lat ± half does not have lat at its middle. cameraAround chooses exact
		// centring — that is the promise the move makes to the room — and lets the
		// degree span give. The drift grows with latitude: ~0.5 % at Malmö, ~2.4 % at
		// Kiruna, which is the worst case anywhere the site has an ort.
		for (const lat of [55.6, 57.7, 65.6, 67.9]) {
			const cam = cameraAround(lat, 12.0, 10, vp);
			expect(cam.cy, `centre at ${lat}`).toBeCloseTo(mercY(lat), 12);
			const [, south, , north] = visibleBBox(cam, vp);
			expect(Math.abs(north - south - 10) / 10, `span drift at ${lat}`).toBeLessThan(0.03);
		}
	});

	it("keeps the mosque centred at every zoom", () => {
		for (const span of [6, 10, 24]) {
			const cam = cameraAround(65.58, 22.16, span, vp); // Luleå
			const [west, , east] = visibleBBox(cam, vp);
			expect((west + east) / 2, `span ${span}`).toBeCloseTo(22.16, 6);
		}
	});

	it("interpolates zoom geometrically, so the move reads as even", () => {
		// A linear blend would put the halfway camera at the arithmetic mean, which
		// lurches at one end and crawls at the other.
		const a: Camera = { cx: 0.5, cy: 0.3, scale: 100 };
		const b: Camera = { cx: 0.5, cy: 0.3, scale: 400 };
		expect(lerpCamera(a, b, 0.5).scale).toBeCloseTo(200, 8);
		expect(lerpCamera(a, b, 0).scale).toBeCloseTo(100, 8);
		expect(lerpCamera(a, b, 1).scale).toBeCloseTo(400, 8);
	});

	it("eases symmetrically and lands exactly on both ends", () => {
		expect(easeInOutCubic(0)).toBe(0);
		expect(easeInOutCubic(1)).toBe(1);
		expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 10);
		expect(easeInOutCubic(0.25) + easeInOutCubic(0.75)).toBeCloseTo(1, 10);
		// Clamped, because the tween is driven by a wall clock that can jump.
		expect(easeInOutCubic(-3)).toBe(0);
		expect(easeInOutCubic(9)).toBe(1);
	});
});

describe("the camera schedule", () => {
	const vp: Viewport = { w: 864, h: 1080, padX: 0, padTop: 0, padBottom: 0 };
	const schedule: CameraSchedule = {
		wide: cameraForBBox(VIEW_BBOX, vp),
		close: cameraAround(57.7, 12.0, 10, vp),
		...DEFAULT_SCHEDULE,
	};
	const asr = Date.UTC(2026, 8, 12, 13, 47);
	const at = (ms: number) => cameraAt(ms, asr, null, schedule);

	it("is wide for the great majority of the day", () => {
		expect(at(asr - 60 * 60_000).phase).toBe("wide");
		expect(at(asr - 11 * 60_000).phase).toBe("wide");
		expect(at(asr + 30 * 60_000).phase).toBe("wide");
	});

	it("is fully closed in before the prayer, not still moving at it", () => {
		// The point of the move is that the line's arrival is already framed when it
		// happens. Arriving mid-tween would make the moment about the animation.
		expect(at(asr).phase).toBe("close");
		expect(at(asr).camera).toEqual(schedule.close);
	});

	it("closes and opens through a complete, monotone move", () => {
		const start = asr - DEFAULT_SCHEDULE.leadInMs;
		expect(at(start - 1).u).toBe(0);
		expect(at(start + DEFAULT_SCHEDULE.tweenMs).u).toBe(1);
		let last = -1;
		for (let k = 0; k <= 20; k++) {
			const u = at(start + (k / 20) * DEFAULT_SCHEDULE.tweenMs).u;
			expect(u, "the close-in must never go backwards").toBeGreaterThanOrEqual(last);
			last = u;
		}
		const openEnd = asr + DEFAULT_SCHEDULE.holdAfterMs + DEFAULT_SCHEDULE.tweenMs;
		expect(at(openEnd + 1).phase).toBe("wide");
		expect(at(openEnd + 1).camera).toEqual(schedule.wide);
	});

	it("stays close between two prayers that sit near each other", () => {
		// Maghrib and ʿIshāʾ converge in a Swedish June, and Fajr and Shurūq sit minutes
		// apart for weeks. Pulling out and diving straight back would be motion for its
		// own sake at exactly the time of year the screen is watched most.
		const isha = asr + 14 * 60_000;
		const after = asr + DEFAULT_SCHEDULE.holdAfterMs + 1000;
		expect(cameraAt(after, asr, isha, schedule).phase).toBe("close");
		expect(cameraAt(after, asr, null, schedule).phase).toBe("opening");
	});

	it("is wide when there is no prayer left to look at", () => {
		expect(cameraAt(asr, null, null, schedule).phase).toBe("wide");
	});

	it("is a pure function of the clock, so a frozen screen resumes correctly", () => {
		// The wall runs for months. A throttled tab, an occluded window or an NTP
		// correction must resolve to the camera the clock says is right, not finish a
		// stale animation late — so asking twice for the same instant, in any order,
		// must give the same answer.
		const probes = [asr - 600_000, asr - 597_000, asr, asr + 900_000];
		const forwards = probes.map((t) => at(t).camera);
		const backwards = [...probes].reverse().map((t) => at(t).camera);
		expect(forwards).toEqual([...backwards].reverse());
	});
});
