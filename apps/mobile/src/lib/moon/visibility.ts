// Can the new crescent be seen from here tonight?
//
// This is the one question a Swedish prayer app can answer that a printed calendar cannot,
// and it is also the one it must be most careful about. The month begins with the SIGHTING
// of the crescent, or by completing thirty days of the month before it. Nothing computed
// here settles a date. What it does is tell the reader what the eye can expect — which is
// exactly the information you want before going out to look, and exactly the information
// that explains why the arithmetic calendar and the mosque's announcement sometimes differ
// by a day.
//
// The test is Odeh's (Mohammad Sh. Odeh, "New Criterion for Lunar Crescent Visibility",
// Experimental Astronomy 18 (2004) 39–64), the criterion ICOP uses. It takes two topocentric
// quantities — the arc of vision and the crescent's width — and returns one of four zones.
// It is regression-fitted to a large body of real sightings, which is why it is preferred
// here over a bare Danjon-limit rule: a single elongation threshold says "possible" on
// evenings when nobody has ever actually seen anything.
//
// Pure on purpose: it takes NUMBERS, never the ephemeris library, so the anchor tests can
// hand it published geometry from ICOP's own reports and check the zone that came back.

/** Odeh's four zones, in the order the eye meets them. */
export type HilalBand = 'easy' | 'naked' | 'optical' | 'invisible';

export interface HilalGeometry {
  /** Topocentric arc of vision: Moon altitude − Sun altitude, degrees, at best time. */
  arcv: number;
  /** Topocentric elongation Moon–Sun (the arc of light), degrees. */
  elongation: number;
  /** Topocentric semi-diameter of the Moon, degrees. */
  semiDiameter: number;
}

export interface HilalVerdict {
  band: HilalBand;
  /** Odeh's V value — the margin, in degrees of arc of vision, over the visibility curve.
   *  Kept because it is the only honest way to say "only just": a V of 5.7 and a V of 20
   *  are both zone A and are not the same evening. */
  v: number;
  /** Crescent width, arcminutes. */
  width: number;
}

/** Zone boundaries in V, from Odeh's table 3. */
const V_EASY = 5.65;
const V_NAKED = 2.0;
const V_OPTICAL = -0.96;

/** Odeh's fitted visibility curve: the arc of vision a crescent of width W needs. */
function requiredArcv(widthArcmin: number): number {
  const w = widthArcmin;
  return -0.1018 * w * w * w + 0.7319 * w * w - 6.3226 * w + 7.1651;
}

export function hilalVerdict(g: HilalGeometry): HilalVerdict {
  // Crescent width, arcminutes: the lit sliver spans the semi-diameter scaled by how far
  // round the limb the terminator has swung.
  const width = g.semiDiameter * 60 * (1 - Math.cos(g.elongation * (Math.PI / 180)));
  const v = g.arcv - requiredArcv(width);
  const band: HilalBand =
    v >= V_EASY ? 'easy' : v >= V_NAKED ? 'naked' : v >= V_OPTICAL ? 'optical' : 'invisible';
  return { band, v, width };
}

/** Swedish, in the almanac's plain register. No hedging beyond what the criterion earns. */
export const HILAL_BAND_TEXT: Record<HilalBand, string> = {
  easy: 'Nymånen bör synas med blotta ögat',
  naked: 'Nymånen kan skymtas med blotta ögat vid klar horisont',
  optical: 'Nymånen syns bara med kikare',
  invisible: 'Nymånen går inte att se härifrån',
};

/**
 * The same four verdicts about an evening that has already been. The past tense needs its own
 * table rather than a rephrasing of the line above, because the sentence it goes into —
 * "månadens nymåne kunde först ses …" — is a claim about what the eye could do, and a zone-C
 * evening is one where the eye could NOT: it wanted a pair of binoculars. Dropping the band
 * on the way to the past tense turned a qualified verdict into an unqualified sighting.
 */
export const HILAL_BAND_TEXT_PAST: Record<HilalBand, string> = {
  easy: 'Månadens nymåne kunde först ses med blotta ögat',
  naked: 'Månadens nymåne kunde först skymtas med blotta ögat',
  optical: 'Månadens nymåne gick först att se med kikare',
  invisible: 'Månadens nymåne gick inte att se härifrån',
};
