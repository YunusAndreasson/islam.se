// Cuts each text face into its core and ext files (src/lib/fonts.ts says why there are
// two, and holds the ranges this reads).
//
//   pnpm tsx scripts/subset-fonts.ts            # the italic pair
//   pnpm tsx scripts/subset-fonts.ts --all      # the roman and sans pairs as well
//
// The recipe lived only in a comment in astro.config.ts, and the italic was never cut:
// it shipped whole, 160 kB on any page with one emphasised word. The parents stay in
// src/assets/fonts as the sources and are never served.
//
// Needs fonttools with brotli. `uvx` fetches both into its own cache, so nothing is
// installed into the repo or the system: https://docs.astral.sh/uv/
//
// After a re-cut, run `pnpm -w test --project web`: fonts.test.ts compares every
// declared range with the glyphs the new file holds.
import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { CORE_RANGE, LITERATA_EXT_RANGE, SOURCE_SANS_EXT_RANGE } from "../src/lib/fonts";

const DIR = new URL("../src/assets/fonts/", import.meta.url).pathname;

const CUTS = [
	{ parent: "literata-italic.woff2", out: "literata-italic-core.woff2", range: CORE_RANGE },
	{ parent: "literata-italic.woff2", out: "literata-italic-ext.woff2", range: LITERATA_EXT_RANGE },
	{
		parent: "literata-roman.woff2",
		out: "literata-roman-core.woff2",
		range: CORE_RANGE,
		all: true,
	},
	{
		parent: "literata-roman.woff2",
		out: "literata-roman-ext.woff2",
		range: LITERATA_EXT_RANGE,
		all: true,
	},
	{
		parent: "source-sans-3-roman.woff2",
		out: "source-sans-3-roman-core.woff2",
		range: CORE_RANGE,
		all: true,
	},
	{
		parent: "source-sans-3-roman.woff2",
		out: "source-sans-3-roman-ext.woff2",
		range: SOURCE_SANS_EXT_RANGE,
		all: true,
	},
];

const everything = process.argv.includes("--all");

for (const cut of CUTS.filter((c) => everything || !c.all)) {
	execFileSync(
		"uvx",
		[
			"--from",
			"fonttools",
			"--with",
			"brotli",
			"pyftsubset",
			DIR + cut.parent,
			`--unicodes=${cut.range.join(",")}`,
			// Every OpenType feature the parent has: the small caps, the old-style and
			// lining figures and the discretionary ligatures are all set somewhere.
			"--layout-features=*",
			"--flavor=woff2",
			`--output-file=${DIR}${cut.out}`,
		],
		{ stdio: ["ignore", "ignore", "inherit"] },
	);
	console.log(`${cut.out}  ${Math.round(statSync(DIR + cut.out).size / 1024)} kB`);
}
