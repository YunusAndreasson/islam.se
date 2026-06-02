// User-tunable prayer-time settings and their defaults. These map onto adhan's
// CalculationParameters (see ../prayer-times.ts) but stay framework-agnostic so
// they can be JSON-serialised straight into AsyncStorage (see ./store.ts).

/** The 13 adhan calculation-method presets, keyed by their CalculationMethod factory name. */
export type CalculationMethodKey =
	| "MuslimWorldLeague"
	| "Egyptian"
	| "Karachi"
	| "UmmAlQura"
	| "Dubai"
	| "Qatar"
	| "Kuwait"
	| "MoonsightingCommittee"
	| "Singapore"
	| "Turkey"
	| "Tehran"
	| "NorthAmerica"
	| "Other";

export type Madhab = "shafi" | "hanafi";

/** 'auto' resolves to adhan's HighLatitudeRule.recommended(coords) at compute time. */
export type HighLatitudeRuleKey =
	| "auto"
	| "middleOfTheNight"
	| "seventhOfTheNight"
	| "twilightAngle";

export type PolarCircleResolutionKey = "aqrabBalad" | "aqrabYaum" | "unresolved";

/** Only meaningful for the MoonsightingCommittee method. */
export type Shafaq = "general" | "ahmer" | "abyad";

export type Rounding = "nearest" | "up" | "none";

/** Appearance preference for the whole app (basemap, chrome, screens). `'system'`
 *  follows the OS (Settings → Display) and is the default — Apple Maps-style.
 *  `'light'` / `'dark'` lock the app to one palette regardless of the OS. */
export type ThemePreference = "system" | "light" | "dark";

/** Bönetider basemap. `'nordic'` is the custom warm-parchment / cool-navy
 *  cartography (the original Nordic Calm look — recommended). `'standard'` swaps
 *  in MapTiler's classic OSM streets style, more detail at city zoom for users
 *  who want roads + transit + addresses. `'satellite'` shows MapTiler's aerial
 *  imagery — useful for landmark recognition. The solar wash + prayer-line +
 *  city overlays continue rendering on top of every basemap. The 'standard' /
 *  'satellite' options require a MapTiler key bundled at build time. */
export type MapStyleId = "nordic" | "standard" | "satellite";

/** The six computed prayer slots plus sunrise, used as adjustment keys. */
export interface PrayerAdjustments {
	fajr: number;
	sunrise: number;
	dhuhr: number;
	asr: number;
	maghrib: number;
	isha: number;
}

export interface NamedLocation {
	name: string;
	latitude: number;
	longitude: number;
}

export type LocationMode = "gps" | "manual";

/** Local prayer-time alerts. Off by default — turning it on triggers the OS
    permission prompt. Per-prayer toggles cover the five obligatory prayers. */
export interface NotificationSettings {
	enabled: boolean;
	/** Minutes before the prayer time to fire the alert (0 = exactly at the time).
      A heads-up so you can leave for the mosque before the adhan. */
	leadMinutes: number;
	prayers: {
		fajr: boolean;
		dhuhr: boolean;
		asr: boolean;
		maghrib: boolean;
		isha: boolean;
	};
}

export interface PrayerSettings {
	calculationMethod: CalculationMethodKey;
	madhab: Madhab;
	highLatitudeRule: HighLatitudeRuleKey;
	polarCircleResolution: PolarCircleResolutionKey;
	shafaq: Shafaq;
	adjustments: PrayerAdjustments;
	rounding: Rounding;
	/** Day offset applied to the Hijri-date display, to match local moon-sighting. */
	hijriOffset: number;
	notifications: NotificationSettings;
	locationMode: LocationMode;
	/** Chosen city/coordinate when locationMode is 'manual'. */
	manualLocation: NamedLocation | null;
	/** Appearance preference. `'system'` follows the OS (default); `'light'` and
	 *  `'dark'` lock the app's basemap, wash, prayer-line and chrome palettes. */
	theme: ThemePreference;
	/** Bönetider basemap. Defaults to the custom Nordic cartography. */
	mapStyle: MapStyleId;
	/** Haptic feedback (selection ticks, snaps, the qibla-lock confirm). On by
	 *  default; turning it off silences every haptic app-wide via the haptics
	 *  wrapper's module flag (see src/lib/haptics.ts + ./context.tsx). */
	haptics: boolean;
}

export const DEFAULT_SETTINGS: PrayerSettings = {
	calculationMethod: "MuslimWorldLeague",
	madhab: "shafi",
	// 'auto' (recommended) picks SeventhOfTheNight for most of Sweden — the right
	// default at these latitudes rather than the library's bare MiddleOfTheNight.
	highLatitudeRule: "auto",
	// AqrabBalad keeps Fajr/Isha derivable north of the Arctic Circle (e.g. Kiruna
	// under the midnight sun), where 'unresolved' would return Invalid Date.
	polarCircleResolution: "aqrabBalad",
	shafaq: "general",
	adjustments: { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
	rounding: "nearest",
	hijriOffset: 0,
	// Off by default: enabling it is what asks the OS for permission.
	notifications: {
		enabled: false,
		leadMinutes: 0,
		prayers: { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true },
	},
	locationMode: "gps",
	manualLocation: null,
	theme: "system",
	mapStyle: "nordic",
	haptics: true,
};

/** Fallback coordinate when GPS is unavailable and no manual location is set.
    The Byt plats picker (src/app/(settings)/byt-plats.tsx) writes its own
    NamedLocation when the user chooses a place — the picker pool is the bundled
    PLACES dataset, see src/lib/places/data.ts. */
export const DEFAULT_COORDS: NamedLocation = {
	name: "Stockholm",
	latitude: 59.3293,
	longitude: 18.0686,
};
