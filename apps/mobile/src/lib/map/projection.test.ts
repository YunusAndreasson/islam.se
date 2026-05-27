// The Skia overlay only stays glued to the MapLibre basemap if this projection
// matches MapLibre's. These tests pin the contract: it round-trips, the camera
// centre lands at the viewport centre, the axes point the right way (north-up), and a
// real coordinate at the Sweden framing lands where the eye expects it.
import { describe, expect, it } from '@jest/globals';

import { type Camera, project, unproject, worldSize } from './projection';

// A plausible Sweden framing: centred on the country, zoomed so it fills a phone.
const SWEDEN_CAM: Camera = { lon: 17.4, lat: 62.1, zoom: 4, width: 390, height: 800 };

describe('projection', () => {
  it('places the camera centre at the viewport centre', () => {
    const p = project(SWEDEN_CAM.lon, SWEDEN_CAM.lat, SWEDEN_CAM);
    expect(p.x).toBeCloseTo(SWEDEN_CAM.width / 2, 6);
    expect(p.y).toBeCloseTo(SWEDEN_CAM.height / 2, 6);
  });

  it('round-trips project → unproject for points across Sweden', () => {
    const coords: [number, number][] = [
      [18.0686, 59.3293], // Stockholm
      [13.0038, 55.605], // Malmö
      [22.1547, 65.5848], // Luleå
      [11.9746, 57.7089], // Göteborg
      [20.2253, 67.8558], // Kiruna
    ];
    for (const [lon, lat] of coords) {
      const { x, y } = project(lon, lat, SWEDEN_CAM);
      const back = unproject(x, y, SWEDEN_CAM);
      expect(back.lon).toBeCloseTo(lon, 6);
      expect(back.lat).toBeCloseTo(lat, 6);
    }
  });

  it('is north-up: +lon moves right, +lat moves up (smaller y)', () => {
    const base = project(17.4, 62.1, SWEDEN_CAM);
    const east = project(18.4, 62.1, SWEDEN_CAM);
    const north = project(17.4, 63.1, SWEDEN_CAM);
    expect(east.x).toBeGreaterThan(base.x);
    expect(north.y).toBeLessThan(base.y);
  });

  it('scales with zoom: one zoom level doubles the world size', () => {
    expect(worldSize(5) / worldSize(4)).toBeCloseTo(2, 9);
    // A fixed lon/lat offset from centre projects twice as far at zoom+1.
    const z4 = project(20.4, 62.1, { ...SWEDEN_CAM, zoom: 4 });
    const z5 = project(20.4, 62.1, { ...SWEDEN_CAM, zoom: 5 });
    const dx4 = z4.x - SWEDEN_CAM.width / 2;
    const dx5 = z5.x - SWEDEN_CAM.width / 2;
    expect(dx5 / dx4).toBeCloseTo(2, 6);
  });

  it('keeps Stockholm on-screen and south-east of the country centre', () => {
    const sthlm = project(18.0686, 59.3293, SWEDEN_CAM);
    // South of centre (62.1°N) → below mid-screen; east of centre (17.4°E) → right of it.
    expect(sthlm.x).toBeGreaterThan(SWEDEN_CAM.width / 2);
    expect(sthlm.y).toBeGreaterThan(SWEDEN_CAM.height / 2);
  });
});
