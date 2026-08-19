// Keeping the basemap on the phone, so it is not re-fetched every time.
//
// Bönetider is read where the network often is not: a mosque basement, a train through
// Norrland, a phone in flight mode. The prayer times survive that perfectly — they are
// computed on device — but the map under them is fetched at runtime, so without help the
// reader gets flat land and correct prayer lines floating on nothing.
//
// MapLibre offers two different answers, and only one of them is ours to take unilaterally.
//
// ── 1. THE AMBIENT CACHE (what this module does) ─────────────────────────────────────────
// Every tile, glyph and TileJSON MapLibre fetches is already stored in its own database
// (files/mbgl-offline.db) and served from there next time. It is an LRU with a size cap, and
// the cap is the whole point: at mbgl's default the country view a daily reader opens into
// competes for room with every city they have ever panned across, and loses. Raising it is a
// single call with no UI, no download, no prompt — and no licensing question, because keeping
// what you fetched while you looked at it is ordinary caching, which every tile provider
// permits. That is why it is the default answer here rather than a feature.
//
// ── 2. AN OFFLINE PACK (deliberately NOT implemented — read before trying again) ──────────
// A pack pre-downloads a bounding box and zoom band and pins it permanently. Two things stop
// it, and both were established on a device rather than reasoned about:
//
//   • IT NEEDS A STYLE THE NETWORK STACK CAN FETCH. OfflineManager.createPack takes a style
//     URL, not a style object — mbgl walks the document itself to discover what to download —
//     and ours is built in JS (./nordicStyle). The obvious bridge, writing it to the app's
//     own storage and passing a file:// URL, DOES NOT WORK on Android: the pack is created,
//     reports state "active", and then sits at 0 of 1 resources forever while logcat repeats
//
//         E Mbgl-HttpRequest: [HTTP] Unable to parse resourceUrl file:///data/user/0/…json
//
//     MapLibre Android's file source is OkHttp-based and rejects the scheme outright. So a
//     pack needs the style published at an http(s) URL — a second copy of a document whose
//     single source of truth is currently one TypeScript function, with all the drift that
//     invites. That is an infrastructure decision, not a code change.
//   • LICENSING IS NOT OURS TO ASSUME. Storing a provider's tiles permanently is a different
//     thing from caching them while you look at them. OpenFreeMap invites copying and
//     self-hosting; MapTiler treats permanent offline storage as a licensed feature. A build
//     carrying EXPO_PUBLIC_MAPTILER_KEY must not quietly ship one.
import { OfflineManager } from '@maplibre/maplibre-react-native';

/**
 * How much basemap the app is willing to keep.
 *
 * Sized against what it is FOR, and no larger: the whole-country framing the app opens in,
 * plus the handful of regions and cities a reader returns to. Sweden's vector tiles from the
 * national view down to regional zoom are a few tens of megabytes, and the glyph ranges
 * behind every label are a surprisingly large share of that — so twice mbgl's own 50 MB
 * default keeps a habitual reader's map resident instead of re-fetching it on every launch.
 *
 * This IS storage taken on the reader's behalf without asking, so it is deliberately a
 * ceiling rather than a target: MapLibre only ever stores what the reader has actually
 * looked at, and evicts least-recently-used within it. If it ever grows past this, it wants
 * a size read-out and a clear action in Inställningar — the way every other decision made on
 * the reader's behalf is surfaced there — not a bigger constant.
 */
export const AMBIENT_CACHE_BYTES = 96 * 1024 * 1024;

/**
 * Give the basemap cache room to be useful. Idempotent and safe to call on every mount.
 *
 * Deliberately swallows its error: this is an optimisation, and a phone that refuses it (no
 * disk, a locked database) must still show a map. Returns whether the cap was applied, so a
 * caller that wants to know can ask.
 */
export async function ensureBasemapCache(bytes = AMBIENT_CACHE_BYTES): Promise<boolean> {
  try {
    await OfflineManager.setMaximumAmbientCacheSize(bytes);
    return true;
  } catch {
    return false;
  }
}
