// The dock and camera reserve the same space as system text grows.
export function dockMetrics(fontScale: number) {
  const scale = Math.max(1, fontScale);
  // Enlarged text gives the prayer and countdown separate lines. The camera
  // uses this same reservation, so the timeline stays clear of map content.
  const hero = Math.ceil((fontScale > 1.3 ? 64 : 48) * scale);
  const ruler = Math.ceil(16 * scale);
  return { hero, ruler, collapsed: 48 + hero + 4 + 48 + ruler + 8 };
}
