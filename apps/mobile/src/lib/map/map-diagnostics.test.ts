// THE GAP THESE GUARD: offline, the basemap's style loads fine (it is inline JSON) and then
// every tile behind it fails, which fires no map event at all — so the screen showed flat
// land, correct prayer lines, and no word about which half was broken. MapLibre's native log
// stream is the only channel that sees a tile fail, and these pin the reading of it.
import { describe, expect, it, jest } from '@jest/globals';
import { LogManager } from '@maplibre/maplibre-react-native';

import {
  createTroubleBurst,
  isResourceFailureLog,
  TROUBLE_BURST,
  TROUBLE_WINDOW_MS,
  watchResourceFailures,
} from './map-diagnostics';

/** The mocked LogManager in jest.setup keeps the handler and can replay a line. */
const logs = LogManager as unknown as { __emit: (log: object) => void };

describe('isResourceFailureLog', () => {
  // The message is mbgl's own C++ format string and is the same on both platforms. The TAG
  // is not: Android sends MapLibre's logger tag ("Mbgl-HttpRequest"), iOS sends the source
  // file path of the log call. Matching on the tag would work on exactly one platform.
  it('reads a failed tile fetch on either platform', () => {
    expect(
      isResourceFailureLog({
        level: 'warn',
        tag: 'Mbgl-HttpRequest',
        message: 'Request failed due to a connection error: Unable to resolve host',
      }),
    ).toBe(true);

    expect(
      isResourceFailureLog({
        level: 'warn',
        tag: '/src/mbgl/storage/http_file_source.cpp',
        message: 'Request failed due to a connection error: The Internet connection is offline',
      }),
    ).toBe(true);
  });

  // THE SILENCE THIS FORBIDS: this line is what a dead tile host actually produces — read off
  // a device by pointing the app at an invalid MapTiler key. It comes from mbgl's STYLE layer,
  // not its HTTP layer, and says "Failed to load tile", not "Request failed". A matcher that
  // knew only the HTTP wording sat silent through every 403.
  it('reads the style layer’s wording too, not just the HTTP layer’s', () => {
    expect(
      isResourceFailureLog({
        level: 'error',
        tag: 'Mbgl',
        message:
          '{RenderThread 15}[Style]: Failed to load tile 3/4/1=>3 for source terrain: HTTP status code 403',
      }),
    ).toBe(true);
    expect(
      isResourceFailureLog({
        level: 'error',
        tag: 'Mbgl',
        message: '[Style]: Failed to load glyph range 0-255 for font stack Noto Sans Regular',
      }),
    ).toBe(true);
  });

  // A cancelled request is not a failure: mbgl cancels in flight whenever a tile leaves the
  // viewport, so treating these as trouble would raise the notice on every ordinary pan.
  // (The binding downgrades this exact message from warn to info for the same reason.)
  it('ignores the cancellations every pan produces', () => {
    expect(
      isResourceFailureLog({
        level: 'warn',
        tag: 'Mbgl-HttpRequest',
        message: 'Request failed due to a permanent error: Canceled',
      }),
    ).toBe(false);
  });

  it('ignores chatter that is not a failed request at all', () => {
    expect(
      isResourceFailureLog({
        level: 'warn',
        tag: 'Mbgl-ParseStyle',
        message: "layer doesn't support this property",
      }),
    ).toBe(false);
    // Level matters: mbgl logs plenty at info/debug, and a notice must answer to real
    // severity only.
    expect(
      isResourceFailureLog({
        level: 'info',
        tag: 'Mbgl-HttpRequest',
        message: 'Request failed due to a connection error: offline',
      }),
    ).toBe(false);
  });
});

describe('createTroubleBurst', () => {
  it('says nothing about a single failure a working connection will retry away', () => {
    const burst = createTroubleBurst();
    expect(burst.hit(1_000)).toBe(false);
  });

  it('fires once enough failures land inside the window', () => {
    const burst = createTroubleBurst(3, 4_000);
    expect(burst.hit(0)).toBe(false);
    expect(burst.hit(500)).toBe(false);
    expect(burst.hit(1_000)).toBe(true);
  });

  // Three failures spread over an afternoon are a flaky connection, not a dead one. Without
  // the sliding window the notice would appear on the third one whenever it came.
  it('forgets failures older than the window', () => {
    const burst = createTroubleBurst(3, 4_000);
    expect(burst.hit(0)).toBe(false);
    expect(burst.hit(10_000)).toBe(false);
    expect(burst.hit(30_000)).toBe(false);
  });

  // `quiet` is what makes "the map finished rendering" believable as recovery: the renderer
  // can report a finished frame while requests are still erroring, and clearing the notice on
  // that would blink it off in front of a map that is still empty.
  it('is not quiet while failures are still arriving, and is once they stop', () => {
    const burst = createTroubleBurst(3, 4_000);
    burst.hit(1_000);
    expect(burst.quiet(2_000)).toBe(false);
    expect(burst.quiet(4_999)).toBe(false);
    expect(burst.quiet(5_000)).toBe(true);
  });

  it('starts out quiet, before anything has failed', () => {
    expect(createTroubleBurst().quiet(0)).toBe(true);
  });

  // THE COST THIS AVOIDS: MapLibre logs one failure per tile, glyph and TileJSON request —
  // dozens per viewport during an outage. A predicate that stayed true once the threshold was
  // passed would hand every one of them back to React, on the JS thread, at the precise
  // moment the map is already struggling. The caller only needs to hear about the edge.
  it('announces the burst once, not once per failed request', () => {
    const burst = createTroubleBurst(3, 4_000);
    burst.hit(0);
    burst.hit(100);
    expect(burst.hit(200)).toBe(true);
    for (const t of [300, 400, 500, 600]) expect(burst.hit(t)).toBe(false);
  });

  // The caller clears the counter along with its notice, so the NEXT outage counts from a
  // clean slate instead of inheriting failures the previous one already spent.
  it('can announce again after the caller clears it', () => {
    const burst = createTroubleBurst(3, 4_000);
    burst.hit(0);
    burst.hit(100);
    expect(burst.hit(200)).toBe(true);

    burst.clear();
    expect(burst.quiet(200)).toBe(true);
    burst.hit(1_000);
    burst.hit(1_100);
    expect(burst.hit(1_200)).toBe(true);
  });

  it('ships a threshold and a window that agree with each other', () => {
    // A burst must be reachable inside its own window — a threshold that cannot be met is a
    // notice that never appears.
    expect(TROUBLE_BURST).toBeGreaterThan(1);
    expect(TROUBLE_WINDOW_MS).toBeGreaterThan(0);
  });
});

describe('watchResourceFailures', () => {
  it('reports failures and passes every line on to the binding', () => {
    const seen: number[] = [];
    const stop = watchResourceFailures((at) => seen.push(at));

    logs.__emit({
      level: 'warn',
      tag: 'Mbgl-HttpRequest',
      message: 'Request failed due to a connection error: offline',
    });
    logs.__emit({ level: 'warn', tag: 'Mbgl-ParseStyle', message: 'unrelated' });

    expect(seen).toHaveLength(1);
    stop();
  });

  // The binding's own console output is what makes a native warning visible in development.
  // A watcher that swallowed the line would take that away — hence the handler always
  // returns false ("proceed with default logging").
  it('never swallows a log line', () => {
    const handler = jest.fn();
    const stop = watchResourceFailures(handler);
    const returned = (
      LogManager as unknown as { __handler: (log: object) => boolean }
    ).__handler({ level: 'warn', tag: 'Mbgl-HttpRequest', message: 'Request failed: x' });
    expect(returned).toBe(false);
    stop();
  });

  // THE BUG THIS FORBIDS: LogManager holds ONE handler. A keyed remount runs the new screen's
  // effect before the old screen's cleanup, so a blind unsubscribe would blank the handler
  // the SURVIVING screen just installed — leaving the notice permanently dead for the session
  // with no error and nothing on screen to suggest it.
  it('does not disable a watcher it did not install', () => {
    const first = jest.fn();
    const second = jest.fn();
    const stopFirst = watchResourceFailures(first);
    const stopSecond = watchResourceFailures(second);

    // The overlapping screen tears down after the new one has taken over.
    stopFirst();
    logs.__emit({
      level: 'warn',
      tag: 'Mbgl-HttpRequest',
      message: 'Request failed due to a connection error: offline',
    });
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    stopSecond();
  });

  it('stops reporting once unsubscribed', () => {
    const handler = jest.fn();
    watchResourceFailures(handler)();
    logs.__emit({
      level: 'error',
      tag: 'Mbgl-HttpRequest',
      message: 'Request failed due to a connection error: offline',
    });
    expect(handler).not.toHaveBeenCalled();
  });
});
