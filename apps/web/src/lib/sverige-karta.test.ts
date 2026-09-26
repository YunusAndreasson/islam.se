import { describe, expect, it } from "vitest";
import { getBurialGrounds } from "./begravningsplatser";
import { getMosques } from "./moskeer";
import { dotsPath, KARTA_HEIGHT, KARTA_WIDTH, outlinePath, project } from "./sverige-karta";

// The front page's map is three path strings written as compactly as SVG allows —
// relative moves, an implicit repeated `l`, a minus sign doing a separator's job. A
// mistake in that encoding does not throw; it draws a mosque in the Baltic. So the
// strings are decoded here, the way a renderer would, and checked against the data.

/** Decode the subset of path data this module writes: M m l h z, with implicit
 *  repetition of l after a move. Returns one list of absolute points per subpath. */
function decode(d: string): [number, number][][] {
	const tokens = d.match(/[MmlLhHzZ]|-?(?:\d+\.?\d*|\.\d+)/g) ?? [];
	const subpaths: [number, number][][] = [];
	let cmd = "";
	const pos = { x: 0, y: 0 };
	let i = 0;
	const next = () => Number(tokens[i++]);
	const step = (rel: boolean, dx: number, dy: number | null) => {
		pos.x = rel ? pos.x + dx : dx;
		if (dy !== null) pos.y = rel ? pos.y + dy : dy;
	};
	while (i < tokens.length) {
		const t = tokens[i] as string;
		if (/[a-zA-Z]/.test(t)) {
			cmd = t;
			i++;
			continue;
		}
		const rel = cmd === cmd.toLowerCase();
		const kind = cmd.toLowerCase();
		if (kind === "h") step(rel, next(), null);
		else step(rel, next(), next());
		if (kind === "m") {
			subpaths.push([[pos.x, pos.y]]);
			cmd = rel ? "l" : "L";
		} else if (kind === "l" || kind === "h") {
			subpaths.at(-1)?.push([pos.x, pos.y]);
		} else {
			throw new Error(`unexpected number ${t} after ${cmd}`);
		}
	}
	return subpaths;
}

const inside = ([x, y]: [number, number]) =>
	x >= -0.05 && x <= KARTA_WIDTH + 0.05 && y >= -0.05 && y <= KARTA_HEIGHT + 0.05;

describe("projection", () => {
	it("puts north up and east right", () => {
		const [, yNorth] = project(18, 68);
		const [, ySouth] = project(18, 56);
		const [xWest] = project(12, 60);
		const [xEast] = project(20, 60);
		expect(yNorth, "Kiruna's latitude must draw ABOVE Malmö's (smaller y)").toBeLessThan(ySouth);
		expect(xEast, "a larger longitude must draw further right").toBeGreaterThan(xWest);
	});

	it("keeps Sweden's proportions instead of drawing it twice as wide", () => {
		// Unscaled longitude would give ~1.04; cos(62°) scaling gives the real ~2.2.
		const aspect = KARTA_HEIGHT / KARTA_WIDTH;
		expect(
			aspect,
			`height/width is ${aspect.toFixed(2)}; Sweden is ~2.2 times taller than wide`,
		).toBeGreaterThan(2);
		expect(aspect).toBeLessThan(2.5);
	});
});

describe.each([
	["mosque", getMosques()],
	["burial ground", getBurialGrounds()],
] as const)("%s points", (kind, points) => {
	const d = dotsPath(points);
	const decoded = decode(d);

	it("are one subpath per record, each a zero-length dot", () => {
		expect(decoded.length, `${points.length} ${kind}s must draw ${points.length} dots`).toBe(
			points.length,
		);
		for (const sub of decoded) {
			expect(sub.length, "a dot is a move plus one zero-length h0 — nothing else").toBe(2);
			expect(sub[0]).toEqual(sub[1]);
		}
	});

	it("decode back to where the data puts them, inside the map", () => {
		points.forEach((p, i) => {
			const [ex, ey] = project(p.lng, p.lat);
			const [x, y] = decoded[i]?.[0] ?? [Number.NaN, Number.NaN];
			// Relative moves between rounded positions: never more than one rounding step off.
			expect(Math.abs(x - ex), `${kind} ${p.id} drifted in x`).toBeLessThan(0.11);
			expect(Math.abs(y - ey), `${kind} ${p.id} drifted in y`).toBeLessThan(0.11);
			expect(
				inside([x, y]),
				`${kind} ${p.id} (${p.lat}, ${p.lng}) falls outside the map of Sweden`,
			).toBe(true);
		});
	});
});

describe("outline", () => {
	const rings = decode(outlinePath());

	it("draws the three landmasses the outline keeps: mainland, Gotland, Öland", () => {
		expect(rings.length).toBe(3);
	});

	it("stays inside the map, and simplification leaves every landmass a shape", () => {
		for (const ring of rings) {
			for (const p of ring)
				expect(inside(p), `outline vertex ${p} lies outside the viewBox`).toBe(true);
			// Öland is ~2 units across here; five vertices is still an island, three is a triangle.
			expect(
				ring.length,
				"a simplified island still needs a shape, not a triangle",
			).toBeGreaterThanOrEqual(5);
		}
		const mainland = Math.max(...rings.map((r) => r.length));
		expect(
			mainland,
			"the mainland coast lost its bays and capes to over-simplification",
		).toBeGreaterThan(100);
	});

	it("is simplified for the size it is drawn at, not shipped at survey detail", () => {
		const d = outlinePath();
		expect(
			d.length,
			`outline path is ${d.length} bytes; the map is meant to be a few kB inline`,
		).toBeLessThan(4000);
	});
});
