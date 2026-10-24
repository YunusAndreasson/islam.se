// Everything the moskéskärm (/bonetider/skarm/visa/) needs, and the URL hash it
// travels in.
//
// Why the hash and not the query string, and not localStorage:
//
//  • The hash never reaches the server, so it cannot fragment the Cloudflare cache key
//    for a route that is otherwise one static file for every mosque in Sweden.
//  • A screen is configured on a phone and opened on a television. The config has to
//    survive being mailed, texted, bookmarked or turned into a QR code — a URL does,
//    localStorage does not.
//  • A TV browser that clears site data on update would otherwise silently forget the
//    mosque's iqāma times. The URL is the source of truth; storage is only a fallback
//    for a bare hash (see readScreenConfig).
//
// Only non-default values are written, so the common case stays short:
//   #ort=goteborg&ortnamn=G%C3%B6teborg&lat=57.70&lon=11.97&namn=Bellevuemosk%C3%A9n
//
// The coordinates and the ort's display name are BAKED IN rather than resolved from
// the slug on the screen. places-index.ts pulls in places.ts — 438 kB of GeoNames
// source — and dragging that onto a television to look up two numbers and a string
// would be the single heaviest thing on the page. The builder is an ordinary site
// page that already pays for that dataset, so it resolves the slug once and writes
// the answer into the URL. The slug is kept for provenance and for the "hela
// schemat" link back to /bonetider/<ort>/.

import { DEFAULT_COORDS, DEFAULT_SETTINGS, type PrayerSettings } from "./settings";
import { sanitizeSettings } from "./storage";

/** The five obligatory prayers. Shurūq is in PRAYER_ORDER but is not prayed in
 *  congregation, so it never carries an iqāma. */
export const IQAMA_KEYS = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;
export type IqamaKey = (typeof IQAMA_KEYS)[number];

/** How a mosque states the congregation time for one prayer.
 *
 *  `offset` is the default because it follows the sun all year and never needs
 *  touching — the failure mode of a mosque screen is that nobody comes back to it.
 *  `at` pins the row to a clock time regardless of the sun, which is what a mosque
 *  that prays ʿIshāʾ at 21:00 all summer actually does; it wins over `offset` and is
 *  the thing the builder warns about when it drifts. */
export interface IqamaRule {
	/** Minutes after the calculated time. 0 means no iqāma is shown for this prayer —
	 *  a mosque that does not hold Fajr in congregation leaves the row blank, and
	 *  "same minute as the adhān" is not a thing any mosque does. */
	offset: number;
	/** "HH:MM" in Europe/Stockholm. Overrides `offset` when present. */
	at?: string;
}

export interface ScreenConfig {
	/** Bönetider place slug — provenance and the link back to the full schedule. It is
	 *  deliberately NOT the source of the coordinates; see the note at the top. */
	ort: string;
	/** The ort's display name, baked in by the builder. */
	ortName: string;
	/** The mosque's name. Empty on a zero-config screen, where the ort stands alone. */
	name: string;
	/** The line under the name — district and town. Empty falls back to the ort name. */
	place: string;
	/** The coordinates the times and the map marker are computed from. A link from a
	 *  mosque page carries the mosque's own, so the marker lands on the building
	 *  rather than the town centre. */
	lat: number;
	lon: number;
	iqama: Record<IqamaKey, IqamaRule>;
	/** Khutba time, "HH:MM". Replaces Ẓuhr on Fridays, as the printed month sheet
	 *  already does (see pdf.ts). Empty means the mosque holds no jumuʿa here. */
	jumua: string;
	/** One line of the mosque's own copy along the bottom. */
	notice: string;
	/** How long the quiet state holds after an iqāma, in minutes. */
	quietMinutes: number;
	settings: PrayerSettings;
}

const DEFAULT_IQAMA_OFFSET = 15;
const DEFAULT_QUIET_MINUTES = 10;
/** One line, read from across a room. Past this it stops being a notice. */
const NOTICE_MAX = 120;

export const DEFAULT_SCREEN_CONFIG: ScreenConfig = {
	ort: "stockholm",
	ortName: DEFAULT_COORDS.name,
	name: "",
	place: "",
	lat: DEFAULT_COORDS.latitude,
	lon: DEFAULT_COORDS.longitude,
	iqama: {
		fajr: { offset: DEFAULT_IQAMA_OFFSET },
		dhuhr: { offset: DEFAULT_IQAMA_OFFSET },
		asr: { offset: DEFAULT_IQAMA_OFFSET },
		maghrib: { offset: 5 }, // Maghrib is prayed soon after the adhān everywhere.
		isha: { offset: DEFAULT_IQAMA_OFFSET },
	},
	jumua: "",
	notice: "",
	quietMinutes: DEFAULT_QUIET_MINUTES,
	settings: DEFAULT_SETTINGS,
};

/** "HH:MM" on a 24-hour clock, or "" for absent. Anything else is discarded rather
 *  than coerced: a half-parsed time on a wall in a mosque is worse than no time. */
function isClockTime(value: string): boolean {
	const m = /^(\d{1,2}):(\d{2})$/.exec(value);
	if (!m) return false;
	const h = Number(m[1]);
	const min = Number(m[2]);
	return h >= 0 && h <= 23 && min >= 0 && min <= 59;
}

/** Normalises "9:05" to "09:05" so the screen's tabular figures line up. */
export function normalizeClockTime(value: string): string {
	const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
	if (!m) return "";
	const h = Number(m[1]);
	const min = Number(m[2]);
	if (h < 0 || h > 23 || min < 0 || min > 59) return "";
	return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Hash encoding
// ---------------------------------------------------------------------------

// Swedish parameter names, like the existing ?lan= on /moskeer — a mosque that opens
// the URL to check it should be able to read it.
const P = {
	ort: "ort",
	ortName: "ortnamn",
	name: "namn",
	place: "plats",
	lat: "lat",
	lon: "lon",
	iqama: "iq",
	jumua: "jumua",
	notice: "anslag",
	quiet: "tyst",
	method: "metod",
	madhab: "madhab",
	highLat: "hoglat",
	polar: "polar",
	shafaq: "shafaq",
	rounding: "avrund",
	adjust: "just",
	hijri: "hijri",
	/** Debug: an ISO instant the screen pretends "now" is, so a whole day can be
	 *  stepped through in seconds instead of waited out. */
	now: "nu",
} as const;

/** `15` = fifteen minutes after the adhān; `@05:00` = pinned; `0` = no iqāma. */
function encodeIqamaRule(rule: IqamaRule): string {
	if (rule.at && isClockTime(rule.at)) return `@${normalizeClockTime(rule.at)}`;
	return String(Math.round(rule.offset));
}

function decodeIqamaRule(token: string, fallback: IqamaRule): IqamaRule {
	if (token.startsWith("@")) {
		const at = normalizeClockTime(token.slice(1));
		return at === "" ? fallback : { offset: fallback.offset, at };
	}
	const n = Number(token);
	if (!Number.isFinite(n)) return fallback;
	// A negative iqāma (before the adhān) is never right and a 12-hour one is a typo.
	return { offset: Math.min(180, Math.max(0, Math.round(n))) };
}

function sameIqama(a: Record<IqamaKey, IqamaRule>, b: Record<IqamaKey, IqamaRule>): boolean {
	return IQAMA_KEYS.every((k) => encodeIqamaRule(a[k]) === encodeIqamaRule(b[k]));
}

/** The config as a hash body (no leading "#"), omitting everything still at default. */
export function encodeScreenConfig(config: ScreenConfig): string {
	const p = new URLSearchParams();
	const d = DEFAULT_SCREEN_CONFIG;
	p.set(P.ort, config.ort);
	if (config.ortName !== d.ortName) p.set(P.ortName, config.ortName);
	if (config.name !== "") p.set(P.name, config.name);
	if (config.place !== "") p.set(P.place, config.place);
	// Four decimals is ~11 m — finer than the difference between a mosque's door and
	// its car park, and two characters shorter each than five.
	if (config.lat !== d.lat || config.lon !== d.lon) {
		p.set(P.lat, trimCoord(config.lat));
		p.set(P.lon, trimCoord(config.lon));
	}
	if (!sameIqama(config.iqama, d.iqama))
		p.set(P.iqama, IQAMA_KEYS.map((k) => encodeIqamaRule(config.iqama[k])).join("-"));
	if (config.jumua !== "") p.set(P.jumua, config.jumua);
	if (config.notice !== "") p.set(P.notice, config.notice);
	if (config.quietMinutes !== d.quietMinutes) p.set(P.quiet, String(config.quietMinutes));

	const s = config.settings;
	const ds = DEFAULT_SETTINGS;
	if (s.calculationMethod !== ds.calculationMethod) p.set(P.method, s.calculationMethod);
	if (s.madhab !== ds.madhab) p.set(P.madhab, s.madhab);
	if (s.highLatitudeRule !== ds.highLatitudeRule) p.set(P.highLat, s.highLatitudeRule);
	if (s.polarCircleResolution !== ds.polarCircleResolution) p.set(P.polar, s.polarCircleResolution);
	if (s.shafaq !== ds.shafaq) p.set(P.shafaq, s.shafaq);
	if (s.rounding !== ds.rounding) p.set(P.rounding, s.rounding);
	if (s.hijriOffset !== ds.hijriOffset) p.set(P.hijri, String(s.hijriOffset));
	const adj = [
		s.adjustments.fajr,
		s.adjustments.sunrise,
		s.adjustments.dhuhr,
		s.adjustments.asr,
		s.adjustments.maghrib,
		s.adjustments.isha,
	];
	if (adj.some((n) => n !== 0)) p.set(P.adjust, adj.join(","));

	return relaxFragment(p.toString());
}

/** URLSearchParams escapes for a query string, where ":" "," and "@" are unsafe. In a
 *  fragment they are legal sub-delimiters (RFC 3986 §3.5), and leaving them escaped
 *  costs two characters each — which matters because this URL becomes a QR code, and
 *  because a mosque checking its own link should be able to read "13:30" in it. */
function relaxFragment(query: string): string {
	return query.replaceAll("%3A", ":").replaceAll("%2C", ",").replaceAll("%40", "@");
}

/** Fixed to four decimals with trailing zeros dropped — "57.7343", "11.98". */
function trimCoord(n: number): string {
	return n.toFixed(4).replace(/\.?0+$/, "");
}

function intOrDefault(raw: string | null, fallback: number, min: number, max: number): number {
	if (raw === null) return fallback;
	const n = Number(raw);
	if (!Number.isFinite(n)) return fallback;
	return Math.min(max, Math.max(min, Math.round(n)));
}

/** Why a screen tells the room when its config was wrong. A blank wall is obviously
 *  broken and someone fixes it; a wall showing Stockholm's Maghrib in Kiruna looks
 *  perfect and is wrong by fifty minutes. Anything the decoder had to guess at is
 *  reported, and the screen says so quietly rather than pretending. */
export interface ConfigIssue {
	key: string;
	reason: "malformed" | "out-of-range" | "missing" | "truncated";
	/** Swedish, and written for whoever walks past the screen, not for a developer. */
	message: string;
}

/** Sweden plus a working margin. A coordinate outside it is a typo or a mangled URL,
 *  never a Swedish mosque, and honouring it would put the marker in the Atlantic. */
const SWEDEN_LAT = [54, 70] as const;
const SWEDEN_LON = [10, 25] as const;

/** A coordinate is only honoured as a pair, and only where a Swedish mosque could be.
 *  Half a pair would silently put the marker on the null island. */
function coordPair(rawLat: string | null, rawLon: string | null): [number, number] | null {
	if (rawLat === null || rawLon === null) return null;
	const lat = Number(rawLat);
	const lon = Number(rawLon);
	if (!(Number.isFinite(lat) && Number.isFinite(lon))) return null;
	if (lat < SWEDEN_LAT[0] || lat > SWEDEN_LAT[1]) return null;
	if (lon < SWEDEN_LON[0] || lon > SWEDEN_LON[1]) return null;
	return [lat, lon];
}

/** Decode a hash body. Never throws and never returns a partial object: anything
 *  unparseable falls back to the default for that field, so a mangled URL still
 *  shows a working screen rather than a blank wall — and `issues` says what it had
 *  to guess, so the screen can admit it. */
export function decodeScreenConfig(hash: string): { config: ScreenConfig; issues: ConfigIssue[] } {
	const issues: ConfigIssue[] = [];
	const body = hash.startsWith("#") ? hash.slice(1) : hash;
	const p = new URLSearchParams(body);
	const d = DEFAULT_SCREEN_CONFIG;

	const iqamaTokens = (p.get(P.iqama) ?? "").split("-");
	const iqama = {} as Record<IqamaKey, IqamaRule>;
	IQAMA_KEYS.forEach((key, i) => {
		const token = iqamaTokens[i];
		iqama[key] =
			token === undefined || token === "" ? d.iqama[key] : decodeIqamaRule(token, d.iqama[key]);
	});

	const coords = coordPair(p.get(P.lat), p.get(P.lon));
	if (coords === null && (p.get(P.lat) !== null || p.get(P.lon) !== null))
		issues.push({
			key: "lat/lon",
			reason: "out-of-range",
			message: `Platsen i länken är ogiltig. Tiderna gäller ${d.ortName}.`,
		});
	const adjustTokens = (p.get(P.adjust) ?? "").split(",");
	const adjustAt = (i: number): number => intOrDefault(adjustTokens[i] ?? null, 0, -120, 120);

	const notice = (p.get(P.notice) ?? "").trim();
	if (notice.length > NOTICE_MAX)
		issues.push({
			key: P.notice,
			reason: "truncated",
			message: "Anslaget är för långt och har kortats.",
		});

	const config: ScreenConfig = {
		ort: (p.get(P.ort) ?? d.ort).trim() || d.ort,
		ortName: (p.get(P.ortName) ?? "").trim().slice(0, 60) || d.ortName,
		name: (p.get(P.name) ?? "").trim().slice(0, 80),
		place: (p.get(P.place) ?? "").trim().slice(0, 80),
		lat: coords === null ? d.lat : coords[0],
		lon: coords === null ? d.lon : coords[1],
		iqama,
		jumua: normalizeClockTime(p.get(P.jumua) ?? ""),
		notice: notice.slice(0, NOTICE_MAX),
		quietMinutes: intOrDefault(p.get(P.quiet), d.quietMinutes, 0, 60),
		settings: sanitizeSettings({
			calculationMethod: p.get(P.method),
			madhab: p.get(P.madhab),
			highLatitudeRule: p.get(P.highLat),
			polarCircleResolution: p.get(P.polar),
			shafaq: p.get(P.shafaq),
			rounding: p.get(P.rounding),
			hijriOffset: p.get(P.hijri),
			adjustments: {
				fajr: adjustAt(0),
				sunrise: adjustAt(1),
				dhuhr: adjustAt(2),
				asr: adjustAt(3),
				maghrib: adjustAt(4),
				isha: adjustAt(5),
			},
		}),
	};
	return { config, issues };
}

/** The debug clock offset, in milliseconds, or 0. `#nu=2026-09-12T15:40` makes the
 *  screen behave as if that were the moment — the only practical way to review a
 *  surface whose whole behaviour is a 24-hour cycle. */
export function decodeClockOffset(hash: string, realNow: number): number {
	const body = hash.startsWith("#") ? hash.slice(1) : hash;
	const raw = new URLSearchParams(body).get(P.now);
	if (raw === null) return 0;
	const t = Date.parse(raw);
	return Number.isFinite(t) ? t - realNow : 0;
}

// ---------------------------------------------------------------------------
// Resolving an iqāma against the day's calculated times
// ---------------------------------------------------------------------------

/** The congregation time for one prayer, or null when the mosque shows none.
 *
 *  A pinned time is placed on the same Stockholm day as the adhān it belongs to,
 *  which is what makes a pinned Fajr of "05:00" land on today's Fajr rather than on
 *  a UTC midnight somewhere else. */
export function resolveIqama(rule: IqamaRule, adhan: Date, timeZone: string): Date | null {
	if (Number.isNaN(adhan.getTime())) return null;
	if (rule.at && isClockTime(rule.at)) {
		const [h, m] = rule.at.split(":").map(Number);
		return atStockholmClock(adhan, h ?? 0, m ?? 0, timeZone);
	}
	if (rule.offset <= 0) return null;
	return new Date(adhan.getTime() + rule.offset * 60_000);
}

/** The instant on `anchor`'s Stockholm day at local clock time h:m. Derived by
 *  measuring the zone's offset at the anchor rather than assuming one, so it stays
 *  correct across the March and October changeovers. */
function atStockholmClock(anchor: Date, h: number, m: number, timeZone: string): Date {
	const parts = new Intl.DateTimeFormat("sv-SE", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(anchor);
	const get = (type: string): number =>
		Number(parts.find((part) => part.type === type)?.value ?? "0");
	const y = get("year");
	const mo = get("month");
	const d = get("day");
	// Guess at the anchor's own UTC offset, then correct once — enough for any zone
	// whose offset is a whole number of minutes, which is every zone in use.
	const guess = Date.UTC(y, mo - 1, d, h, m);
	const offset = zoneOffsetMs(new Date(guess), timeZone);
	return new Date(guess - offset);
}

function zoneOffsetMs(at: Date, timeZone: string): number {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hourCycle: "h23",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	}).formatToParts(at);
	const get = (type: string): number =>
		Number(parts.find((part) => part.type === type)?.value ?? "0");
	const asUtc = Date.UTC(
		get("year"),
		get("month") - 1,
		get("day"),
		get("hour"),
		get("minute"),
		get("second"),
	);
	return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Minutes a pinned iqāma sits away from the prayer it pins, for the builder to warn
 *  above a threshold. ⚠️ Not wired yet: no page calls it, only screen-config.test.ts. The
 *  screen itself never warns, because a wall in a mosque must not nag. */
export function pinnedDriftMinutes(rule: IqamaRule, adhan: Date, timeZone: string): number | null {
	if (!(rule.at && isClockTime(rule.at))) return null;
	const pinned = resolveIqama(rule, adhan, timeZone);
	if (pinned === null || Number.isNaN(adhan.getTime())) return null;
	return Math.round((pinned.getTime() - adhan.getTime()) / 60_000);
}
