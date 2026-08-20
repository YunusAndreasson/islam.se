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
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIST = new URL("../dist/", import.meta.url).pathname;
const SVAR_SRC = new URL("../../../data/svar/", import.meta.url).pathname;
const MIN_CITIES = 1000;

const failures = [];

/** How many town directories under dist/<rel> contain a file called <name>. */
const countFiles = (rel, name) => {
	try {
		return readdirSync(join(DIST, rel), { withFileTypes: true }).filter(
			(e) => e.isDirectory() && existsSync(join(DIST, rel, e.name, name)),
		).length;
	} catch {
		return 0;
	}
};

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

// Sidenotes belong to essays only. The markdown processor in astro.config.ts is
// GLOBAL — it renders svar and fördjupning through the same rehype chain — and the
// only thing keeping margin notes out of them is a path check inside
// src/plugins/rehype-sidenotes.ts. If that check ever stops matching, those pages
// silently start carrying every footnote twice (once mid-sentence, once in their own
// "Noter" apparatus) and nothing else in the build would notice.
for (const section of ["svar", "fordjupning"]) {
	const dir = join(DIST, section);
	if (!existsSync(dir)) continue;
	const leaked = readdirSync(dir, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.filter((e) => {
			const page = join(dir, e.name, "index.html");
			return existsSync(page) && readFileSync(page, "utf8").includes('class="sidenote"');
		})
		.map((e) => e.name);
	if (leaked.length > 0) {
		failures.push(
			`sidenotes leaked into dist/${section}: ${leaked.slice(0, 5).join(", ")}` +
				`${leaked.length > 5 ? ` (+${leaked.length - 5} more)` : ""}.\n` +
				"    The essay path gate in src/plugins/rehype-sidenotes.ts is not matching.",
		);
	}
}

// A Pages deploy is a snapshot: a file missing from dist becomes a 404 live, and the
// city pages link to both of these. The counts are derived, not hardcoded, so adding a
// town cannot silently lower the bar.
const icsCount = countFiles("bonetider", "kalender.ics");
if (cities !== null && cities >= MIN_CITIES && icsCount < MIN_CITIES) {
	failures.push(
		`only ${icsCount} kalender.ics files for ${cities} city pages — every town page links to one`,
	);
}
const pdfCount = countFiles("bonetider", "kalender.pdf");
// The PDF is built only above OG_POPULATION (273 towns as of 2026-08); 200 is a floor
// that catches "typst was missing and every one silently failed", not an exact count.
if (cities !== null && cities >= MIN_CITIES && pdfCount < 200) {
	failures.push(
		`only ${pdfCount} kalender.pdf files — expected one per town above OG_POPULATION (typst missing?)`,
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
	`✓ deploy guard: ${cities} bönetider city pages, ${icsCount} kalendrar, ${pdfCount} månads-PDF:er, ${svarBuilt} svar pages, sitemap + PDF present`,
);
