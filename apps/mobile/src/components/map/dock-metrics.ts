// The dock and camera reserve the same space as system text grows.
//
// The collapsed card is 120 dp at the default text size — trimmed from 152 on 2026-09-18 so
// the map keeps more of the screen. Scaled down PROPORTIONALLY rather than by cutting one
// band: the empty air went first (the handle band and the space under the track were ~30 dp
// each of nothing), and the summary's type came down one step so the card still reads in the
// same proportions, just smaller. The camera reads `collapsed` for its fitBounds padding, so
// every dp taken out here is a dp of Sweden framed larger.

// Blank clearance above the footer for the grab handle. Its box is a touch target too, but
// the hero directly beneath it (see PrayerDock's heroGesture) carries the SAME toggle
// gesture, so the handle's own reservation doesn't need to chase 48dp on its own — a tap
// just shy of it still lands on an equivalent control one row down.
export const DOCK_HANDLE_H = 28;
// Height of the scrubber's TRACK band only: the thumb (16) with a little air above it and
// 8 dp under it before the hour ruler. The GestureDetector below spans this band PLUS the
// ruler beneath it and a 6 dp slop down to the card's edge (see `pan` in PrayerDock), so the
// real drag target is 28 + 14 + 6 = 48 dp — the band itself only has to fit the thumb.
export const TRACK_BAND_H = 28;
/** Air between the summary and the track band. */
export const DOCK_HERO_GAP = 2;
/** The footer's inset from the card's bottom edge. */
export const DOCK_FOOTER_PAD = 6;

export function dockMetrics(fontScale: number) {
  const scale = Math.max(1, fontScale);
  // Enlarged text gives the prayer and countdown separate lines. The camera
  // uses this same reservation, so the timeline stays clear of map content.
  const hero = Math.ceil((fontScale > 1.3 ? 60 : 42) * scale);
  const ruler = Math.ceil(14 * scale);
  return {
    hero,
    ruler,
    collapsed: DOCK_HANDLE_H + hero + DOCK_HERO_GAP + TRACK_BAND_H + ruler + DOCK_FOOTER_PAD,
  };
}
