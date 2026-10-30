import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The palette, measured. tokens.css states its contrast and lightness figures in
// comments; this file is the version that fails.
//
// Two classes of regression it exists for, both of which shipped once:
//
//   1. A tier drifting under its floor. Light --color-muted sat at 4.73:1 — AA by
//      0.2 — and every tint the components put beneath it (a raised panel, a hovered
//      row, a selected control) took it under 4.5. Two components grew private
//      workarounds (--text-meta on the BookPod cover and the archive length chip)
//      instead of the token growing margin. Brass, a 3:1 data mark, was setting 15px
//      table cells and news hovers.
//   2. A literal mirror going stale. Everything that cannot read a custom property
//      carries a copy of the light palette: the share cards (lib/og.ts), the print
//      figures (chart/render.ts, generate-pdf.ts, generate-epub.ts), the WebGL map
//      (moskeer-map.ts), the favicon and the theme-color metas. og.ts shipped with the
//      muted the site had retired two revisions earlier.
//
// Resolution is a small interpreter over the value grammar tokens.css actually uses:
// hex, var(), light-dark(), and color-mix() in srgb or oklab, with or without
// `transparent`. Nothing else, on purpose — a token written in a form this file cannot
// read should fail loudly here rather than pass unmeasured.

const WEB = new URL("../../", import.meta.url).pathname;
const read = (rel: string) => readFileSync(`${WEB}${rel}`, "utf8");
const tokensCss = read("src/styles/tokens.css");

// ---------------------------------------------------------------------------
// Colour maths
// ---------------------------------------------------------------------------

type RGB = [number, number, number];
/** sRGB channels 0–255 plus alpha 0–1. */
interface Color {
	rgb: RGB;
	a: number;
}

const lin = (c: number) => {
	const v = c / 255;
	return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const gam = (c: number) => {
	const v = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
	return v * 255;
};

const luminance = ([r, g, b]: RGB) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

/** WCAG 2 contrast ratio between two opaque colours. */
const ratio = (a: RGB, b: RGB) => {
	const x = luminance(a);
	const y = luminance(b);
	return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/** CIE L* — the perceptual lightness the hairline and surface steps are set in. */
const lstar = (rgb: RGB) => {
	const y = luminance(rgb);
	const f = y > 0.008856 ? Math.cbrt(y) : 7.787 * y + 16 / 116;
	return 116 * f - 16;
};

function toOklab([r, g, b]: RGB): [number, number, number] {
	const [R, G, B] = [lin(r), lin(g), lin(b)];
	const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
	const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
	const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
	];
}

function fromOklab([L, a, b]: [number, number, number]): RGB {
	const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
	return [
		gam(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
		gam(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
		gam(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
	];
}

const hexToRgb = (hex: string): RGB => {
	const h = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
	return [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as RGB;
};
const rgbToHex = (rgb: RGB) =>
	`#${rgb
		.map((v) =>
			Math.round(Math.min(255, Math.max(0, v)))
				.toString(16)
				.padStart(2, "0"),
		)
		.join("")}`;

/** Composite `c` over an opaque ground, the way the compositor does at paint time. */
const over = (c: Color, ground: RGB): RGB =>
	c.rgb.map((v, i) => v * c.a + (ground[i] ?? 0) * (1 - c.a)) as RGB;

// ---------------------------------------------------------------------------
// tokens.css value interpreter
// ---------------------------------------------------------------------------

type Scheme = "light" | "dark";

const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** The palette a reader gets who asks for more contrast, which overrides the ordinary one
 *  only on that reader's screen. Measured on its own, at the end of this file. */
const MORE_CONTRAST = /@media \(prefers-contrast: more\) \{[\s\S]*?\n\}\n/;

function declared(css: string): Map<string, string> {
	const out = new Map<string, string>();
	for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
		if (m[1] && m[2]) out.set(m[1], m[2].trim());
	}
	return out;
}

/** Every `--name: value;` in the file's :root blocks, raw. */
function declarations(css: string): Map<string, string> {
	return declared(withoutComments(css).replace(MORE_CONTRAST, ""));
}

/** Split on commas that sit outside any parentheses. */
function splitArgs(s: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let cur = "";
	for (const ch of s) {
		if (ch === "(") depth++;
		if (ch === ")") depth--;
		if (ch === "," && depth === 0) {
			parts.push(cur.trim());
			cur = "";
		} else cur += ch;
	}
	parts.push(cur.trim());
	return parts;
}

/** `<colour> [<pct>%]` as color-mix() takes its two arguments. */
function mixArg(s: string, scheme: Scheme, decls: Map<string, string>): { c: Color; p?: number } {
	const m = s.match(/^(.*?)\s+(\d+(?:\.\d+)?)%$/);
	if (m?.[1]) return { c: resolve(m[1], scheme, decls), p: Number(m[2]) / 100 };
	return { c: resolve(s, scheme, decls) };
}

function resolve(value: string, scheme: Scheme, decls: Map<string, string>): Color {
	const v = value.trim();
	if (v === "transparent") return { rgb: [0, 0, 0], a: 0 };
	if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v)) return { rgb: hexToRgb(v), a: 1 };
	const fn = v.match(/^([a-z-]+)\((.*)\)$/s);
	if (!fn) throw new Error(`tokens.test.ts cannot read the value "${v}" — extend the interpreter`);
	const name = fn[1] ?? "";
	const inner = fn[2] ?? "";
	if (name === "var") {
		const raw = decls.get(inner.trim());
		if (raw === undefined) throw new Error(`${inner} is not declared in tokens.css`);
		return resolve(raw, scheme, decls);
	}
	if (name === "light-dark") {
		const [l = "", d = ""] = splitArgs(inner);
		return resolve(scheme === "light" ? l : d, scheme, decls);
	}
	if (name === "color-mix") {
		const [space = "", a1 = "", a2 = ""] = splitArgs(inner);
		const method = space.replace(/^in\s+/, "");
		const A = mixArg(a1, scheme, decls);
		const B = mixArg(a2, scheme, decls);
		// Percentage normalisation per css-color-5: one given → the other is the rest.
		const pA = A.p ?? (B.p === undefined ? 0.5 : 1 - B.p);
		const pB = B.p ?? 1 - pA;
		// Premultiplied-alpha interpolation, which is what makes `X, transparent 80%`
		// come out as X at alpha 0.2 rather than a darker X.
		const alpha = A.c.a * pA + B.c.a * pB;
		const wA = alpha === 0 ? 0 : (A.c.a * pA) / alpha;
		const wB = 1 - wA;
		let rgb: RGB;
		if (method === "srgb") rgb = A.c.rgb.map((c, i) => c * wA + (B.c.rgb[i] ?? 0) * wB) as RGB;
		else if (method === "oklab") {
			const a = toOklab(A.c.rgb);
			const b = toOklab(B.c.rgb);
			rgb = fromOklab(a.map((c, i) => c * wA + (b[i] ?? 0) * wB) as [number, number, number]);
		} else throw new Error(`color-mix in ${method}: tokens.test.ts only reads srgb and oklab`);
		return { rgb, a: alpha };
	}
	throw new Error(`tokens.test.ts cannot read ${name}() — extend the interpreter`);
}

const decls = declarations(tokensCss);

/** A scheme's palette, every token composited over its own ground. */
function palette(scheme: Scheme) {
	const bg = resolve("var(--color-bg)", scheme, decls).rgb;
	const on = (token: string, ground: RGB = bg) =>
		over(resolve(`var(${token})`, scheme, decls), ground);
	return { scheme, bg, on };
}

const schemes = [palette("light"), palette("dark")] as const;
const [lightPalette, darkPalette] = schemes;

const fmt = (n: number) => n.toFixed(2);

// ---------------------------------------------------------------------------
// The text ramp
// ---------------------------------------------------------------------------

describe.each(schemes)("$scheme scheme — text on the ground", ({ scheme, bg, on }) => {
	// Floors are WCAG 2 ratios. tokens.css sets the dark tiers by APCA as well; this
	// keeps the coarse guarantee and the mirrors honest, and the comment tables in
	// tokens.css carry the finer numbers.
	const floors: Array<[string, number, string]> = [
		["--color-text", 7, "body prose must clear AAA"],
		["--text-body", 7, "leads and decks are prose, AAA"],
		["--text-quiet", 7, "descriptions and blurbs are prose, AAA"],
		["--text-meta", 4.5, "meta on a tinted panel is small text, AA"],
		["--color-muted", 4.5, "labels and captions are the site's smallest text, AA"],
		["--color-accent", 4.5, "links are text, AA"],
		["--color-brass-ink", 4.5, "brass that sets words (table and timeline emphasis), AA"],
	];

	it.each(floors)("%s ≥ %s:1 (%s)", (token, floor) => {
		const r = ratio(on(token), bg);
		expect(
			r,
			`${token} measures ${fmt(r)}:1 on the ${scheme} ground ${rgbToHex(bg)}; the floor is ${floor}:1`,
		).toBeGreaterThanOrEqual(floor);
	});

	it("the ramp steps monotonically from text to muted", () => {
		const order = ["--color-text", "--text-body", "--text-quiet", "--color-muted"];
		const L = order.map((t) => lstar(on(t)));
		for (let i = 1; i < L.length; i++) {
			const here = L[i] ?? 0;
			const prev = L[i - 1] ?? 0;
			const step = scheme === "light" ? here - prev : prev - here;
			// DESIGN.md: steps are spaced in L*, past the just-noticeable ~3 — never two
			// tiers that read as one.
			expect(
				step,
				`${order[i - 1]} → ${order[i]} is ΔL* ${step.toFixed(1)}; a tier under 3 L* from its neighbour reads as the same colour`,
			).toBeGreaterThanOrEqual(3);
		}
		// --text-meta is a half step by design — muted with a touch more presence for a
		// label on a tinted panel — so it is held to its place, not to the full spacing.
		const meta = lstar(on("--text-meta"));
		const [quiet, muted] = [lstar(on("--text-quiet")), lstar(on("--color-muted"))];
		expect(
			meta,
			`--text-meta (L* ${meta.toFixed(1)}) must sit between --text-quiet (${quiet.toFixed(1)}) and --color-muted (${muted.toFixed(1)})`,
		).toBeGreaterThan(Math.min(quiet, muted));
		expect(meta).toBeLessThan(Math.max(quiet, muted));
	});
});

// ---------------------------------------------------------------------------
// Non-text tiers, washes and surfaces
// ---------------------------------------------------------------------------

describe.each(schemes)("$scheme scheme — marks, washes and surfaces", ({ scheme, bg, on }) => {
	it("--color-warm and --color-brass clear the 3:1 non-text floor", () => {
		for (const t of ["--color-warm", "--color-brass"]) {
			const r = ratio(on(t), bg);
			expect(
				r,
				`${t} is ${fmt(r)}:1 on the ${scheme} ground; it is the selected border, the icon tier and the map's marker, all under WCAG 1.4.11's 3:1`,
			).toBeGreaterThanOrEqual(3);
		}
	});

	it("--color-brass itself is not fit for text on the light ground (so the ink token exists for a reason)", () => {
		if (scheme !== "light") return;
		expect(ratio(on("--color-brass"), bg)).toBeLessThan(4.5);
	});

	it("muted and brass ink keep AA on every tint they sit on", () => {
		// The regression this guards: muted cleared the ground by 0.2 and lost AA on the
		// first wash under it, so components patched it one by one.
		for (const ground of ["--surface-1", "--surface-2", "--wash-hover", "--wash-selected"]) {
			const g = on(ground);
			const m = ratio(on("--color-muted", g), g);
			expect(
				m,
				`--color-muted is ${fmt(m)}:1 on ${ground} (${rgbToHex(g)}) in ${scheme}; a caption on a hovered row or a card is still text`,
			).toBeGreaterThanOrEqual(4.5);
		}
		const ink = ratio(on("--color-brass-ink", on("--surface-1")), on("--surface-1"));
		expect(
			ink,
			`--color-brass-ink is ${fmt(ink)}:1 on --surface-1 in ${scheme}`,
		).toBeGreaterThanOrEqual(4.5);
	});

	it("washes and surfaces are visible, faint, and ranked", () => {
		const step = (t: string) => Math.abs(lstar(bg) - lstar(on(t)));
		for (const t of ["--wash-hover", "--wash-selected", "--surface-1", "--surface-2"]) {
			const d = step(t);
			expect(
				d,
				`${t} is ΔL* ${d.toFixed(1)} off the ${scheme} ground: under 2 it is invisible`,
			).toBeGreaterThanOrEqual(2);
			expect(
				d,
				`${t} is ΔL* ${d.toFixed(1)} off the ${scheme} ground: over 9 it is a band, not a wash`,
			).toBeLessThanOrEqual(9);
		}
		expect(
			step("--wash-selected"),
			"a selected control must read heavier than a hovered one",
		).toBeGreaterThan(step("--wash-hover"));
		expect(
			step("--surface-2"),
			"a control on a panel must read heavier than the panel",
		).toBeGreaterThan(step("--surface-1"));
	});

	it("the two hairlines rank, and neither is a black line", () => {
		const div = Math.abs(lstar(bg) - lstar(on("--color-divider")));
		const rule = Math.abs(lstar(bg) - lstar(on("--color-rule")));
		expect(
			rule,
			`--color-rule (ΔL* ${rule.toFixed(1)}) must carry more presence than --color-divider (ΔL* ${div.toFixed(1)}) — that difference is the only thing that tells a movement boundary from a row`,
		).toBeGreaterThan(div + 3);
		const r = ratio(on("--color-rule"), bg);
		expect(r, `--color-rule is ${fmt(r)}:1 — a whisper, not a black line`).toBeLessThan(2.2);
	});
});

it("the two hairline ranks weigh the same in both schemes", () => {
	// tokens.css: matched by ΔL* against each scheme's own ground, not by sharing an
	// alpha — L* is compressed near black, so one alpha travels 1.5× further off dark.
	const weight = (p: (typeof schemes)[number], t: string) => Math.abs(lstar(p.bg) - lstar(p.on(t)));
	for (const t of ["--color-divider", "--color-rule"]) {
		const l = weight(lightPalette, t);
		const d = weight(darkPalette, t);
		expect(
			Math.abs(l - d),
			`${t}: ΔL* ${l.toFixed(1)} light vs ${d.toFixed(1)} dark — the same hairline should not be visibly heavier in one scheme`,
		).toBeLessThanOrEqual(3);
	}
});

// ---------------------------------------------------------------------------
// Literal mirrors
// ---------------------------------------------------------------------------

describe("literal mirrors of the light palette", () => {
	const hex = (t: string) => rgbToHex(lightPalette.on(t));
	const dhex = (t: string) => rgbToHex(darkPalette.on(t));

	it("lib/og.ts draws the share cards in the current light tokens", () => {
		const og = read("src/lib/og.ts");
		for (const [c, t] of [
			["BG", "--color-bg"],
			["TEXT", "--color-text"],
			["MUTED", "--color-muted"],
			["ACCENT", "--color-accent"],
		]) {
			const want = hex(t ?? "");
			expect(
				og,
				`og.ts const ${c} must equal ${t} (${want}); a share card is the site's face on someone else's page`,
			).toMatch(new RegExp(`const ${c} = "${want}"`));
		}
		const code = og.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
		expect(
			code,
			"the photo card composes in the hero channels, never #fff or pure black",
		).not.toMatch(/#ffffff|#fff\b|255,255,255|rgba\(0,0,0/);
		const heroBlack = decls.get("--hero-black");
		expect(og).toContain(`HERO_BLACK = "${heroBlack?.split(/\s+/).join(",")}"`);
	});

	it("chart/render.ts PRINT resolves the light tokens, hairlines included", () => {
		const src = read("src/lib/chart/render.ts");
		expect(src).toContain(`brass: "${hex("--color-brass")}"`);
		expect(src).toContain(`muted: "${hex("--color-muted")}"`);
		expect(src).toContain(`bg: "${hex("--color-bg")}"`);
		expect(src, "PRINT.divider must be --color-divider composited over the light ground").toContain(
			`divider: "${hex("--color-divider")}"`,
		);
		expect(src, "PRINT.rule must be --color-rule composited over the light ground").toContain(
			`rule: "${hex("--color-rule")}"`,
		);
	});

	it("the PDF and EPUB set the emphasised figure row in brass INK, and their greys in the palette", () => {
		const pdf = read("scripts/generate-pdf.ts");
		const epub = read("scripts/generate-epub.ts");
		expect(pdf).toContain(`const BRASS = "${hex("--color-brass-ink")}"`);
		expect(pdf).toContain(`const MUTED = "${hex("--color-muted")}"`);
		expect(pdf, "the ornament prints in --color-warm, the tier it sits at on screen").toContain(
			`'"${hex("--color-warm")}"'`,
		);
		expect(pdf, "h3 prints in the accent").toContain(`rgb("${hex("--color-accent")}")`);
		expect(epub).toContain(`tr.is-emphasis td { color: ${hex("--color-brass-ink")}; }`);
		expect(epub).toContain(`tr.is-dim td { color: ${hex("--color-muted")}; }`);
		expect(epub).toContain(`border-left: 1px solid ${hex("--color-rule")};`);
		expect(epub).toContain(`border-bottom: 1px solid ${hex("--color-rule")};`);
		expect(epub).toContain(`border-top: 1px solid ${hex("--color-divider")};`);
		for (const s of [pdf, epub]) {
			expect(s, "no neutral grey — the palette has none").not.toMatch(
				/"#(999|333|666|ccc|eee)"|#(999|333|666|ccc|eee)\b/,
			);
		}
	});

	it("the WebGL map, the brand mark and the browser chrome carry the tokens they cannot read", () => {
		const map = read("src/scripts/moskeer-map.ts");
		expect(map).toContain(`brass: "${hex("--color-brass")}"`);
		expect(map).toContain(`brass: "${dhex("--color-brass")}"`);
		expect(map, "label halo is the page ground").toContain(`halo: "${hex("--color-bg")}"`);
		expect(map).toContain(`halo: "${dhex("--color-bg")}"`);

		const base = read("src/layouts/Base.astro");
		expect(base).toContain(
			`<meta name="theme-color" content="${hex("--color-bg")}" media="(prefers-color-scheme: light)" />`,
		);
		expect(base).toContain(
			`<meta name="theme-color" content="${dhex("--color-bg")}" media="(prefers-color-scheme: dark)" />`,
		);
		expect(base).toContain(`const LIGHT = "${hex("--color-bg")}"`);
		expect(base).toContain(`const DARK = "${dhex("--color-bg")}"`);
		expect(read("public/manifest.webmanifest")).toContain(`"theme_color": "${hex("--color-bg")}"`);

		const favicon = read("public/favicon.svg");
		expect(favicon).toContain(`.ring { fill: ${hex("--mark-blue")} }`);
		expect(favicon).toContain(`.core { fill: ${hex("--mark-gold")} }`);
		expect(favicon).toContain(`.ring { fill: ${dhex("--mark-blue")} }`);
		expect(favicon).toContain(`.core { fill: ${dhex("--mark-gold")} }`);

		const screen = read("src/components/bonetider/MosqueScreen.astro");
		expect(screen, "the moskéskärm's brass is the site's dark brass").toContain(
			`initial-value: ${dhex("--color-brass")};`,
		);
	});
});

// ---------------------------------------------------------------------------
// A reader who has asked for more contrast
// ---------------------------------------------------------------------------

describe.each(["light", "dark"] as const)("%s scheme — prefers-contrast: more", (scheme) => {
	const block = withoutComments(tokensCss).match(MORE_CONTRAST)?.[0] ?? "";
	const more = new Map([...decls, ...declared(block)]);
	const bg = resolve("var(--color-bg)", scheme, more).rgb;
	const on = (token: string) => over(resolve(`var(${token})`, scheme, more), bg);

	// Nothing a reader is meant to read stays under AAA for the reader who asked for it, and
	// a hairline is a line: WCAG 1.4.11's 3:1, which the ordinary rule (1.56:1) does not need
	// to clear, because there it is texture.
	it.each(["--color-text", "--text-body", "--text-quiet", "--text-meta", "--color-muted"])(
		"%s clears 7:1",
		(token) => {
			const r = ratio(on(token), bg);
			expect(
				r,
				`${token} measures ${fmt(r)}:1 for a reader who asked for more.`,
			).toBeGreaterThanOrEqual(7);
		},
	);

	it("draws the section rule at 3:1", () => {
		const r = ratio(on("--color-rule"), bg);
		expect(r, `--color-rule measures ${fmt(r)}:1.`).toBeGreaterThanOrEqual(3);
	});
});
