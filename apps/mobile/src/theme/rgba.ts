// A translucent colour from a palette hex.
//
// Beams, glows, hairline tints and pill borders all want "this token, but see-through", so
// the warm paper underneath still shows. Written out three times across the compass and the
// Moon dial before it was one function.
//
// It is deliberately not a token: the ALPHA is the drawing's own decision (a 0.14 cone and a
// 0.45 glow are different intents), while the colour must stay a token so both themes follow.
export function hexToRgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
