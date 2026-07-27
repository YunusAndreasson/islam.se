// Refuses to deploy a sampled build.
//
// `pnpm build:fast` sets BONETIDER_SAMPLE to skip ~2 100 of the 2 118 city pages so a
// design iteration takes 12 s instead of 90 s. Deploying that dist would 404 every one
// of those live URLs. `pnpm ship` runs the full build, so this only fires if the
// variable leaked into the environment — which is exactly the case worth catching,
// because the failure is silent and the damage is 2 118 dead pages.
import { readdirSync } from "node:fs";
import { join } from "node:path";

const DIST = new URL("../dist/", import.meta.url).pathname;
const MIN_CITIES = 1000;

let cities = 0;
try {
	cities = readdirSync(join(DIST, "bonetider"), { withFileTypes: true }).filter((e) =>
		e.isDirectory(),
	).length;
} catch {
	console.error("✗ deploy guard: dist/bonetider is missing entirely — did the build run?");
	process.exit(1);
}

if (cities < MIN_CITIES) {
	console.error(
		`✗ deploy guard: only ${cities} bönetider city pages in dist (expected >${MIN_CITIES}).\n` +
			"  This looks like a build:fast / BONETIDER_SAMPLE build. Deploying it would strand\n" +
			"  the missing city URLs. Run `pnpm build` and try again.",
	);
	process.exit(1);
}

console.log(`✓ deploy guard: ${cities} bönetider city pages present`);
