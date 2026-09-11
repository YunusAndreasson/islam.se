// Data layer for the mosque map layer. The committed JSON (./data.json) is vendored
// from the web app's canonical source of truth (apps/web/src/data/moskeer-sverige.json,
// kept in sync via `pnpm sync:data`). Everything here is pure so it drops straight
// into the SymbolLayer source, the detail card, and tests — mirroring the shape of
// ../places/data.ts and the pure helpers in apps/web/src/lib/moskeer/index.ts.
//
// Every mosque is geocoded. The dataset deliberately carries NO denomination /
// sect field (the web omits it as a speculative guess) and no phone/website — the only
// outbound action is directions, derived from the coordinates (see ./directions.ts).
import mosquesRaw from './data.json';
import type { LonLat } from '@/lib/coordinates';
import { nearestHit } from '@/lib/map/nearestHit';

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
 * Which mosque a tap on the map meant: the NEAREST hit, never `features[0]` — see
 * nearestHit for the bug that rule fixes.
 *
 * @param features The features MapLibre hit-tested, from the source's press event.
 * @param at The touch point, `[lon, lat]` — `event.nativeEvent.lngLat`.
 */
export function mosqueForPress(
  features: readonly GeoJSON.Feature[] | undefined,
  at: LonLat,
): Mosque | undefined {
  return nearestHit(features, at, BY_ID);
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
export function locationLabel(m: Pick<Mosque, 'kommun' | 'lan'>): string {
  return `${m.kommun} · ${lanDisplay(m.lan)}`;
}

/** A bare house number, with or without an entrance letter: "12", "4c", "11B", "18 h". */
const HOUSE_NUMBER = /^\d+\s*[A-Za-z]?$/;
/** A Swedish postal code left dangling at the end of a comma-less address. */
const TRAILING_POSTCODE = /\s+\d{3}\s?\d{2}$/;
/** How many parts of the address the card prints — the street, and at most the district
 *  around it. Past two the chain is administrative geography, and the card already says
 *  which kommun and län this is. */
const ADDRESS_PARTS = 2;

/**
 * The street, for the detail card — "Fridhemsgatan 21, Högadal".
 *
 * WHY THIS IS NOT JUST `m.address`. The card named the mosque, its kommun and its län, and
 * a reader standing on a pavement asking "is this the one?" could not see the street. The
 * dataset has had it all along (221 of 234 records), unrendered, because it arrives from
 * OpenStreetMap as a comma-separated chain in reverse-Swedish order with the administrative
 * tail attached: "21, Fridhemsgatan, Högadal, Karlshamn". Printed raw that reads as a
 * different kind of thing to every other line on the card, and repeats the kommun sitting
 * directly under it.
 *
 * So four rules, each earning itself against the real 234 records:
 *
 *   1. Drop trailing parts that repeat `city` or `kommun` — the card says that already.
 *   2. Fold a bare house number onto the street that follows it, the way Swedish writes an
 *      address. A number with no street after it is DROPPED: one record is a whole entrance
 *      range, "1, 3, 5, 7, … 23, Sikvägen, Bollmora", and pairing blindly turned it into
 *      the nonsense "3 1, 7 5" before this clause existed.
 *   3. Keep at most ADDRESS_PARTS. Some records lead with the building's own name
 *      ("Tullportens konditori, 10B, Storgatan, …"), which is worth keeping; the four
 *      administrative levels after the street are not.
 *   4. Strip a trailing city or postal code that never had a comma in front of it — a third
 *      of the records are hand-entered as one string, "Sockerbruksgatan 11 Lidköping", and
 *      rule 1 cannot see a part that was never separated.
 *
 * Returns null when the dataset has nothing, which is 13 of the 234 — the card then simply
 * does not show the line, as it already does for `opened` and `organisation`.
 */
export function formatMosqueAddress(m: Mosque): string | null {
  const raw = m.address?.trim();
  if (!raw) return null;

  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  const tails = [m.city, m.kommun].filter(Boolean).map((t) => t.toLowerCase());
  while (parts.length > 0 && tails.includes(parts[parts.length - 1]!.toLowerCase())) parts.pop();

  const folded: string[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]!;
    if (!HOUSE_NUMBER.test(part)) {
      folded.push(part);
      continue;
    }
    const street = parts[i + 1];
    // Only fold onto something that can BE a street. See rule 2.
    if (street != null && !HOUSE_NUMBER.test(street)) {
      folded.push(`${street} ${part.replace(/\s+/g, '')}`);
      i += 1;
    }
  }

  let line = folded.slice(0, ADDRESS_PARTS).join(', ');
  for (const tail of tails) {
    if (line.toLowerCase().endsWith(` ${tail}`)) line = line.slice(0, -(tail.length + 1));
  }
  line = line.replace(TRAILING_POSTCODE, '').replace(/[\s,]+$/, '');
  return line || null;
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
