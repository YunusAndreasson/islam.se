// Data layer for the mosque map layer. The committed JSON (./data.json) is vendored
// from the web app's canonical source of truth (apps/web/src/data/moskeer-sverige.json,
// kept in sync via `pnpm sync:mosques`). Everything here is pure so it drops straight
// into the SymbolLayer source, the detail card, and tests — mirroring the shape of
// ../places/data.ts and the pure helpers in apps/web/src/lib/moskeer/index.ts.
//
// Every mosque is geocoded. The dataset deliberately carries NO denomination /
// sect field (the web omits it as a speculative guess) and no phone/website — the only
// outbound action is directions, derived from the coordinates (see ./directions.ts).
import mosquesRaw from './data.json';
import type { LonLat } from '@/lib/coordinates';
import { haversineKm } from '@/lib/places/nearest';

export interface Mosque {
  readonly id: string;
  readonly name: string;
  readonly lat: number;
  /** Longitude. Note the field is `lng` (matches the vendored web JSON), not `lon`. */
  readonly lng: number;
  readonly city: string;
  /** Bönetider place slug for this mosque's city — pairs 1:1 with /bonetider/[stad]. */
  readonly citySlug: string;
  readonly kommun: string;
  /** Län, short form (e.g. "Stockholm"). Use lanDisplay() for the proper UI name. */
  readonly lan: string;
  readonly opened?: number;
  readonly organisation?: string;
  readonly address?: string;
  readonly postalCode?: string;
}

const MOSQUES: readonly Mosque[] = mosquesRaw;

export function getMosques(): readonly Mosque[] {
  return MOSQUES;
}

const BY_ID = new Map<string, Mosque>(MOSQUES.map((m) => [m.id, m]));

export function mosqueById(id: string): Mosque | undefined {
  return BY_ID.get(id);
}

/**
 * Which mosque a tap on the map meant.
 *
 * THE BUG THIS FIXES: MosqueLayer used to take `features[0]`, and MapLibre's hit test
 * returns EVERY feature whose rendered symbol meets a box around the touch point — in
 * whatever order the query produced them, which is not distance order. So in Malmö (twelve
 * mosques) or Rinkeby–Tensta, a tap could open a card for a mosque a centimetre from the
 * finger rather than the one under it, and the two are indistinguishable to the reader: the
 * card is confident, and the only clue is a name they did not aim at. The wider the hitbox
 * the more often it happened, and at the zoom where the glyphs first appear the box covers
 * kilometres of ground.
 *
 * The press event already carries where the finger actually landed, so the nearest hit is
 * simply the right answer. Ties (two mosques at the same coordinates — the dataset has near
 * duplicates, see the sync guard's 150 m warning) keep the first, which is source order and
 * therefore stable.
 *
 * @param features The features MapLibre hit-tested, from the source's press event.
 * @param at The touch point, `[lon, lat]` — `event.nativeEvent.lngLat`.
 */
export function mosqueForPress(
  features: readonly GeoJSON.Feature[] | undefined,
  at: LonLat,
): Mosque | undefined {
  if (!features?.length) return undefined;
  let best: Mosque | undefined;
  let bestKm = Number.POSITIVE_INFINITY;
  for (const feature of features) {
    const id = feature.properties?.id;
    if (typeof id !== 'string') continue;
    const mosque = BY_ID.get(id);
    if (!mosque) continue;
    // Measured against the MOSQUE's own coordinates, not the feature geometry's: they are
    // the same point (toFeatureCollection builds one from the other) and this way a
    // malformed or clustered geometry cannot decide which card opens.
    const km = haversineKm(at[1], at[0], mosque.lat, mosque.lng);
    if (km < bestKm) {
      bestKm = km;
      best = mosque;
    }
  }
  return best;
}

// Short county form (from the GeoNames spine) → the proper Swedish län name. Kept
// explicit to avoid brittle genitive-suffix guessing ("Skåne län", not "Skånes län").
// Mirrors LAN_DISPLAY in apps/web/src/lib/moskeer/index.ts.
const LAN_DISPLAY: Record<string, string> = {
  Stockholm: 'Stockholms län',
  Uppsala: 'Uppsala län',
  Södermanland: 'Södermanlands län',
  Östergötland: 'Östergötlands län',
  Jönköping: 'Jönköpings län',
  Kronoberg: 'Kronobergs län',
  Kalmar: 'Kalmar län',
  Gotland: 'Gotlands län',
  Blekinge: 'Blekinge län',
  Skåne: 'Skåne län',
  Halland: 'Hallands län',
  'Västra Götaland': 'Västra Götalands län',
  Värmland: 'Värmlands län',
  Örebro: 'Örebro län',
  Västmanland: 'Västmanlands län',
  Dalarna: 'Dalarnas län',
  Gävleborg: 'Gävleborgs län',
  Västernorrland: 'Västernorrlands län',
  Jämtland: 'Jämtlands län',
  Västerbotten: 'Västerbottens län',
  Norrbotten: 'Norrbottens län',
};

export function lanDisplay(county: string): string {
  return LAN_DISPLAY[county] ?? `${county} län`;
}

/** Where the mosque is, for the detail card: "Botkyrka · Stockholms län". */
export function locationLabel(m: Mosque): string {
  return `${m.kommun} · ${lanDisplay(m.lan)}`;
}

/** A short distance for the detail card, Swedish-formatted. Finer-grained than the
 *  qibla screen's whole-km formatKm because mosques are often close: metres under a
 *  km ("480 m"), one decimal under 10 km ("2,3 km"), whole km beyond ("42 km"). */
export function formatMosqueDistance(km: number): string {
  if (km < 0.95) return `${Math.round((km * 1000) / 10) * 10} m`;
  if (km < 10) {
    return `${km.toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
  }
  return `${Math.round(km).toLocaleString('sv-SE')} km`;
}

export interface MosqueFeatureCollection {
  type: 'FeatureCollection';
  features: {
    type: 'Feature';
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties: { id: string; name: string; sort: number };
  }[];
}

/** Placement rank for mosques with no recorded opening year — sorts them behind every
 *  dated one. Past any real year in the set (1977–2026) and past any plausible future
 *  addition, so a new mosque never lands after the undated tail by accident. */
export const UNDATED_SORT = 9999;

/** GeoJSON for the MapLibre symbol layer source. Properties stay lean — id, name (the
 *  name doubles as the deep-zoom label) and `sort`; heavy per-mosque detail is looked up
 *  by id on tap.
 *
 *  ⚠️ `sort` is not decoration. MosqueLayer's glyph layer runs with
 *  icon-allow-overlap: false, and the style spec's default symbol-z-order ("auto") only
 *  sorts by viewport y when an allow-overlap is TRUE — otherwise symbols are placed in
 *  SOURCE order. data.json is ordered by län then name, so without a sort key, which of
 *  Malmö's twelve mosques survives the collision was decided by county spelling. Feeding
 *  this into symbol-sort-key ("features with lower sort keys are drawn and placed first")
 *  makes an established, dated mosque outrank an undated one — and, more importantly,
 *  makes the surviving set stable instead of incidental. */
export function toFeatureCollection(
  mosques: readonly Mosque[] = MOSQUES,
): MosqueFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: mosques.map((m) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [m.lng, m.lat] },
      properties: { id: m.id, name: m.name, sort: m.opened ?? UNDATED_SORT },
    })),
  };
}
