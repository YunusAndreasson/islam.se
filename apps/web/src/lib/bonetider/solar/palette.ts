// Visual constants for the prayer-time solar field. Kept apart from the compute
// (field.ts) and the chrome tokens (theme/tokens.ts) so the *aesthetic* of the
// twilight wash and the prayer lines lives in one tunable place. Palette is
// deliberately muted — Nordic restraint, no neon — so the map reads as a calm
// dusk/night rather than a heat-map.
//
// Apple Maps-inspired light/dark: the basemap also themes by OS (see nordicStyle.ts),
// so the wash and prayer-line colours have a `{ light, dark }` pair each. On the web
// page the map keeps the page's theme at every hour, as the mosque map does: night
// never switches the map to the other theme (2026-11-21). Light leaves the night
// unveiled; dark deepens it a little, without turning it navy. The mosque
// screen, always dark, keeps the app's navy night (washStopsDark). Prayer lines lift in dark mode so they stay readable on navy land — most
// keep their hue family, but Isha swaps to the periwinkle accent because its
// light-mode Prussian indigo collapses against the navy basemap.
import type { PrayerKey } from "../prayer-times";

/** [r, g, b, a] with a in 0..1. */
export type RGBA = [number, number, number, number];

/** The six wash colour stops the SkSL shader composes per pixel. */
export interface WashStops {
	/** Midday — basemap untouched. */
	DAY: RGBA;
	/** Maghrib→Isha glow (dusk warmth). */
	DUSK_WARM: RGBA;
	/** Isha→Fajr (deep night). */
	NIGHT: RGBA;
	/** Fajr→sunrise (cool dawn). */
	DAWN_COOL: RGBA;
	/** Golden-hour kiss right at the sunrise horizon — a warm gold that blooms in the
	 *  lowest few degrees of depression on the MORNING side only, fading up into
	 *  DAWN_COOL above. Golden hour is symmetric (the rising sun is warm too), so this
	 *  gives Shurūq its own warm signature. Kept subtler than DUSK_WARM so Maghrib
	 *  stays the hero — a dawn whisper, not a second sunset. */
	DAWN_WARM: RGBA;
	/** A faint same-hue tint right at the Maghrib line — so the wash begins AT the
	 *  line, not far out in the band. */
	DUSK_EDGE: RGBA;
	/** Same idea at the sunrise line. */
	DAWN_EDGE: RGBA;
	/** Polar / midnight-sun fallback: a place that never reaches night keeps a pale
	 *  "white night" tint rather than going black or throwing on NaN times. */
	WHITE_NIGHT: RGBA;
}

// Light wash. Alpha encodes how much the overlay tints the warm parchment basemap.
export const washStopsLight: WashStops = {
	DAY: [255, 255, 255, 0],
	DUSK_WARM: [183, 78, 52, 0.5],
	// No veil at night: the light map keeps its own land and sea, as the mosque map does,
	// and only the twilight bands carry colour. It was a deep indigo at 0.88 (≈#2A2D43):
	// after ʿIshāʾ the whole frame became a dark block on the light page, beside a mosque
	// map that stays light, and the user found that strange (2026-11-21; on 2026-09-17 the
	// same night had read as »completely dark«, then fixed only by flipping the ink).
	// Every lighter veil was tried and failed the other way: any translucent blue over
	// parchment cancels its warmth, so 0.2–0.3 of a mid blue went grey and 0.46 of a pale
	// one »TERRIBLE, completely outwashed«. Transparent, in the dawn blue so the band
	// fades out without a purple fringe; the ink then never has to flip (inkSchemeFor).
	NIGHT: [80, 110, 186, 0],
	// Dawn was a pale, desaturated periwinkle — next to the vivid terracotta dusk it
	// barely registered as a colour. Deepened to a richer cool cornflower and lifted
	// a touch in alpha (0.42→0.48) so the Fajr→sunrise band glows as a real BLUE,
	// the cool twin of the Maghrib warmth. (Parchment is warm, so a cool wash mutes
	// against it — hence the extra saturation/alpha to land an honest blue.)
	DAWN_COOL: [80, 110, 186, 0.48],
	// Warm golden sunrise, more yellow/luminous than the dusk terracotta and at a lower
	// alpha (0.36 < 0.5) — a dawn gold that reads next to the cool blue without upstaging
	// Maghrib's red.
	DAWN_WARM: [226, 156, 94, 0.36],
	DUSK_EDGE: [183, 78, 52, 0.2],
	DAWN_EDGE: [80, 110, 186, 0.18],
	WHITE_NIGHT: [120, 132, 172, 0.24],
};

// Dark wash. The basemap is ALREADY dark navy (`#1d2333`), so the wash no longer
// has to do the work of darkening — it just carries hue (warm dusk / cool dawn /
// deeper night-blue). All alphas drop substantially. The dusk warmth and dawn
// coolness are slightly brighter so the temperature contrast still reads over the
// dark base. NIGHT stays the same indigo HUE but at lower alpha — it deepens the
// basemap from `#1d2333` toward `#161c2f`, an honest "this region of the sky is
// truly dark" cue without flattening the basemap to black.
export const washStopsDark: WashStops = {
	DAY: [255, 255, 255, 0],
	DUSK_WARM: [205, 108, 76, 0.32],
	// Does the darkening now that LAND (render-field.ts) starts lit at L* 23:
	// 0.70 takes it to L* ~11, a real day-to-night range. Hue as well as dimming.
	NIGHT: [14, 18, 40, 0.7],
	// Richer, bluer dawn lifted for the navy basemap — the cool twin of dusk, now a
	// distinct cornflower rather than a grey-blue. Alpha (0.34) stays below the light
	// mode's (0.48) per the gentler-dark-wash rule.
	DAWN_COOL: [120, 146, 210, 0.34],
	// Lifted golden sunrise for the navy basemap; alpha (0.26) below both the dark dusk
	// (0.32) and the light dawn-warm (0.36), per the gentler-dark-wash rule.
	DAWN_WARM: [236, 174, 110, 0.26],
	DUSK_EDGE: [205, 108, 76, 0.14],
	DAWN_EDGE: [120, 146, 210, 0.14],
	WHITE_NIGHT: [148, 160, 200, 0.18],
};

/** The dark page map's wash: the mosque screen's (washStopsDark) with a night that
 *  darkens the warm ground instead of turning it navy. At 0.70 indigo the brown land
 *  (#3d382e) and the near-black sea went to one navy, Sweden's shape held only by its
 *  coastline, on a page whose own dark is warm brown-black (2026-11-21). A near-black
 *  at 0.38 leaves land ≈#29261f and sea ≈#101216, close to the dark mosque map's
 *  (#24221c / #15171a), so the two maps on the site read as one at night. */
export const washStopsPageDark: WashStops = {
	...washStopsDark,
	NIGHT: [8, 9, 14, 0.38],
};

/** Per-prayer line colour, by OS theme. Same warm/cool meaning across both modes;
 *  brightness lifted in dark so the line reads on the navy basemap. Isha is the
 *  one that genuinely SWAPS hue family (the light-mode Prussian indigo `#33437a`
 *  would vanish against the navy basemap), shifted to the periwinkle that
 *  matches `darkPalette.accent`. */
export interface PrayerColors {
	light: string;
	dark: string;
}

export const PRAYER_COLORS: Record<PrayerKey, PrayerColors> = {
	fajr: { light: "#7c84ba", dark: "#a4adde" }, //     dawn violet (lifted in dark)
	sunrise: { light: "#e0a96d", dark: "#f0c089" }, //   warm gold (lifted)
	dhuhr: { light: "#b6a98d", dark: "#d4c8aa" }, //     pale neutral noon (lifted)
	asr: { light: "#cf9f63", dark: "#e6b87a" }, //       soft afternoon amber (lifted)
	maghrib: { light: "#cf7d5c", dark: "#eb9477" }, //   sunset terracotta — the hero line (lifted)
	isha: { light: "#33437a", dark: "#94a2dd" }, //      Prussian night-indigo → periwinkle in dark (matches accent)
};

/** A prayer's colour as LABEL TEXT, the app's PRAYER_TEXT_COLORS (apps/mobile
 *  src/lib/solar/palette.ts): the line hue brought to a legible lightness, so a name set
 *  in its own line's colour still reads as text. The moskéskärm's pills use it. */
export const PRAYER_TEXT_COLORS: Record<PrayerKey, PrayerColors> = {
	fajr: { light: "#6971a5", dark: "#b6c0f2" },
	sunrise: { light: "#9c692c", dark: "#e9b982" },
	dhuhr: { light: "#7f7358", dark: "#cdc1a3" },
	asr: { light: "#986b2e", dark: "#e8ba7c" },
	maghrib: { light: "#ae5f3e", dark: "#ffae90" },
	isha: { light: "#33437a", dark: "#adbcf8" },
};
