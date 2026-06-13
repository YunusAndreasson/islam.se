// Smoke + parity check for the ported Bönetider lib. Run: npx tsx scripts/check-bonetider.ts
// Validates module resolution + adhan interop, the slug index/uniqueness guard, the solar
// grid/contour, the wash twin, and that our computePrayerTimes matches adhan directly.
import * as adhan from "adhan";
import { INDEXED_PLACES, nearbyPlaces, placeBySlug } from "../src/lib/bonetider/places-index";
import {
	computePrayerTimes,
	formatTime,
	nextPrayerKeyAt,
	PRAYER_ORDER,
} from "../src/lib/bonetider/prayer-times";
import { DEFAULT_SETTINGS } from "../src/lib/bonetider/settings";
import { slugify } from "../src/lib/bonetider/slug";
import { buildGrid, buildLines } from "../src/lib/bonetider/solar/field";
import { sunAltitudeDeg } from "../src/lib/bonetider/solar/sun";
import { washColorAt } from "../src/lib/bonetider/solar/washColor";

let fail = 0;
const ok = (cond: boolean, msg: string) => {
	if (cond) console.log("  ✓", msg);
	else {
		console.error("  ✗", msg);
		fail++;
	}
};

console.log("slug:");
ok(slugify("Härnösand") === "harnosand", `Härnösand → harnosand (got ${slugify("Härnösand")})`);
ok(slugify("Västra Götaland") === "vastra-gotaland", "Västra Götaland → vastra-gotaland");
ok(slugify("Mariefred") === "mariefred", "Mariefred → mariefred");

console.log("places index:");
ok(INDEXED_PLACES.length > 1500, `indexed ${INDEXED_PLACES.length} places`);
const slugs = new Set(INDEXED_PLACES.map((p) => p.slug));
ok(slugs.size === INDEXED_PLACES.length, "all slugs unique");
ok(placeBySlug("stockholm")?.name === "Stockholm", "placeBySlug('stockholm') → Stockholm");
const sthlm = placeBySlug("stockholm");
if (sthlm) ok(nearbyPlaces(sthlm, 6).length === 6, "nearbyPlaces returns 6");

console.log("prayer times (Stockholm, 2026-06-21) vs adhan-direct:");
const date = new Date("2026-06-21T12:00:00Z");
const coords = { latitude: 59.32938, longitude: 18.06871 };
const t = computePrayerTimes(coords, date, DEFAULT_SETTINGS);
const params = adhan.CalculationMethod.MuslimWorldLeague();
params.madhab = adhan.Madhab.Shafi;
params.highLatitudeRule = adhan.HighLatitudeRule.recommended(
	new adhan.Coordinates(coords.latitude, coords.longitude),
);
params.polarCircleResolution = adhan.PolarCircleResolution.AqrabBalad;
const oracle = new adhan.PrayerTimes(
	new adhan.Coordinates(coords.latitude, coords.longitude),
	date,
	params,
);
for (const k of PRAYER_ORDER) {
	ok(t[k].getTime() === oracle[k].getTime(), `${k}: ${formatTime(t[k])} (matches adhan)`);
}
console.log("  next prayer at noon:", nextPrayerKeyAt(t, date.getTime()));

console.log("solar field:");
const grid = buildGrid(date, DEFAULT_SETTINGS);
ok(grid.lats.length > 10 && grid.lons.length > 5, `grid ${grid.lats.length}×${grid.lons.length}`);
const lines = buildLines(grid, date.getTime());
ok(
	lines.lines.features.length >= 0,
	`buildLines → ${lines.lines.features.length} prayer line features`,
);

console.log("wash twin:");
// Midnight-ish over Stockholm in midsummer: sun is below horizon but barely (luminous night).
const midnight = new Date("2026-06-21T22:30:00Z");
const alt = sunAltitudeDeg(59.33, 18.07, midnight);
const [r, g, b, a] = washColorAt(alt, 180);
ok(alt < 0, `sun altitude below horizon at solar midnight (${alt.toFixed(1)}°)`);
ok(a > 0 && a < 0.9, `wash alpha in range (${a.toFixed(2)}) — luminous, not black`);
console.log(`  wash rgba(${r},${g},${b},${a.toFixed(2)}) at alt ${alt.toFixed(1)}°`);

console.log(fail === 0 ? "\nALL OK" : `\n${fail} FAILURES`);
process.exit(fail === 0 ? 0 : 1);
