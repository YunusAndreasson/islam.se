// City-label collision placement for the RN marker overlay. MapLibre's symbol layer
// did this for us (symbol-sort-key = rank, text-optional = true): the big cities win a
// crowded view and smaller ones drop their label rather than overlap. Now that the
// labels are plain RN <Text> over the Skia canvas, we reproduce that here — a greedy,
// rank-sorted placement that keeps a label only if its box clears every label already
// placed and isn't fully off-screen. The DOT always draws (handled by the overlay);
// this decides only which LABELS are shown and where.
//
// Pure + deterministic so it's unit-testable: text width is estimated from the glyph
// count (no font metrics on the JS thread), which is plenty for overlap arbitration.

export interface LabelCandidate {
  name: string;
  rank: number;
  /** Projected screen position of the city DOT (label sits just below it). */
  x: number;
  y: number;
}

export interface PlacedLabel extends LabelCandidate {
  fontSize: number;
  /** Top-left of the label box (the text is centred horizontally on the dot). */
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface PlaceOptions {
  width: number;
  height: number;
  /** Label point size for a given rank (1 = biggest cities). */
  fontSizeForRank: (rank: number) => number;
  /** Gap (px) between the dot centre and the top of the label. */
  dotGap?: number;
  /** Average glyph width as a fraction of font size (Latin text ≈ 0.55). */
  charWidthFactor?: number;
  /** Pre-occupied boxes labels must avoid (e.g. the "you are here" marker), so no
      label is laid under them. Seeded before any city label is placed. */
  reserved?: readonly Box[];
  /** Extra breathing room (px) required around each label: the candidate box is inflated
      by this much in the overlap test, so labels keep their distance and dense clusters
      thin out rather than packing edge-to-edge. */
  padding?: number;
}

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function fullyOffscreen(b: Box, width: number, height: number): boolean {
  return b.right < 0 || b.left > width || b.bottom < 0 || b.top > height;
}

/**
 * Decide which city labels to show. Candidates are placed in rank order (rank 1
 * first); a label is kept only if its box clears all already-placed boxes and is at
 * least partly on screen. Returns the kept labels with their boxes.
 */
export function placeCityLabels(
  candidates: readonly LabelCandidate[],
  opts: PlaceOptions,
): PlacedLabel[] {
  const {
    width,
    height,
    fontSizeForRank,
    dotGap = 9,
    charWidthFactor = 0.55,
    reserved,
    padding = 0,
  } = opts;
  // Stable, deterministic priority: lower rank wins; tie-break west→east then by name.
  const ordered = [...candidates].sort(
    (a, b) => a.rank - b.rank || a.x - b.x || a.name.localeCompare(b.name),
  );

  const placed: PlacedLabel[] = [];
  // Seed with the reserved boxes so a label overlapping (say) the user marker is dropped.
  const boxes: Box[] = reserved ? [...reserved] : [];
  for (const cand of ordered) {
    const fontSize = fontSizeForRank(cand.rank);
    const w = Math.max(1, cand.name.length) * fontSize * charWidthFactor;
    const h = fontSize * 1.2;
    const left = cand.x - w / 2;
    const top = cand.y + dotGap;
    const box: Box = { left, top, right: left + w, bottom: top + h };
    if (fullyOffscreen(box, width, height)) continue;
    // Inflate by `padding` only for the overlap test, so kept labels keep their distance;
    // the stored box stays tight (what actually renders).
    const test: Box = padding
      ? { left: left - padding, top: top - padding, right: box.right + padding, bottom: box.bottom + padding }
      : box;
    if (boxes.some((b) => overlaps(test, b))) continue;
    boxes.push(box);
    placed.push({ ...cand, fontSize, left, top, width: w, height: h });
  }
  return placed;
}
