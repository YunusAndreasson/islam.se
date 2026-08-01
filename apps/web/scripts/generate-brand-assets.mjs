// Single source of truth for the islam.se mark across every surface it appears on.
//
// Run: node scripts/generate-brand-assets.mjs   (from apps/web)
//
// ⚠️ Writes into apps/mobile/assets/images as well as apps/web/public. It lives here
// because sharp is a dependency of apps/web only — apps/mobile is a separate pnpm root.
// Regenerate ALL surfaces from this script; never hand-edit a single icon, or the
// surfaces drift.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import satori from "satori";
import sharp from "sharp";

const WEB = join(process.cwd(), "public");
const MOBILE = join(process.cwd(), "../mobile/assets/images");

// ---------------------------------------------------------------- geometry
// Inner radius is R/√2 — the incircle of the khatam (square + 45°-rotated square)
// the site carried before. It makes the gold core exactly half the outer disc's
// area, so ring and core carry equal ink.
const RATIO = 1 / Math.SQRT2;

// ---------------------------------------------------------------- colour
// Two sets: no single pair clears both grounds. Blue ALWAYS sits outermost —
// gold measures 1.75:1 on cream and cannot carry an outer edge.
const BLUE = "#2a557f";
const GOLD = "#e1b761";
const BLUE_DARK = "#4b739d";
const GOLD_DARK = "#fad486";
const CREAM = "#fff6e8";
const NIGHT = "#1d1912";
// Greys for the iOS tinted variant. NOT the mark's true luminance (#525252/#bdbdbd):
// iOS composites a tinted icon over its own dark background, where a ring that dark
// disappears. Lifted so both sit clear of that ground, keeping the ring↔core order
// and separation — iOS maps greyscale through the tint, so relative is what matters.
const BLUE_GREY = "#8f8f8f";
const GOLD_GREY = "#ebebeb";

/** Two-tone concentric mark. `scale` is mark diameter ÷ canvas edge. */
function disc({ size, bg, blue, gold, scale, radius = 0 }) {
	const c = size / 2;
	const R = (size * scale) / 2;
	const ground = bg
		? `<rect width="${size}" height="${size}"${radius ? ` rx="${radius}"` : ""} fill="${bg}"/>`
		: "";
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${ground}<circle cx="${c}" cy="${c}" r="${R.toFixed(3)}" fill="${blue}"/><circle cx="${c}" cy="${c}" r="${(R * RATIO).toFixed(3)}" fill="${gold}"/></svg>`;
}

/** One-colour reduction: an annulus, so "circle in circle" survives without hue.
    A filled disc would collapse the mark into a dot. */
function annulus({ size, colour = "#ffffff", scale }) {
	const c = size / 2;
	const R = (size * scale) / 2;
	const r = R * RATIO;
	// evenodd on two subpaths knocks the core out, keeping real transparency —
	// drawing the core in the background colour would break every tinted surface.
	const ring = `M ${c} ${c - R} A ${R} ${R} 0 1 0 ${c} ${c + R} A ${R} ${R} 0 1 0 ${c} ${c - R} Z M ${c} ${c - r} A ${r} ${r} 0 1 1 ${c} ${c + r} A ${r} ${r} 0 1 1 ${c} ${c - r} Z`;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><path d="${ring}" fill="${colour}" fill-rule="evenodd"/></svg>`;
}

async function png(svg, out, { jpeg = false } = {}) {
	mkdirSync(dirname(out), { recursive: true });
	const img = sharp(Buffer.from(svg));
	await (jpeg ? img.jpeg({ quality: 92 }) : img.png()).toFile(out);
	return out;
}

const done = [];
const note = (p, what) => done.push(`  ${p.replace(process.cwd(), ".").padEnd(52)} ${what}`);

// ---------------------------------------------------------------- web
// The favicon keeps its cream tile, so the mark only ever sits on the light ground
// and the deep blue always applies.
const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
	<title>islam.se</title>
	<rect width="32" height="32" rx="6" fill="${CREAM}"/>
	<circle cx="16" cy="16" r="11" fill="${BLUE}"/>
	<circle cx="16" cy="16" r="${(11 * RATIO).toFixed(3)}" fill="${GOLD}"/>
</svg>
`;
writeFileSync(join(WEB, "favicon.svg"), FAVICON);
note(join(WEB, "favicon.svg"), "tile + mark");

// Standalone vector mark, no tile. Used by the PDF title page (Typst) and anywhere
// the mark must sit on a ground the file itself does not own.
writeFileSync(
	join(WEB, "brand-mark.svg"),
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
	<title>islam.se</title>
	<circle cx="50" cy="50" r="50" fill="${BLUE}"/>
	<circle cx="50" cy="50" r="${(50 * RATIO).toFixed(3)}" fill="${GOLD}"/>
</svg>
`,
);
note(join(WEB, "brand-mark.svg"), "standalone vector mark");

// Section dinkus: the same two circles as the mark, reduced to an annulus and
// flanked by rules. ⚠️ The site consumes this as a CSS *mask*, so only the alpha
// matters — and typography.css carries a ?v= cache key that MUST be bumped when
// this shape changes, or readers keep the old ornament.
{
	const c = 60;
	const cy = 9;
	const R = 4.2;
	const r = +(R * RATIO).toFixed(3);
	const ring =
		`M ${c} ${cy - R} A ${R} ${R} 0 1 0 ${c} ${cy + R} A ${R} ${R} 0 1 0 ${c} ${cy - R} Z ` +
		`M ${c} ${cy - r} A ${r} ${r} 0 1 1 ${c} ${cy + r} A ${r} ${r} 0 1 1 ${c} ${cy - r} Z`;
	// ⚠️ White, not grey. The site applies this as a CSS mask, where the channel IS
	// the alpha — a grey ornament renders at ~60% opacity. generate-pdf.ts recolours
	// it to a real grey for print, where it is a normal image.
	writeFileSync(
		join(WEB, "ornament.svg"),
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -2 120 22" fill="none">
	<title>Ornament</title>
	<line x1="0" y1="9" x2="${c - R - 3}" y2="9" stroke="white" stroke-width="0.85" stroke-linecap="round"/>
	<path d="${ring}" fill="white" fill-rule="evenodd"/>
	<line x1="${c + R + 3}" y1="9" x2="120" y2="9" stroke="white" stroke-width="0.85" stroke-linecap="round"/>
</svg>
`,
	);
	note(join(WEB, "ornament.svg"), "dinkus — annulus + rules");
}

for (const [size, name] of [
	[180, "apple-touch-icon.png"],
	[192, "icon-192.png"],
	[512, "icon-512.png"],
]) {
	// No corner rounding: iOS and Android mask these themselves.
	await png(disc({ size, bg: CREAM, blue: BLUE, gold: GOLD, scale: 0.62 }), join(WEB, name));
	note(join(WEB, name), `${size}px, mark 0.62`);
}

// Maskable: Android may crop to a circle of 80% of the canvas, so the mark shrinks
// to sit well inside that safe zone rather than being clipped.
await png(
	disc({ size: 512, bg: CREAM, blue: BLUE, gold: GOLD, scale: 0.5 }),
	join(WEB, "icon-maskable-512.png"),
);
note(join(WEB, "icon-maskable-512.png"), "512px, mark 0.50 (safe zone)");

// ---------------------------------------------------------------- mobile
await png(
	disc({ size: 1024, bg: CREAM, blue: BLUE, gold: GOLD, scale: 0.62 }),
	join(MOBILE, "icon.png"),
);
note(join(MOBILE, "icon.png"), "1024, light");

await png(
	disc({ size: 1024, bg: NIGHT, blue: BLUE_DARK, gold: GOLD_DARK, scale: 0.62 }),
	join(MOBILE, "ios-dark.png"),
);
note(join(MOBILE, "ios-dark.png"), "1024, dark pair on night ground");

await png(
	disc({ size: 1024, bg: null, blue: BLUE_GREY, gold: GOLD_GREY, scale: 0.62 }),
	join(MOBILE, "ios-tinted.png"),
);
note(join(MOBILE, "ios-tinted.png"), "1024, luminance greys, alpha");

// Android adaptive foreground: only the inner 66.7% of the canvas is guaranteed
// visible, so the mark stays inside that.
await png(
	disc({ size: 1024, bg: null, blue: BLUE, gold: GOLD, scale: 0.6 }),
	join(MOBILE, "adaptive-icon.png"),
);
note(join(MOBILE, "adaptive-icon.png"), "1024, foreground, mark 0.60");

await png(annulus({ size: 1024, scale: 0.6 }), join(MOBILE, "adaptive-icon-monochrome.png"));
note(join(MOBILE, "adaptive-icon-monochrome.png"), "1024, Material You silhouette");

// Android strips colour from notification icons and keeps only the alpha.
await png(annulus({ size: 512, scale: 0.78 }), join(MOBILE, "notification-icon.png"));
note(join(MOBILE, "notification-icon.png"), "512, alpha silhouette");

// Two splash marks, because the splash ground flips with the OS theme and the deep
// blue only measures 2.07:1 against the night ground.
await png(
	disc({ size: 1024, bg: null, blue: BLUE, gold: GOLD, scale: 0.62 }),
	join(MOBILE, "splash-icon.png"),
);
note(join(MOBILE, "splash-icon.png"), "1024, transparent, light pair");

await png(
	disc({ size: 1024, bg: null, blue: BLUE_DARK, gold: GOLD_DARK, scale: 0.62 }),
	join(MOBILE, "splash-icon-dark.png"),
);
note(join(MOBILE, "splash-icon-dark.png"), "1024, transparent, dark pair");

await png(
	disc({ size: 256, bg: CREAM, blue: BLUE, gold: GOLD, scale: 0.62 }),
	join(MOBILE, "favicon.png"),
);
note(join(MOBILE, "favicon.png"), "256, expo web");

// CompassButton recolours this with tintColor at runtime (ink / accent / brass),
// so it MUST stay a single-colour silhouette — a two-tone disc cannot be tinted.
await png(annulus({ size: 980, scale: 0.94 }), join(MOBILE, "logo-mark.png"));
note(join(MOBILE, "logo-mark.png"), "980, tintable silhouette");

// ------------------------------------------------- artwork carrying the name
// BRAND RULE: where the mark stands alone as a graphic, the wordmark is set as
// plain "islam.se" text. The mark-as-full-stop is an INLINE device (mast, palette,
// share-card brand line) — using both in one lockup shows the mark twice.
const fontDir = join(process.cwd(), "scripts/fonts");
const semibold = readFileSync(join(fontDir, "SourceSans3-SemiBold.ttf"));
const italic = readFileSync(join(fontDir, "Literata-RegularItalic.ttf"));
const INK = "#1a1914";
const MUTED = "#776d61";

const node = (type, style, children) => ({ type, props: { style, children } });

/** Standalone mark as a satori node (nested rounded divs — satori has no <circle>). */
function markNode(d) {
	const core = Math.round(d / Math.SQRT2);
	return node(
		"div",
		{
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			width: d,
			height: d,
			borderRadius: d,
			backgroundColor: BLUE,
		},
		[
			node(
				"div",
				{ display: "flex", width: core, height: core, borderRadius: core, backgroundColor: GOLD },
				[],
			),
		],
	);
}

async function card({ width, height, mark, wordSize, wordGap, extra, out, jpeg }) {
	const svg = await satori(
		node(
			"div",
			{
				width,
				height,
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				backgroundColor: CREAM,
				fontFamily: "Source Sans 3",
			},
			[
				markNode(mark),
				node(
					"div",
					{
						display: "flex",
						marginTop: wordGap,
						fontSize: wordSize,
						fontWeight: 600,
						letterSpacing: wordSize * 0.14,
						color: INK,
					},
					"ISLAM.SE",
				),
				...extra,
			],
		),
		{
			width,
			height,
			fonts: [
				{ name: "Source Sans 3", data: semibold, weight: 600, style: "normal" },
				{ name: "Literata", data: italic, weight: 400, style: "italic" },
			],
		},
	);
	await png(svg, out, { jpeg });
	return out;
}

await card({
	width: 1200,
	height: 630,
	mark: 150,
	wordSize: 56,
	wordGap: 44,
	extra: [
		node(
			"div",
			{
				display: "flex",
				marginTop: 22,
				fontFamily: "Literata",
				fontStyle: "italic",
				fontSize: 30,
				color: MUTED,
			},
			"Islam på svenska, förklarad ur källorna.",
		),
	],
	out: join(WEB, "og-default.png"),
});
note(join(WEB, "og-default.png"), "1200×630 fallback share card");

// Apple shows podcast artwork as small as 55px, so the name has to be on it.
await card({
	width: 3000,
	height: 3000,
	mark: 1180,
	wordSize: 260,
	wordGap: 210,
	extra: [
		node(
			"div",
			{
				display: "flex",
				marginTop: 70,
				fontSize: 96,
				fontWeight: 600,
				letterSpacing: 26,
				color: MUTED,
			},
			"ESSÄER, INLÄSTA",
		),
	],
	out: join(WEB, "podcast-cover.jpg"),
	jpeg: true,
});
note(join(WEB, "podcast-cover.jpg"), "3000×3000 podcast artwork");

console.log(`Brand assets regenerated:\n${done.join("\n")}`);
