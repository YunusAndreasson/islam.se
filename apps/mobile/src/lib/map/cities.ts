// Curated major Swedish cities (+ a few neighbouring capitals for orientation),
// rendered as a map overlay. We DON'T rely on the vector tiles for these: the
// OpenMapTiles `place` layer only carries a city once its rank earns that zoom, so
// at the country overview the tiles ship ONLY the capital (Stockholm) — every other
// Swedish city is absent. This curated set shows the larger cities at every zoom,
// styled Swedish-first (accent) vs. foreign (muted), and drawn ABOVE the solar wash
// so the markers stay legible even on the night map.
import type { FeatureCollection } from 'geojson';

export interface CityPoint {
  name: string;
  lon: number;
  lat: number;
  /** 1 = the big three, 2 = regional centres, 3 = smaller cities. */
  rank: number;
  foreign?: boolean;
}

export const CITY_POINTS: readonly CityPoint[] = [
  { name: 'Stockholm', lon: 18.0686, lat: 59.3293, rank: 1 },
  { name: 'Göteborg', lon: 11.9746, lat: 57.7089, rank: 1 },
  { name: 'Malmö', lon: 13.0038, lat: 55.605, rank: 1 },
  { name: 'Uppsala', lon: 17.6389, lat: 59.8586, rank: 2 },
  { name: 'Västerås', lon: 16.5448, lat: 59.6099, rank: 2 },
  { name: 'Örebro', lon: 15.2066, lat: 59.2741, rank: 2 },
  { name: 'Linköping', lon: 15.6216, lat: 58.4109, rank: 2 },
  { name: 'Helsingborg', lon: 12.6945, lat: 56.0465, rank: 2 },
  { name: 'Norrköping', lon: 16.1924, lat: 58.5877, rank: 2 },
  { name: 'Jönköping', lon: 14.1618, lat: 57.7826, rank: 2 },
  { name: 'Umeå', lon: 20.263, lat: 63.8258, rank: 2 },
  { name: 'Luleå', lon: 22.1547, lat: 65.5848, rank: 2 },
  { name: 'Gävle', lon: 17.1413, lat: 60.6749, rank: 3 },
  { name: 'Sundsvall', lon: 17.3069, lat: 62.3908, rank: 3 },
  { name: 'Östersund', lon: 14.6357, lat: 63.1792, rank: 3 },
  { name: 'Karlstad', lon: 13.5036, lat: 59.3793, rank: 3 },
  { name: 'Växjö', lon: 14.8091, lat: 56.8777, rank: 3 },
  { name: 'Lund', lon: 13.191, lat: 55.7047, rank: 3 },
  { name: 'Halmstad', lon: 12.8578, lat: 56.6745, rank: 3 },
  { name: 'Visby', lon: 18.2948, lat: 57.6348, rank: 3 },
  { name: 'Kiruna', lon: 20.2253, lat: 67.8558, rank: 3 },
  // Neighbouring capitals — orientation only, drawn muted.
  { name: 'Oslo', lon: 10.7522, lat: 59.9139, rank: 2, foreign: true },
  { name: 'Köpenhamn', lon: 12.5683, lat: 55.6761, rank: 2, foreign: true },
  { name: 'Helsingfors', lon: 24.9384, lat: 60.1699, rank: 2, foreign: true },
];

export const CITY_GEOJSON: FeatureCollection = {
  type: 'FeatureCollection',
  features: CITY_POINTS.map((c) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
    properties: { name: c.name, rank: c.rank, foreign: c.foreign ? 1 : 0 },
  })),
};
