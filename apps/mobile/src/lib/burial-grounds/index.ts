// Data layer for the burial-ground map layer — the Muslim sections (muslimska gravkvarter)
// of Swedish cemeteries. ./data.json is a GENERATED MIRROR of the web app's canonical,
// hand-curated list (apps/web/src/data/begravningsplatser-sverige.json), copied by
// `pnpm sync:data`; never edit it here. Everything below is pure, like ../mosques, so it
// drops straight into the layer source, the card and the tests.
//
// A record is one cemetery with a part set aside for Muslim burial — nearly always a kvarter
// inside a general begravningsplats, which is how Sweden meets begravningslagen 2 kap. 2 §.
// Every record carries the `source` page that confirms the section exists; see the web
// module (apps/web/src/lib/begravningsplatser) for what does and does not get listed.
import burialGroundsRaw from './data.json';
import type { LonLat } from '@/lib/coordinates';
import { nearestHit } from '@/lib/map/nearestHit';

export interface BurialGround {
  readonly id: string;
  /** The cemetery as its huvudman names it: "Kvibergs kyrkogård". */
  readonly name: string;
  /** The Muslim part, when the huvudman names or numbers it: "Kvarter 18". */
  readonly section?: string;
  readonly lat: number;
  /** Longitude. `lng`, matching the web JSON and the mosque records. */
  readonly lng: number;
  readonly city: string;
  readonly citySlug: string;
  readonly kommun: string;
  /** Län, short form (e.g. "Stockholm"). Use lanDisplay() for the proper UI name. */
  readonly lan: string;
  /** Year the Muslim section was taken into use, when a source states it. */
  readonly opened?: number;
  readonly address?: string;
  /** The huvudman's (or local news') page confirming the section — the card links it,
   *  because it is also where opening hours and a phone number live. */
  readonly source: string;
}

const BURIAL_GROUNDS: readonly BurialGround[] = burialGroundsRaw;

const BY_ID = new Map<string, BurialGround>(BURIAL_GROUNDS.map((b) => [b.id, b]));

export function getBurialGrounds(): readonly BurialGround[] {
  return BURIAL_GROUNDS;
}

export function burialGroundById(id: string): BurialGround | undefined {
  return BY_ID.get(id);
}

/** Which burial ground a tap meant: the nearest hit, for the reason nearestHit documents. */
export function burialGroundForPress(
  features: readonly GeoJSON.Feature[] | undefined,
  at: LonLat,
): BurialGround | undefined {
  return nearestHit(features, at, BY_ID);
}

/** The line under the cemetery's name. Most huvudmän give the section no name of its own,
 *  and an empty line there read as missing data rather than as "the Muslim part of this". */
export function sectionLabel(b: BurialGround): string {
  return b.section ?? 'Muslimskt gravkvarter';
}

export interface BurialGroundFeatureCollection {
  type: 'FeatureCollection';
  features: {
    type: 'Feature';
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties: { id: string; name: string };
  }[];
}

/** GeoJSON for the layer source. Lean — id, and the name that doubles as the deep-zoom
 *  label; the card looks the rest up by id. No sort key, unlike the mosques: burial grounds
 *  sit far enough apart that the collision pass never has to choose between two of them. */
export function toFeatureCollection(
  grounds: readonly BurialGround[] = BURIAL_GROUNDS,
): BurialGroundFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: grounds.map((b) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [b.lng, b.lat] },
      properties: { id: b.id, name: b.name },
    })),
  };
}
