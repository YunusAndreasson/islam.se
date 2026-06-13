// Client-side persistence for the Bönetider experience: the user's prayer-time
// settings and (on the home/hub views) their chosen location, in localStorage. A
// single `bonetider:change` window event lets the settings panel, the location
// picker and every PrayerField on the page stay in sync without a framework.
import {
	type CalculationMethodKey,
	DEFAULT_SETTINGS,
	type HighLatitudeRuleKey,
	type Madhab,
	type NamedLocation,
	type PolarCircleResolutionKey,
	type PrayerAdjustments,
	type PrayerSettings,
	type Rounding,
	type Shafaq,
} from "./settings";

const SETTINGS_KEY = "bonetider:settings";
const LOCATION_KEY = "bonetider:location";
export const CHANGE_EVENT = "bonetider:change";

const CALCULATION_METHODS = new Set<CalculationMethodKey>([
	"MuslimWorldLeague",
	"Egyptian",
	"Karachi",
	"UmmAlQura",
	"Dubai",
	"Qatar",
	"Kuwait",
	"MoonsightingCommittee",
	"Singapore",
	"Turkey",
	"Tehran",
	"NorthAmerica",
	"Other",
]);
const MADHABS = new Set<Madhab>(["shafi", "hanafi"]);
const HIGH_LAT_RULES = new Set<HighLatitudeRuleKey>([
	"auto",
	"middleOfTheNight",
	"seventhOfTheNight",
	"twilightAngle",
]);
const POLAR_RESOLUTIONS = new Set<PolarCircleResolutionKey>([
	"aqrabBalad",
	"aqrabYaum",
	"unresolved",
]);
const SHAFAQS = new Set<Shafaq>(["general", "ahmer", "abyad"]);
const ROUNDINGS = new Set<Rounding>(["nearest", "up", "none"]);

function enumOrDefault<T extends string>(value: unknown, allowed: Set<T>, fallback: T): T {
	return typeof value === "string" && allowed.has(value as T) ? (value as T) : fallback;
}

function finiteOrDefault(value: unknown, fallback: number): number {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
}

function sanitizeAdjustments(value: unknown): PrayerAdjustments {
	const input =
		value && typeof value === "object"
			? (value as Partial<Record<keyof PrayerAdjustments, unknown>>)
			: {};
	return {
		fajr: finiteOrDefault(input.fajr, DEFAULT_SETTINGS.adjustments.fajr),
		sunrise: finiteOrDefault(input.sunrise, DEFAULT_SETTINGS.adjustments.sunrise),
		dhuhr: finiteOrDefault(input.dhuhr, DEFAULT_SETTINGS.adjustments.dhuhr),
		asr: finiteOrDefault(input.asr, DEFAULT_SETTINGS.adjustments.asr),
		maghrib: finiteOrDefault(input.maghrib, DEFAULT_SETTINGS.adjustments.maghrib),
		isha: finiteOrDefault(input.isha, DEFAULT_SETTINGS.adjustments.isha),
	};
}

function sanitizeSettings(value: unknown): PrayerSettings {
	const parsed =
		value && typeof value === "object"
			? (value as Partial<Record<keyof PrayerSettings, unknown>>)
			: {};
	return {
		...DEFAULT_SETTINGS,
		calculationMethod: enumOrDefault(
			parsed.calculationMethod,
			CALCULATION_METHODS,
			DEFAULT_SETTINGS.calculationMethod,
		),
		madhab: enumOrDefault(parsed.madhab, MADHABS, DEFAULT_SETTINGS.madhab),
		highLatitudeRule: enumOrDefault(
			parsed.highLatitudeRule,
			HIGH_LAT_RULES,
			DEFAULT_SETTINGS.highLatitudeRule,
		),
		polarCircleResolution: enumOrDefault(
			parsed.polarCircleResolution,
			POLAR_RESOLUTIONS,
			DEFAULT_SETTINGS.polarCircleResolution,
		),
		shafaq: enumOrDefault(parsed.shafaq, SHAFAQS, DEFAULT_SETTINGS.shafaq),
		rounding: enumOrDefault(parsed.rounding, ROUNDINGS, DEFAULT_SETTINGS.rounding),
		adjustments: sanitizeAdjustments(parsed.adjustments),
		hijriOffset: finiteOrDefault(parsed.hijriOffset, DEFAULT_SETTINGS.hijriOffset),
		// The website has no notifications/haptics/map/theme prefs — keep the app shape
		// intact but always use the inert defaults for those fields.
		notifications: DEFAULT_SETTINGS.notifications,
	};
}

function sanitizeLocation(value: unknown): NamedLocation | null {
	if (!value || typeof value !== "object") return null;
	const input = value as Partial<Record<keyof NamedLocation, unknown>>;
	const latitude = Number(input.latitude);
	const longitude = Number(input.longitude);
	if (
		typeof input.name !== "string" ||
		input.name.trim() === "" ||
		!Number.isFinite(latitude) ||
		!Number.isFinite(longitude) ||
		Math.abs(latitude) > 90 ||
		Math.abs(longitude) > 180
	)
		return null;
	return { name: input.name, latitude, longitude };
}

/** Settings merged over defaults, so a partial or older saved shape still computes. */
export function loadSettings(): PrayerSettings {
	if (typeof localStorage === "undefined") return DEFAULT_SETTINGS;
	try {
		const raw = localStorage.getItem(SETTINGS_KEY);
		if (!raw) return DEFAULT_SETTINGS;
		return sanitizeSettings(JSON.parse(raw));
	} catch {
		return DEFAULT_SETTINGS;
	}
}

export function saveSettings(s: PrayerSettings): void {
	try {
		localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
	} catch {
		/* private mode / quota — settings just won't persist */
	}
	emitChange();
}

export function loadLocation(): NamedLocation | null {
	if (typeof localStorage === "undefined") return null;
	try {
		const raw = localStorage.getItem(LOCATION_KEY);
		return raw ? sanitizeLocation(JSON.parse(raw)) : null;
	} catch {
		return null;
	}
}

export function saveLocation(loc: NamedLocation): void {
	try {
		localStorage.setItem(LOCATION_KEY, JSON.stringify(loc));
	} catch {
		/* ignore */
	}
	emitChange();
}

export function emitChange(): void {
	if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}
