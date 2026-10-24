// Client-side persistence for the Bönetider experience: the user's prayer-time
// settings and (on the home/hub views) their chosen location, in localStorage. A
// single `bonetider:change` window event lets the settings panel, the location
// picker and every PrayerField on the page stay in sync without a framework.

import { readStoredJson, writeStored } from "../web-storage";
import {
	CALCULATION_METHOD_KEYS,
	type CalculationMethodKey,
	DEFAULT_SETTINGS,
	HIGH_LATITUDE_RULE_KEYS,
	type HighLatitudeRuleKey,
	MADHABS,
	type Madhab,
	type NamedLocation,
	POLAR_CIRCLE_RESOLUTION_KEYS,
	type PolarCircleResolutionKey,
	type PrayerAdjustments,
	type PrayerSettings,
	ROUNDINGS,
	type Rounding,
	SHAFAQS,
	type Shafaq,
} from "./settings";

const SETTINGS_KEY = "bonetider:settings";
const LOCATION_KEY = "bonetider:location";
export const CHANGE_EVENT = "bonetider:change";
/** Fired on window by scripts/bonetider-field.ts each time its clock turns a minute (also
 *  when a hidden tab comes back to a new one): the one clock that every readout changing
 *  with the minute follows. The city page's planning and month table each ran their own
 *  60-second interval, never cleared, which went on waking every page visited after. */
export const MINUTE_EVENT = "bonetider:minute";

const CALCULATION_METHODS = new Set<CalculationMethodKey>(CALCULATION_METHOD_KEYS);
const MADHAB_SET = new Set<Madhab>(MADHABS);
const HIGH_LAT_RULES = new Set<HighLatitudeRuleKey>(HIGH_LATITUDE_RULE_KEYS);
const POLAR_RESOLUTIONS = new Set<PolarCircleResolutionKey>(POLAR_CIRCLE_RESOLUTION_KEYS);
const SHAFAQ_SET = new Set<Shafaq>(SHAFAQS);
const ROUNDING_SET = new Set<Rounding>(ROUNDINGS);

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

/** Exported so the moskéskärm can sanitise a config that arrived in a URL hash
 *  through the same funnel as one that arrived from localStorage — one list of legal
 *  values, not two kept in step by hand. */
export function sanitizeSettings(value: unknown): PrayerSettings {
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
		madhab: enumOrDefault(parsed.madhab, MADHAB_SET, DEFAULT_SETTINGS.madhab),
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
		shafaq: enumOrDefault(parsed.shafaq, SHAFAQ_SET, DEFAULT_SETTINGS.shafaq),
		rounding: enumOrDefault(parsed.rounding, ROUNDING_SET, DEFAULT_SETTINGS.rounding),
		adjustments: sanitizeAdjustments(parsed.adjustments),
		hijriOffset: finiteOrDefault(parsed.hijriOffset, DEFAULT_SETTINGS.hijriOffset),
		// The website has no notifications/haptics/map/theme prefs — keep the app shape
		// intact but always use the inert defaults for those fields.
		//
		// COPIED, not referenced. This is the branch loadSettings takes whenever localStorage
		// actually holds something, so handing back the module singleton here re-opened the
		// exact hole loadSettings' docblock describes — one mutation of `settings.notifications`
		// anywhere rewrites DEFAULT_SETTINGS for the rest of the page, and the moskéskärm's
		// encoder omits every field still "at its default". The cloneSettings() in loadSettings
		// only covers the nothing-stored branch, which is the one storage.test can reach and
		// therefore the one that looked fixed.
		notifications: {
			...DEFAULT_SETTINGS.notifications,
			prayers: { ...DEFAULT_SETTINGS.notifications.prayers },
		},
		manualLocation: DEFAULT_SETTINGS.manualLocation ? { ...DEFAULT_SETTINGS.manualLocation } : null,
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

/**
 * A copy that is safe to mutate all the way down: `adjustments` is the nested object
 * callers actually reach into. structuredClone rather than spreads listed by hand, so a
 * nested field added to PrayerSettings is copied without anyone remembering it here.
 */
export function cloneSettings(s: PrayerSettings): PrayerSettings {
	return structuredClone(s);
}

/**
 * Settings merged over defaults, so a partial or older saved shape still computes.
 *
 * ⚠️ Always a FRESH object. Both fallback branches used to hand back the module-level
 * DEFAULT_SETTINGS itself, and every caller mutates what it gets — `s.madhab = …` then
 * `saveSettings(s)`. So on a visitor with nothing in localStorage, changing one setting
 * rewrote DEFAULT_SETTINGS for the rest of the page. That is invisible where the result
 * is only displayed, and not invisible at all where something later compares against the
 * defaults to decide what is worth writing down: the moskéskärm's URL encoder omits every
 * field still at its default, so a polluted default silently dropped the mosque's chosen
 * calculation method out of the link.
 */
export function loadSettings(): PrayerSettings {
	const stored = readStoredJson(SETTINGS_KEY);
	return stored === null ? cloneSettings(DEFAULT_SETTINGS) : sanitizeSettings(stored);
}

/** In private mode or with the quota full the settings just won't persist; the change
 *  event still fires, so the page repaints with them for as long as it is open. */
export function saveSettings(s: PrayerSettings): void {
	writeStored(SETTINGS_KEY, JSON.stringify(s));
	emitChange();
}

export function loadLocation(): NamedLocation | null {
	const stored = readStoredJson(LOCATION_KEY);
	return stored === null ? null : sanitizeLocation(stored);
}

export function saveLocation(loc: NamedLocation): void {
	writeStored(LOCATION_KEY, JSON.stringify(loc));
	emitChange();
}

function emitChange(): void {
	window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}
