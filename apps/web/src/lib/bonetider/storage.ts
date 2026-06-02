// Client-side persistence for the Bönetider experience: the user's prayer-time
// settings and (on the home/hub views) their chosen location, in localStorage. A
// single `bonetider:change` window event lets the settings panel, the location
// picker and every PrayerField on the page stay in sync without a framework.
import { DEFAULT_SETTINGS, type NamedLocation, type PrayerSettings } from "./settings";

const SETTINGS_KEY = "bonetider:settings";
const LOCATION_KEY = "bonetider:location";
export const CHANGE_EVENT = "bonetider:change";

/** Settings merged over defaults, so a partial or older saved shape still computes. */
export function loadSettings(): PrayerSettings {
	if (typeof localStorage === "undefined") return DEFAULT_SETTINGS;
	try {
		const raw = localStorage.getItem(SETTINGS_KEY);
		if (!raw) return DEFAULT_SETTINGS;
		const parsed = JSON.parse(raw) as Partial<PrayerSettings>;
		return {
			...DEFAULT_SETTINGS,
			...parsed,
			adjustments: { ...DEFAULT_SETTINGS.adjustments, ...(parsed.adjustments ?? {}) },
			// The website has no notifications/haptics/map/theme prefs — keep the app shape
			// intact but always use the inert defaults for those fields.
			notifications: DEFAULT_SETTINGS.notifications,
		};
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
		return raw ? (JSON.parse(raw) as NamedLocation) : null;
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
