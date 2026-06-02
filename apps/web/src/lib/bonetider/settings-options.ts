// Selectable options for every prayer-time setting the web UI exposes, plus the
// small label helpers a collapsed group uses for its summary line. Ported from the
// app's settings/options.ts (the Swedish copy is shared verbatim) minus the
// app-only theme / map-style / MapTiler pickers, which the website doesn't have.
import type {
	CalculationMethodKey,
	HighLatitudeRuleKey,
	Madhab,
	PolarCircleResolutionKey,
	PrayerSettings,
	Rounding,
	Shafaq,
} from "./settings";

export interface Option<T extends string> {
	value: T;
	label: string;
	description?: string;
}

// Sweden-first and Sweden-only by intent: a Swedish-Muslim user is realistically
// served by one of MWL / Diyanet / Umm al-Qura / Egyptian / Moonsighting / ISNA.
// Gulf-specific methods stay in CalculationMethodKey for back-compat but aren't offered.
export const METHOD_OPTIONS: readonly Option<CalculationMethodKey>[] = [
	{
		value: "MuslimWorldLeague",
		label: "Muslim World League",
		description: "Fajr 18°, Isha 17° · rekommenderad i Sverige",
	},
	{ value: "Turkey", label: "Turkiet (Diyanet)", description: "Fajr 18°, Isha 17°" },
	{
		value: "UmmAlQura",
		label: "Umm al-Qura (Mecka)",
		description: "Fajr 18,5°, Isha efter 90 min",
	},
	{ value: "Egyptian", label: "Egyptiska myndigheten", description: "Fajr 19,5°, Isha 17,5°" },
	{
		value: "MoonsightingCommittee",
		label: "Moonsighting Committee",
		description: "Fajr 18°, Isha 18° (shafaq)",
	},
	{ value: "NorthAmerica", label: "Nordamerika (ISNA)", description: "Fajr 15°, Isha 15°" },
	{ value: "Other", label: "Annan", description: "Anpassad – 0° (justera manuellt)" },
];

export const MADHAB_OPTIONS: readonly Option<Madhab>[] = [
	{ value: "shafi", label: "Standard", description: "Shafiʿi, Maliki, Hanbali – tidigare Asr" },
	{ value: "hanafi", label: "Hanafi", description: "Senare Asr" },
];

export const HIGHLAT_OPTIONS: readonly Option<HighLatitudeRuleKey>[] = [
	{
		value: "auto",
		label: "Automatisk (rekommenderad)",
		description: "Väljs efter platsens latitud",
	},
	{ value: "middleOfTheNight", label: "Nattens mitt" },
	{ value: "seventhOfTheNight", label: "Sjundedel av natten" },
	{ value: "twilightAngle", label: "Skymningsvinkel" },
];

export const POLAR_OPTIONS: readonly Option<PolarCircleResolutionKey>[] = [
	{ value: "aqrabBalad", label: "Närmaste lämpliga plats", description: "Aqrab al-Balad" },
	{ value: "aqrabYaum", label: "Närmaste lämpliga dag", description: "Aqrab al-Yaum" },
	{
		value: "unresolved",
		label: "Oberäknad",
		description: "Visa ingen tid när den inte kan beräknas",
	},
];

export const SHAFAQ_OPTIONS: readonly Option<Shafaq>[] = [
	{ value: "general", label: "Allmän", description: "Röd och vit skymning" },
	{ value: "ahmer", label: "Ahmer (röd)", description: "Tidigare Isha" },
	{ value: "abyad", label: "Abyad (vit)", description: "Senare Isha" },
];

export const ROUNDING_OPTIONS: readonly Option<Rounding>[] = [
	{ value: "nearest", label: "Närmaste minut" },
	{ value: "up", label: "Uppåt" },
	{ value: "none", label: "Ingen" },
];

const labelOf = <T extends string>(options: readonly Option<T>[], value: T): string =>
	options.find((o) => o.value === value)?.label ?? "";

export const methodLabel = (s: PrayerSettings): string =>
	labelOf(METHOD_OPTIONS, s.calculationMethod);
export const madhabLabel = (s: PrayerSettings): string => labelOf(MADHAB_OPTIONS, s.madhab);
export const highLatLabel = (s: PrayerSettings): string =>
	labelOf(HIGHLAT_OPTIONS, s.highLatitudeRule);
