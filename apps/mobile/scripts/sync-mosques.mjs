#!/usr/bin/env node
// Sync the mosque dataset from the web app into the mobile app.
//
// WHY THIS EXISTS AS A SCRIPT rather than the `cp` it used to be. The two copies drifted
// badly once already: mobile was synced 2026-07-11, the web list was then curated on
// 07-19 (11 records removed, 9 renamed), and nothing noticed for three weeks. The app
// shipped a mosque list that still contained duplicates and one record whose coordinates
// were in the wrong city. A blind copy cannot tell you that happened; it cannot even tell
// you it was never run.
//
// DIRECTION IS ONE-WAY AND NOT NEGOTIABLE:
//
//     apps/web/src/data/moskeer-sverige.json   ← the canonical, hand-curated list
//                     │  (this script)
//                     ▼
//     apps/mobile/src/lib/mosques/data.json    ← a generated mirror; NEVER edit by hand
//
// Editing the mobile copy directly is what created the drift, so this script overwrites
// it wholesale and `--check` fails the test suite the moment the two disagree (see
// src/lib/mosques/sync.test.ts). Corrections belong in the WEB file. Note the web JSON is
// itself canonical over the CSV beside it — see apps/web/scripts/build-moskeer.ts, which
// only re-imports from that CSV on demand and overwrites the JSON wholesale. If you remove
// a mosque, remove it from the CSV too or the next re-import resurrects it.
//
// Usage:
//   node scripts/sync-mosques.mjs           copy web → mobile, validating on the way
//   node scripts/sync-mosques.mjs --check   verify they match; exit 1 if not (CI/tests)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(here, '../../web/src/data/moskeer-sverige.json');
const TARGET = join(here, '../src/lib/mosques/data.json');

/** Sweden's bounding box, generous at the edges. A coordinate outside it is a geocoding
 *  failure, not a mosque — that is exactly how the `landskrona` record ended up plotted
 *  in Göteborg while its address said Skåne. */
const SWEDEN = { west: 10.5, south: 55.0, east: 24.5, north: 69.5 };

/** Below this, two records are the same building under two names far more often than they
 *  are two congregations. Not fatal — Rinkeby and Trollhättan genuinely have neighbours
 *  this close — so it warns rather than fails, and a human decides. */
const NEAR_DUPLICATE_M = 150;

const REQUIRED = ['id', 'name', 'lat', 'lng', 'city', 'citySlug', 'kommun', 'lan'];

function read(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    fail(`cannot read the ${label} list at ${path}\n   ${err.message}`);
  }
}

function fail(message) {
  console.error(`\n✖ sync-mosques: ${message}\n`);
  process.exit(1);
}

function metres(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Fold a name for comparison: diacritics stripped, case-folded, punctuation collapsed. */
const fold = (s) =>
  String(s)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Hard errors abort the sync; soft warnings are printed for a human to judge. */
function validate(list) {
  const errors = [];
  const warnings = [];

  if (!Array.isArray(list) || list.length === 0) errors.push('the source list is empty or not an array');

  const seenIds = new Map();
  for (const [i, r] of list.entries()) {
    const where = `record ${i} (${r?.id ?? 'no id'})`;
    for (const key of REQUIRED) {
      if (r?.[key] === undefined || r[key] === null || r[key] === '') {
        errors.push(`${where}: missing required field "${key}"`);
      }
    }
    if (typeof r?.lat !== 'number' || typeof r?.lng !== 'number') {
      errors.push(`${where}: lat/lng must be numbers`);
      continue;
    }
    if (
      r.lat < SWEDEN.south || r.lat > SWEDEN.north ||
      r.lng < SWEDEN.west || r.lng > SWEDEN.east
    ) {
      errors.push(`${where}: coordinate (${r.lat}, ${r.lng}) is outside Sweden`);
    }
    if (seenIds.has(r.id)) errors.push(`${where}: duplicate id, first seen at ${seenIds.get(r.id)}`);
    else seenIds.set(r.id, i);
  }

  // Same name twice — almost always one mosque entered from two sources.
  const byName = new Map();
  for (const r of list) {
    const key = fold(r.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(r);
  }
  for (const [, group] of byName) {
    if (group.length > 1) {
      warnings.push(
        `duplicate name "${group[0].name}" on ${group.length} records: ${group.map((r) => r.id).join(', ')}`,
      );
    }
  }

  // Two pins close enough to be the same building.
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const d = metres(list[i], list[j]);
      if (d < NEAR_DUPLICATE_M) {
        warnings.push(
          `${Math.round(d)} m apart — "${list[i].name}" (${list[i].id}) and "${list[j].name}" (${list[j].id})`,
        );
      }
    }
  }

  return { errors, warnings };
}

const source = read(SOURCE, 'web (canonical)');
const { errors, warnings } = validate(source);

if (errors.length > 0) {
  fail(`the canonical list has ${errors.length} problem(s) — nothing was written:\n   - ${errors.join('\n   - ')}`);
}

const serialised = `${JSON.stringify(source, null, '\t')}\n`;
const check = process.argv.includes('--check');

if (check) {
  let current;
  try {
    current = readFileSync(TARGET, 'utf8');
  } catch {
    fail(`the mobile copy is missing. Run: pnpm sync:mosques`);
  }
  if (current !== serialised) {
    const mine = JSON.parse(current);
    const ids = (l) => new Set(l.map((r) => r.id));
    const a = ids(mine);
    const b = ids(source);
    const onlyMobile = [...a].filter((x) => !b.has(x));
    const onlyWeb = [...b].filter((x) => !a.has(x));
    fail(
      `the mobile list has DRIFTED from the canonical web list.\n` +
        `   mobile: ${mine.length} records, web: ${source.length}\n` +
        (onlyMobile.length ? `   stale in mobile (removed from web): ${onlyMobile.join(', ')}\n` : '') +
        (onlyWeb.length ? `   missing from mobile: ${onlyWeb.join(', ')}\n` : '') +
        `   Fix by running: pnpm sync:mosques   (never edit the mobile copy by hand)`,
    );
  }
  console.log(`✔ mosque lists are in sync — ${source.length} records`);
} else {
  let previous = [];
  try {
    previous = JSON.parse(readFileSync(TARGET, 'utf8'));
  } catch {
    /* first run */
  }
  writeFileSync(TARGET, serialised);
  const before = new Map(previous.map((r) => [r.id, r]));
  const after = new Map(source.map((r) => [r.id, r]));
  const removed = [...before.keys()].filter((id) => !after.has(id));
  const added = [...after.keys()].filter((id) => !before.has(id));
  const renamed = [...after].filter(([id, r]) => before.has(id) && before.get(id).name !== r.name);

  console.log(`✔ synced ${source.length} mosques  (was ${previous.length})`);
  if (removed.length) console.log(`   removed ${removed.length}: ${removed.join(', ')}`);
  if (added.length) console.log(`   added ${added.length}: ${added.join(', ')}`);
  for (const [id, r] of renamed) console.log(`   renamed ${id} -> "${r.name}"`);
}

if (warnings.length > 0) {
  console.warn(`\n⚠ ${warnings.length} thing(s) worth a human eye (not blocking):`);
  for (const w of warnings) console.warn(`   - ${w}`);
}
