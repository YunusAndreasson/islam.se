// What the map does when the network is not there.
//
// THE GAP THIS CLOSES. bonetider.tsx has always had a notice for a broken basemap, wired to
// `onDidFailLoadingMap`. That event means the STYLE failed to load — and this app's style is
// inline JSON built in lib/map/nordicStyle.ts, so there is nothing to fetch and nothing to
// fail. The common real failure is the opposite shape: the style loads perfectly and then
// every TILE, GLYPH and TileJSON request behind it fails, which fires no map event at all.
// Offline, the reader got the basemap's flat land, correct prayer lines floating on it, and
// no word about which half was broken.
//
// MapLibre does say so, just not through an event: mbgl logs every failed resource request,
// and the binding forwards its whole native log stream to JS (LogManager). So the notice can
// be driven by the logs instead — the only channel that sees a tile fail.
//
// ⚠️ THE LOG SHAPE IS PLATFORM-ASYMMETRIC, which is why the matching below reads the message
// and not the tag:
//   • Android — `tag` is MapLibre Android's logger tag ("Mbgl-HttpRequest"), from
//     MLRNLogModule.kt's LoggerDefinition.
//   • iOS — `tag` is the SOURCE FILE PATH of the mbgl call site (MLRNLogging.m passes
//     `filePath` straight through as the tag).
// The `message` is mbgl's own C++ format string on both, so it is the portable part.
//
// ⚠️ ONE HANDLER SLOT. LogManager.onLog stores a single handler, so a second watcher would
// silently replace the first. One screen owns this; keep it that way.
//
// ⚠️ WHAT THIS DOES *NOT* CATCH, measured on device (Android emulator, API 35, airplane mode
// on, panning into tiles that had never been fetched): NOTHING WAS LOGGED AT ALL. The bridge
// is fine — an unrelated mbgl error in the same session arrived in JS as
// `MapLibre Native [ERROR] [Mbgl-HttpRequest] …`, so the stream does carry mbgl's own logs on
// Android. There was simply no failure to hear: MapLibre Android watches the system's
// connectivity and DEFERS requests while the device is offline rather than letting them fail.
// The new tiles never arrived, nothing errored, and the log stream stayed quiet.
//
// So this watcher answers "the map's server is not answering" (an outage, an expired key, a
// captive portal, and on iOS also a plain offline device, whose NSURLSession fails the request
// instead of deferring it) — NOT "this phone has no network". Closing that last gap needs a
// connectivity signal we do not currently ship (expo-network / netinfo); until then, an
// Android user in flight mode still sees the old silence, and that is a known hole rather
// than a fixed one. Do not widen the copy to promise otherwise.
import { LogManager } from '@maplibre/maplibre-react-native';

// Which handler this module last installed into LogManager's single slot — see the
// unsubscribe in watchResourceFailures.
let installed: ((log: MapLogEvent) => boolean) | null = null;

/** One line of MapLibre Native's log stream, as the binding forwards it. */
export interface MapLogEvent {
  level: string;
  tag: string;
  message: string;
}

/**
 * True when a log line reports a map resource that could not be fetched — a vector tile, a
 * glyph range, a source's TileJSON, the DEM behind the hillshade.
 *
 * ⚠️ TWO WORDINGS, AND MISSING EITHER MAKES THIS SILENT. mbgl reports a broken map from two
 * layers, and they do not phrase it the same way. Both were read off a device:
 *
 *   [Mbgl-HttpRequest]  Request failed due to a connection error: …
 *   [Mbgl] [Style]      Failed to load tile 3/4/1=>3 for source terrain: HTTP status code 403
 *
 * The first is the HTTP layer giving up on a request; the second is the style layer being
 * told a resource will not arrive — which is what an expired key, a 404 host or a provider
 * outage actually produces. An earlier version of this matched only the first and would have
 * sat silent through a completely dead tile host.
 *
 * Cancellations are deliberately NOT failures: mbgl cancels in-flight requests whenever a
 * tile leaves the viewport, so every ordinary pan produces a handful of them. (The binding
 * downgrades that exact message from warn to info for the same reason.)
 */
export function isResourceFailureLog({ level, message }: MapLogEvent): boolean {
  if (level !== 'warn' && level !== 'error' && level !== 'fault') return false;
  const failed = /request failed/i.test(message) || /failed to load/i.test(message);
  if (!failed) return false;
  return !/cancel+ed/i.test(message);
}

/** Failures needed inside {@link TROUBLE_WINDOW_MS} before the reader is told. One failed
 *  tile is a transient 500 that MapLibre will quietly retry; a notice for it would flash on
 *  a working map. Offline, this many arrive in the same frame. */
export const TROUBLE_BURST = 3;

/** The sliding window the burst is counted in, and the silence that has to pass before a
 *  full render is trusted as recovery. */
export const TROUBLE_WINDOW_MS = 4000;

export interface TroubleBurst {
  /** Record a failure at `at` (ms epoch). True ONLY on the failure that completes a burst —
   *  the edge, not the state. During an outage MapLibre logs one failure per tile, glyph and
   *  TileJSON request, dozens per viewport; a predicate that stayed true would hand every one
   *  of them back to React at the exact moment the map is already struggling. */
  hit: (at: number) => boolean;
  /** Whether nothing has failed for a whole window as of `at` — i.e. a full render can be
   *  believed rather than being the renderer finishing a frame that has holes in it. */
  quiet: (at: number) => boolean;
  /** Forget the window. The caller calls this when it has acted on the burst and cleared its
   *  notice, so the NEXT outage can cross the threshold again from a clean slate. */
  clear: () => void;
}

/** Counts resource failures in a sliding window. Times are passed in rather than read from
 *  the clock, so the whole thing is testable without faking one. */
export function createTroubleBurst(
  threshold = TROUBLE_BURST,
  windowMs = TROUBLE_WINDOW_MS,
): TroubleBurst {
  // A plain array trimmed IN PLACE from the front: entries are pushed in time order, so
  // everything older than the window is a prefix. Rebuilding it with filter() on every
  // failure would allocate once per failed request — and failed requests are exactly what
  // arrives in floods.
  const recent: number[] = [];
  let announced = false;
  return {
    hit: (at) => {
      let drop = 0;
      while (drop < recent.length && at - (recent[drop] as number) >= windowMs) drop += 1;
      if (drop > 0) recent.splice(0, drop);
      recent.push(at);
      if (recent.length < threshold) return false;
      if (announced) return false;
      announced = true;
      return true;
    },
    quiet: (at) => recent.every((t) => at - t >= windowMs),
    clear: () => {
      recent.length = 0;
      announced = false;
    },
  };
}

/**
 * Watch MapLibre's native log stream for resource failures.
 *
 * @param onFailure Called with the failure's timestamp for every resource that could not be
 *   fetched. The caller decides what a run of them means (see createTroubleBurst).
 * @returns an unsubscribe. It restores a pass-through handler rather than removing one,
 *   because LogManager has no remove — the effect is the same: the binding goes back to its
 *   own console logging, which is what `false` asks for. It only does so if this watcher is
 *   STILL the installed one: two overlapping screens (a keyed remount runs the new effect
 *   before the old cleanup) would otherwise end with the survivor's handler blanked, leaving
 *   the notice permanently dead for the session with nothing to show for it.
 */
export function watchResourceFailures(onFailure: (at: number) => void): () => void {
  const handler = (log: MapLogEvent): boolean => {
    if (isResourceFailureLog(log)) onFailure(Date.now());
    // Never swallow the line: the binding's own console output is what makes a native
    // warning visible in development, and this watcher exists to add to it, not replace it.
    return false;
  };
  installed = handler;
  LogManager.onLog(handler);
  return () => {
    if (installed !== handler) return;
    installed = null;
    LogManager.onLog(() => false);
  };
}
