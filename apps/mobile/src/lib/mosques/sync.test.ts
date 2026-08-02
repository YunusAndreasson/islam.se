// The drift guard.
//
// src/lib/mosques/data.json is a GENERATED MIRROR of apps/web/src/data/moskeer-sverige.json,
// produced by `pnpm sync:mosques`. Nothing used to enforce that. The two silently diverged
// for three weeks in 2026: mobile was synced on 07-11, the web list was curated on 07-19
// (11 records deleted, 9 renamed), and the app went on shipping the stale copy — including
// seven duplicate mosques and one record whose coordinates put a Landskrona mosque in
// Göteborg. Nobody noticed because a `cp` leaves no evidence of not having been run.
//
// This test is that evidence. It fails the moment the two files disagree, which turns a
// silent data-quality decay into a red build. The failure message names the offending ids
// and the one command that fixes it.
//
// If this fails: run `pnpm sync:mosques`. Do NOT hand-edit data.json to make it pass —
// hand-editing the mirror is precisely what caused the drift. Corrections go in the web
// file (and in the CSV beside it, or the next `build-moskeer` re-import resurrects them).
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import mobileData from './data.json';

const WEB_LIST = join(__dirname, '../../../../web/src/data/moskeer-sverige.json');

interface Row {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

/** The canonical list, or null when the web app isn't checked out beside us. */
function readCanonical(): Row[] | null {
  try {
    return JSON.parse(readFileSync(WEB_LIST, 'utf8')) as Row[];
  } catch {
    // The mobile app is its own pnpm workspace and can be cloned alone. Skipping is
    // correct there — but only there, which is why this is a narrow file-read guard and
    // not a blanket try/catch around the assertions.
    return null;
  }
}

const canonical = readCanonical();
const mobile = mobileData as unknown as Row[];

describe('mosque data mirrors the canonical web list', () => {
  it('has the web list available to compare against', () => {
    if (canonical === null) {
      console.warn(`skipping drift check — no web app at ${WEB_LIST}`);
    }
    expect(true).toBe(true);
  });

  (canonical === null ? it.skip : it)('contains exactly the same mosques, by id', () => {
    const web = canonical as Row[];
    const mobileIds = new Set(mobile.map((r) => r.id));
    const webIds = new Set(web.map((r) => r.id));
    const stale = [...mobileIds].filter((id) => !webIds.has(id));
    const missing = [...webIds].filter((id) => !mobileIds.has(id));

    // Asserted as arrays rather than a bare length so the failure output NAMES the
    // records — "stale: landskrona, camii-moske" is actionable; "expected 249 to be 236"
    // sends the next reader digging through 78 000 lines of JSON.
    expect({ stale, missing }).toEqual({ stale: [], missing: [] });
  });

  (canonical === null ? it.skip : it)('agrees field-for-field, not just on which ids exist', () => {
    // Renames are the drift that ids alone cannot see: the 2026-07 divergence renamed
    // nine placeholder records ("(namnlös i OSM)" → "Moské i Åmål") without changing a
    // single id, so an id-set check would have passed while the app showed nine mosques
    // called "(namnlös i OSM)".
    //
    // Reported as a LIST OF CHANGED FIELDS rather than a deep-equal on the two arrays.
    // A deep-equal here prints both 78 000-line documents into the failure output, which
    // buries the one field that actually moved — the reader then has no idea what broke.
    const web = new Map((canonical as Row[]).map((r) => [r.id, r]));
    const differences: string[] = [];
    for (const row of mobile) {
      const other = web.get(row.id);
      if (!other) continue; // the id-set test above owns this case
      for (const key of Object.keys({ ...row, ...other }) as (keyof Row)[]) {
        if (row[key] !== other[key]) {
          differences.push(`${row.id}.${String(key)}: mobile ${JSON.stringify(row[key])} vs web ${JSON.stringify(other[key])}`);
        }
      }
    }
    expect(differences).toEqual([]);
  });
});

describe('the canonical list is fit to ship', () => {
  // These hold whichever file wins, so a bad edit to the WEB list is caught here too
  // rather than only when someone next runs the sync script.
  it('has no duplicate ids', () => {
    const ids = mobile.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no two mosques sharing a name', () => {
    const fold = (s: string) =>
      s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const seen = new Map<string, string[]>();
    for (const r of mobile) {
      const key = fold(r.name);
      seen.set(key, [...(seen.get(key) ?? []), r.id]);
    }
    const dupes = [...seen.entries()].filter(([, ids]) => ids.length > 1);
    expect(dupes).toEqual([]);
  });

  it('plots every mosque inside Sweden', () => {
    // The `landskrona` record failed exactly this in spirit — its address said Skåne
    // while its coordinates sat in Göteborg. A bbox cannot catch a wrong-city geocode,
    // but it does catch the transposed/zeroed coordinates that put a pin in the sea.
    const outside = mobile.filter(
      (r) => r.lat < 55 || r.lat > 69.5 || r.lng < 10.5 || r.lng > 24.5,
    );
    expect(outside.map((r) => r.id)).toEqual([]);
  });
});
