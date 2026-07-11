// Data layer for the mosque map layer. The committed JSON (./data.json) is vendored
// from the web app's canonical source of truth (apps/web/src/data/moskeer-sverige.json,
// kept in sync via `pnpm sync:mosques`). Everything here is pure so it drops straight
// into the SymbolLayer source, the detail card, and tests — mirroring the shape of
// ../places/data.ts and the pure helpers in apps/web/src/lib/moskeer/index.ts.
//
// 255 mosques, every one geocoded. The dataset deliberately carries NO denomination /
// sect field (the web omits it as a speculative guess) and no phone/website — the only
// outbound action is directions, derived from the coordinates (see ./directions.ts).
import mosquesRaw from './data.json';

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

const MOSQUES = mosquesRaw as unknown as readonly Mosque[];

export function getMosques(): readonly Mosque[] {
  return MOSQUES;
}

const BY_ID = new Map<string, Mosque>(MOSQUES.map((m) => [m.id, m]));

export function mosqueById(id: string): Mosque | undefined {
  return BY_ID.get(id);
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
    properties: { id: string; name: string };
  }[];
}

/** GeoJSON for the MapLibre SymbolLayer source. Properties stay lean — just id + name
 *  (the name doubles as the deep-zoom label); heavy per-mosque detail is looked up by
 *  id on tap. Mirrors toFeatureCollection() in apps/web/src/lib/moskeer/index.ts. */
export function toFeatureCollection(
  mosques: readonly Mosque[] = MOSQUES,
): MosqueFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: mosques.map((m) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [m.lng, m.lat] },
      properties: { id: m.id, name: m.name },
    })),
  };
}
