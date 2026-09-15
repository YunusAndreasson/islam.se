// The dock and camera reserve the same space as system text grows.
export function dockMetrics(fontScale: number) {
  const scale = Math.max(1, fontScale);
  const hero = Math.ceil(48 * scale);
  const ruler = Math.ceil(16 * scale);
  return { hero, ruler, collapsed: 48 + hero + 4 + 48 + ruler + 8 };
}
