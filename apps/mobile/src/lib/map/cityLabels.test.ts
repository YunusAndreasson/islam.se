// Reproduces MapLibre's symbol-collision behaviour for the RN label overlay: big
// cities win a crowded view, smaller ones drop their label rather than overlap, and
// off-screen labels are culled. If this regresses, the night map gets a tangle of
// overlapping city names — the exact mess the tile labels were avoiding.
import { describe, expect, it } from '@jest/globals';

import { type LabelCandidate, placeCityLabels } from './cityLabels';

const FONT = (rank: number) => (rank === 1 ? 16 : rank === 2 ? 13 : 11);
const OPTS = { width: 400, height: 800, fontSizeForRank: FONT };

describe('placeCityLabels', () => {
  it('keeps well-separated labels', () => {
    const cands: LabelCandidate[] = [
      { name: 'Stockholm', rank: 1, x: 100, y: 100 },
      { name: 'Göteborg', rank: 1, x: 300, y: 600 },
    ];
    const placed = placeCityLabels(cands, OPTS);
    expect(placed.map((p) => p.name).sort()).toEqual(['Göteborg', 'Stockholm']);
  });

  it('drops the lower-priority label when two collide (higher rank wins)', () => {
    // Same spot: the rank-1 city must keep its label, the rank-3 one must drop it.
    const cands: LabelCandidate[] = [
      { name: 'Lund', rank: 3, x: 200, y: 400 },
      { name: 'Malmö', rank: 1, x: 205, y: 402 },
    ];
    const placed = placeCityLabels(cands, OPTS);
    expect(placed.map((p) => p.name)).toEqual(['Malmö']);
  });

  it('culls a label whose box is fully off-screen', () => {
    const cands: LabelCandidate[] = [
      { name: 'Visby', rank: 3, x: 999, y: 400 }, // far right of a 400-wide viewport
      { name: 'Umeå', rank: 2, x: 200, y: 300 },
    ];
    const placed = placeCityLabels(cands, OPTS);
    expect(placed.map((p) => p.name)).toEqual(['Umeå']);
  });

  it('places the label below the dot and centres it horizontally', () => {
    const placed = placeCityLabels([{ name: 'Umeå', rank: 2, x: 200, y: 300 }], OPTS);
    const u = placed[0];
    expect(u.top).toBeGreaterThan(300); // below the dot
    expect(u.left + u.width / 2).toBeCloseTo(200, 5); // centred on the dot's x
  });

  it('is deterministic regardless of input order', () => {
    const a: LabelCandidate[] = [
      { name: 'Malmö', rank: 1, x: 205, y: 402 },
      { name: 'Lund', rank: 3, x: 200, y: 400 },
    ];
    const b = [...a].reverse();
    expect(placeCityLabels(a, OPTS).map((p) => p.name)).toEqual(
      placeCityLabels(b, OPTS).map((p) => p.name),
    );
  });
});
