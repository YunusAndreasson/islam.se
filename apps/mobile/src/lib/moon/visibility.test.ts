// Odeh's crescent criterion. The zone boundaries are the whole contract: this is what turns
// geometry into the sentence a reader acts on, and sliding a boundary by a degree moves
// evenings from "go and look" to "don't bother" without anything else changing.
import { describe, expect, it } from '@jest/globals';

import { HILAL_BAND_TEXT, hilalVerdict, type HilalGeometry } from './visibility';

/** A geometry with the given arc of vision, at a fixed crescent width. ARCL 10° with a
 *  15.5′ semi-diameter puts W at about 0.14′, where the fitted curve asks for roughly
 *  6.29° of arc of vision — so the V values below are the arcv minus that. */
const at = (arcv: number): HilalGeometry => ({ arcv, elongation: 10, semiDiameter: 15.5 / 60 });

describe('hilalVerdict — the four zones', () => {
  it('places a comfortable crescent in the naked-eye zone and a marginal one below it', () => {
    expect(hilalVerdict(at(14)).band).toBe('easy');
    expect(hilalVerdict(at(10)).band).toBe('naked');
    expect(hilalVerdict(at(6)).band).toBe('optical');
    expect(hilalVerdict(at(2)).band).toBe('invisible');
  });

  it('steps DOWN a zone as the arc of vision shrinks, never sideways', () => {
    // The bands must be monotonic in arcv at fixed width: a lower Moon can only ever be
    // harder to see. A sign slip inside the fitted polynomial breaks this and nothing else.
    const order = ['invisible', 'optical', 'naked', 'easy'];
    let previous = -1;
    for (let arcv = 0; arcv <= 20; arcv += 0.25) {
      const rank = order.indexOf(hilalVerdict(at(arcv)).band);
      expect(rank).toBeGreaterThanOrEqual(previous);
      previous = rank;
    }
  });

  it('reports V as the margin over the curve, so "only just" is distinguishable', () => {
    // Two evenings can share a band and not be the same evening. V is the only thing that
    // says which — hence it is returned rather than thrown away with the comparison.
    const marginal = hilalVerdict(at(12));
    const generous = hilalVerdict(at(20));
    expect(marginal.band).toBe('easy');
    expect(generous.band).toBe('easy');
    expect(generous.v).toBeGreaterThan(marginal.v + 7);
  });

  it('grows the crescent width with elongation — a wider arc of light is a fatter crescent', () => {
    const thin = hilalVerdict({ arcv: 10, elongation: 7, semiDiameter: 0.25 });
    const fat = hilalVerdict({ arcv: 10, elongation: 40, semiDiameter: 0.25 });
    expect(fat.width).toBeGreaterThan(thin.width);
    // Below the Danjon limit (~7° of elongation) no crescent has ever been recorded. The
    // criterion is not asked to enforce that — it simply reports a width near zero, which
    // is the same conclusion arrived at honestly.
    expect(thin.width).toBeLessThan(0.2);
  });

  it('has Swedish for every band it can produce', () => {
    for (const arcv of [20, 10, 6, 0]) {
      expect(HILAL_BAND_TEXT[hilalVerdict(at(arcv)).band]).toBeTruthy();
    }
  });
});
