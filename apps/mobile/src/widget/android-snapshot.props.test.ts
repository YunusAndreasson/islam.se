// Property tests for the Android widget's choice of entry. The example tests pin a spring day
// in Stockholm; these sweep the year and the country, because the boundaries that matter —
// DST nights, polar days, prayers that fall either side of midnight — move with both.
import { describe, expect, it } from '@jest/globals';
import * as fc from 'fast-check';

import type { LatLng } from '@/lib/prayer-times';
import { DEFAULT_SETTINGS } from '@/lib/settings/types';
import { buildAndroidSnapshot, selectEntry } from './android-snapshot';
import { buildPayloadAt } from './payload';

const YEAR_START = Date.UTC(2026, 0, 1);
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
/** Sweden's populated latitudes, Malmö to Kiruna. */
const place = fc.record({
  latitude: fc.double({ min: 55.4, max: 67.9, noNaN: true }),
  longitude: fc.double({ min: 11.0, max: 24.0, noNaN: true }),
});
const instant = fc.integer({ min: YEAR_START, max: YEAR_START + YEAR_MS });
/** How far past the build the widget renders: anywhere within the horizon. */
const offset = fc.double({ min: 0, max: 1, noNaN: true, maxExcluded: true });

describe('the entry the Android widget shows', () => {
  it('never names a prayer that has already passed as the next one', () => {
    fc.assert(
      fc.property(place, instant, offset, (coords: LatLng, now, fraction) => {
        const snapshot = buildAndroidSnapshot(coords, DEFAULT_SETTINGS, 'Ort', now);
        const t = now + Math.floor(fraction * (snapshot.validUntilMs - now));
        const next = selectEntry(snapshot, t)?.payload.nextAtMs;
        // The one tolerated second is the timeline's own boundary epsilon: an entry begins
        // 1 s after its prayer, so for that second the prayer is still the one named.
        if (next != null) expect(next).toBeGreaterThanOrEqual(t - 1000);
      }),
      { numRuns: 120 },
    );
  });

  // Differential: whatever the snapshot shows at `t` is what the iOS widget — and the app's
  // dock, through the same buildPayloadAt — would show at `t`. Not a re-derivation: the two
  // paths share no code below buildPayloadAt.
  it('agrees with the payload the iOS widget would show at that instant', () => {
    fc.assert(
      fc.property(place, instant, offset, (coords: LatLng, now, fraction) => {
        const snapshot = buildAndroidSnapshot(coords, DEFAULT_SETTINGS, 'Ort', now);
        const t = now + Math.floor(fraction * (snapshot.validUntilMs - now));
        const shown = selectEntry(snapshot, t)?.payload;
        const direct = buildPayloadAt(coords, DEFAULT_SETTINGS, t, 'Ort');
        // Inside the 1 s after a prayer the snapshot still names it (see above) while a
        // payload built AT that instant has already moved on — so that second is skipped,
        // which is exactly the case where the named prayer is no longer ahead of `t`.
        if (shown && shown.nextAtMs !== null && shown.nextAtMs >= t) {
          expect(shown.nextArabic).toBe(direct.nextArabic);
          expect(shown.nextTime).toBe(direct.nextTime);
          expect(shown.rows).toEqual(direct.rows);
        }
      }),
      { numRuns: 120 },
    );
  });
});
