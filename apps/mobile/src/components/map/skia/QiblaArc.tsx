// The qibla, drawn on the map: a great-circle ray from the user's brass dot toward Mecca.
//
// Why it belongs here at all. This is a map app whose qibla lived exclusively in a separate
// compass sheet — a needle with no context. On the map the direction becomes a place: you
// can see it leave your city and head south-east across Europe. It is also useful precisely
// where the compass is not, indoors and near metal, since it needs no magnetometer at all;
// and it is an independent visual check on the sheet's reading.
//
// A GREAT CIRCLE, not a straight line. A straight line on a Mercator map is a rhumb line
// (constant bearing), which from Sweden to Mecca is several degrees off the true qibla. The
// curve here is the same shortest-path geometry `qiblaBearing` reports, so the arc's initial
// heading and the compass needle agree by construction — qibla.test.ts pins that.
//
// Deliberately distinct from everything else on the canvas: the prayer lines are thick,
// glowing and prayer-hued; the polar boundary is dashed and faint. This is thin, solid and
// accent-indigo, with no blur and no glow — and it FADES OUT rather than terminating, so it
// reads as a direction rather than a route to somewhere just off the edge of the screen.
import { LinearGradient, Path, Skia } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { type SharedValue, useDerivedValue } from 'react-native-reanimated';

import { type Camera, mercX, mercY, project, worldSize } from '@/lib/map/projection';
import { greatCirclePoints, KAABA } from '@/lib/qibla';
import { useColors } from '@/theme/useColors';

/** Points along the full arc to Mecca. At ~40° of central angle that is a sample every
 *  ~0.4°, far below one screen pixel of chord error at any zoom the map offers, and Skia
 *  clips the part that is off-screen for free. */
const ARC_SAMPLES = 96;

/** Alpha at the user's dot. Quiet enough to sit under the prayer lines, present enough to
 *  read as deliberate on both basemaps. */
const HEAD_ALPHA = 0.5;
/** Fraction of the way to Mecca at which the ray has dissolved completely. At the
 *  whole-Sweden framing that is roughly one screen height of visible ray; zoomed into a
 *  city the visible span is a small slice near the head, so the line reads as solid. */
const FADE_END = 0.33;

interface Props {
  /** Map camera (centre/zoom/viewport), updated from MapLibre region events. */
  camera: SharedValue<Camera>;
  /** The user's position as [lon, lat] — the same point the brass dot is drawn at. */
  from: [number, number];
}

export function QiblaArc({ camera, from }: Props) {
  const c = useColors();

  // Stage 1 (JS thread, on position change only): lon/lat → normalised Mercator. The flat
  // Float64Array keeps the per-frame worklet below allocation-free. Same two-stage shape
  // as PrayerLine — see its comment for why the split matters.
  const merc = useMemo(() => {
    const points = greatCirclePoints({ longitude: from[0], latitude: from[1] }, KAABA, ARC_SAMPLES);
    const arr = new Float64Array(points.length * 2);
    for (let i = 0; i < points.length; i++) {
      arr[i * 2] = mercX(points[i][0]);
      arr[i * 2 + 1] = mercY(points[i][1]);
    }
    return arr;
  }, [from]);

  // Stage 2 (UI thread, per frame): Mercator → screen px is scale + translate, so the
  // rebuild is two multiply-adds per point. No React render on a pan or a zoom.
  const path = useDerivedValue(() => {
    const cam = camera.value;
    const ws = worldSize(cam.zoom);
    const ox = cam.width / 2 - mercX(cam.lon) * ws;
    const oy = cam.height / 2 - mercY(cam.lat) * ws;
    const b = Skia.PathBuilder.Make();
    for (let i = 0; i < merc.length; i += 2) {
      const x = merc[i] * ws + ox;
      const y = merc[i + 1] * ws + oy;
      if (i === 0) b.moveTo(x, y);
      else b.lineTo(x, y);
    }
    return b.detach();
  });

  // The fade runs along the chord from the dot to Mecca. The arc bows away from that chord
  // by well under a pixel at these scales, so a linear gradient tracks it faithfully — and
  // anchoring it to the two real endpoints means the dissolve stays at a fixed fraction of
  // the true distance however the map is zoomed, rather than a fixed number of pixels.
  const gradStart = useDerivedValue(() => {
    const p = project(from[0], from[1], camera.value);
    return { x: p.x, y: p.y };
  });
  const gradEnd = useDerivedValue(() => {
    const p = project(KAABA.longitude, KAABA.latitude, camera.value);
    return { x: p.x, y: p.y };
  });

  // Same hue at alpha 0 for the tail — NOT 'transparent', which is black@0 and would
  // interpolate a dark fringe down the ray. (The polar boundary's gradient documents the
  // same trap.) `accent` is '#rrggbb' in both schemes, so the split is a plain parse.
  const colors = useMemo(() => {
    const n = Number.parseInt(c.accent.slice(1), 16);
    const rgb = `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
    return [`rgba(${rgb}, ${HEAD_ALPHA})`, `rgba(${rgb}, 0)`];
  }, [c.accent]);

  return (
    <Path path={path} style="stroke" strokeCap="round" strokeJoin="round" strokeWidth={1.5}>
      <LinearGradient start={gradStart} end={gradEnd} colors={colors} positions={FADE_STOPS} />
    </Path>
  );
}

const FADE_STOPS = [0, FADE_END];
