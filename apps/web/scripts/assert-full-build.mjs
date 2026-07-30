// Refuses to deploy a sampled build.
//
// `pnpm build:fast` sets BONETIDER_SAMPLE to skip ~2 100 of the 2 118 city pages so a
// design iteration takes 12 s instead of 90 s. Deploying that dist would 404 every one
// of those live URLs. `pnpm ship` runs the full build, so this only fires if the
// variable leaked into the environment — which is exactly the case worth catching,
// because the failure is silent and the damage is 2 118 dead pages.
//
// ⚠️ A Cloudflare Pages deploy is a full SNAPSHOT of dist/ — anything absent from the
// directory becomes a 404 live. Every artefact below has already shipped once, so a
// build that omits it is a regression, not a no-op. The daily cron makes that the
// difference between an unattended refresh and an unattended outage.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIST = new URL("../dist/", import.meta.url).pathname;
const SVAR_SRC = new URL("../../../data/svar/", import.meta.url).pathname;
const MIN_CITIES = 1000;

const failures = [];

const countDirs = (rel) => {
	try {
		return readdirSync(join(DIST, rel), { withFileTypes: true }).filter((e) => e.isDirectory())
			.length;
	} catch {
		return null;
	}
};

const cities = countDirs("bonetider");
if (cities === null) {
	failures.push("dist/bonetider is missing entirely — did the build run?");
} else if (cities < MIN_CITIES) {
	failures.push(
		`only ${cities} bönetider city pages in dist (expected >${MIN_CITIES}).\n` +
			"    Looks like a build:fast / BONETIDER_SAMPLE build; deploying it would strand\n" +
			"    the missing city URLs. Run `pnpm build` and try again.",
	);
}

// Counted from source rather than hardcoded, so adding an answer page cannot silently
// lower the bar this guard enforces.
const svarExpected = existsSync(SVAR_SRC)
	? readdirSync(SVAR_SRC).filter((f) => f.endsWith(".md")).length
	: 0;
const svarBuilt = countDirs("svar");
if (svarExpected > 0 && svarBuilt !== svarExpected) {
	failures.push(
		`dist/svar has ${svarBuilt ?? 0} pages, expected ${svarExpected} (one per data/svar/*.md)`,
	);
}

for (const [rel, note] of [
	["sitemap-index.xml", "the sitemap Search Console is subscribed to"],
	[
		"samlingsvolym.pdf",
		"linked from BookPod; produced by `pnpm pdf`, which needs the typst binary",
	],
]) {
	if (!existsSync(join(DIST, rel))) failures.push(`dist/${rel} is missing — ${note}`);
}

if (failures.length > 0) {
	console.error("✗ deploy guard:");
	for (const f of failures) console.error(`  • ${f}`);
	process.exit(1);
}

console.log(
	`✓ deploy guard: ${cities} bönetider city pages, ${svarBuilt} svar pages, sitemap + PDF present`,
);
