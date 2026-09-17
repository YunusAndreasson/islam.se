// The dock and camera reserve the same space as system text grows.

// Blank clearance above the footer for the grab handle. Its box is a touch target too, but
// the hero directly beneath it (see PrayerDock's heroGesture) carries the SAME toggle
// gesture, so the handle's own reservation doesn't need to chase 48dp on its own — a tap
// just shy of it still lands on an equivalent control one row down.
export const DOCK_HANDLE_H = 40;
// Height of the scrubber's TRACK band only. The GestureDetector below spans this band
// PLUS the hour ruler beneath it (see timelineCol in PrayerDock), so the real drag target
// is band + ruler — 52dp even here, well past the 44dp minimum — and the band itself only
// needs to fit the thumb (bottom: 15, height: 18) with a little air above it.
export const TRACK_BAND_H = 36;

export function dockMetrics(fontScale: number) {
  const scale = Math.max(1, fontScale);
  // Enlarged text gives the prayer and countdown separate lines. The camera
  // uses this same reservation, so the timeline stays clear of map content.
  const hero = Math.ceil((fontScale > 1.3 ? 64 : 48) * scale);
  const ruler = Math.ceil(16 * scale);
  return { hero, ruler, collapsed: DOCK_HANDLE_H + hero + 4 + TRACK_BAND_H + ruler + 8 };
}
