// Client glue for every <PrayerField> on a page: wires the canvas renderer, keeps the
// readout (next prayer + live countdown + today's times) ticking, and re-renders when the
// user changes settings or location. Imported once; mounts all .bonetider-field nodes.
import {
	computePrayerTimes,
	formatTime,
	nextPrayerKeyAt,
	PRAYER_LABELS,
	PRAYER_ORDER,
	PRAYER_SWEDISH_NAMES,
	type PrayerKey,
} from "../lib/bonetider/prayer-times";
import {
	createFieldRenderer,
	type FieldLocation,
	type Scheme,
} from "../lib/bonetider/render-field";
import type { PrayerSettings } from "../lib/bonetider/settings";
import { solarParams, sunPositionAt } from "../lib/bonetider/solar/sun";
import { CHANGE_EVENT, loadLocation, loadSettings, saveLocation } from "../lib/bonetider/storage";

interface PrayerState {
	/** `day|settings|lat,lon` — the inputs the day's times depend on. */
	key: string;
	today: ReturnType<typeof computePrayerTimes>;
	nextKey: PrayerKey;
	target: number;
}

interface Instance {
	el: HTMLElement;
	fixed: boolean;
	base: FieldLocation;
	/** Whether the field is on (or near) screen. The per-minute canvas render is
	 *  skipped while off-screen — it's pure GPU/CPU waste on a long page. Defaults
	 *  true (fail-open: a field always renders unless proven off-screen). */
	visible: boolean;
	/** Present for map fields; absent for the canvas-less top strip. */
	render?: (
		cfg: Parameters<ReturnType<typeof createFieldRenderer>["render"]>[0],
		now: Date,
	) => void;
	readout: {
		nextName: HTMLElement | null;
		/** Optional Swedish gloss under/after the Arabic name (field overlay has it; strip omits it). */
		nextSub: HTMLElement | null;
		countdown: HTMLElement | null;
		place: HTMLElement | null;
		/** Strip only: the sun/moon icon container, toggled day vs night over the place. */
		dayIcon: HTMLElement | null;
		times: Map<PrayerKey, HTMLElement>;
		rows: Map<PrayerKey, HTMLElement>;
	};
	/** Cached prayer-time state, recomputed only when the day, settings, location, or the
	 *  current next-prayer target changes — NOT every second. The per-second tick reads
	 *  `target` from here and only re-renders the countdown string. */
	state?: PrayerState;
	/** The next-prayer key currently reflected in the DOM (is-next class + name), so a
	 *  roll-over between per-minute repaints can refresh those without a full readout rewrite. */
	renderedNextKey?: PrayerKey;
}

const instances: Instance[] = [];

// Settings and the stored location change rarely (only via the settings panel / location
// picker, which fire CHANGE_EVENT) but were being re-read from localStorage and JSON.parsed on
// every per-second tick, per field. Cache them in memory and invalidate on change, so the hot
// path touches neither localStorage nor the parser.
let cachedSettings: PrayerSettings | null = null;
let cachedSettingsKey = "";
function currentSettings(): PrayerSettings {
	if (!cachedSettings) {
		cachedSettings = loadSettings();
		cachedSettingsKey = JSON.stringify(cachedSettings);
	}
	return cachedSettings;
}

let storedLocationLoaded = false;
let cachedStoredLocation: ReturnType<typeof loadLocation> = null;
function currentStoredLocation(): ReturnType<typeof loadLocation> {
	if (!storedLocationLoaded) {
		cachedStoredLocation = loadLocation();
		storedLocationLoaded = true;
	}
	return cachedStoredLocation;
}

function invalidateStorageCache(): void {
	cachedSettings = null;
	storedLocationLoaded = false;
}

// Skip the canvas render for off-screen fields. rootMargin pre-renders just before
// a field scrolls in, so there's no pop-in. Fail-open if the API is missing.
const visObserver =
	typeof IntersectionObserver === "undefined"
		? null
		: new IntersectionObserver(
				(entries) => {
					for (const e of entries) {
						const inst = instances.find((i) => i.el === e.target);
						if (!inst) continue;
						const wasVisible = inst.visible;
						inst.visible = e.isIntersecting;
						// Becoming visible: render now rather than waiting for the next minute tick.
						if (inst.visible && !wasVisible) paint(inst, new Date());
					}
				},
				{ rootMargin: "200px" },
			);

function schemeNow(): Scheme {
	const explicit = document.documentElement.dataset.theme;
	if (explicit === "dark" || explicit === "light") return explicit;
	return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveLocation(inst: Instance): FieldLocation {
	if (inst.fixed) return inst.base;
	const stored = currentStoredLocation();
	return stored
		? { name: stored.name, latitude: stored.latitude, longitude: stored.longitude }
		: inst.base;
}

/** Swedish relative countdown: "om 1 tim 12 min" / "om 12 min" / "om 34 sek". */
function formatCountdown(ms: number): string {
	if (ms <= 0) return "nu";
	const totalMin = Math.floor(ms / 60000);
	const h = Math.floor(totalMin / 60);
	const m = totalMin % 60;
	if (totalMin < 1) return `om ${Math.floor(ms / 1000)} sek`;
	if (h === 0) return `om ${m} min`;
	return `om ${h} tim ${m} min`;
}

function mountOne(el: HTMLElement): void {
	if (el.dataset.bfMounted) return;
	el.dataset.bfMounted = "1";

	const base: FieldLocation = {
		name: el.dataset.name ?? "Stockholm",
		latitude: Number(el.dataset.lat ?? "59.3293"),
		longitude: Number(el.dataset.lon ?? "18.0686"),
	};
	const variant = el.dataset.variant === "full" ? "full" : "home";
	const fixed = el.dataset.fixed === "1";

	const times = new Map<PrayerKey, HTMLElement>();
	const rows = new Map<PrayerKey, HTMLElement>();
	for (const key of PRAYER_ORDER) {
		const row = el.querySelector<HTMLElement>(`[data-prayer="${key}"]`);
		if (row) {
			rows.set(key, row);
			const t = row.querySelector<HTMLElement>(".bf-t-time");
			if (t) times.set(key, t);
		}
	}

	// The top strip has no canvas — it's a readout only. Map fields get a renderer.
	const canvas = el.querySelector<HTMLCanvasElement>("canvas.bf-canvas");
	let render: Instance["render"];
	if (canvas) {
		const r = createFieldRenderer(canvas);
		render = (cfg, now) => r.render({ ...cfg, variant }, now);
	}

	const inst: Instance = {
		el,
		fixed,
		base,
		visible: true,
		render,
		readout: {
			nextName: el.querySelector(".bf-next-name"),
			nextSub: el.querySelector(".bf-next-sub"),
			countdown: el.querySelector(".bf-countdown"),
			place: el.querySelector(".bf-place"),
			dayIcon: el.querySelector(".bs-icon"),
			times,
			rows,
		},
	};
	instances.push(inst);
	// Only canvas fields are worth observing; the strip/readout have no render to skip.
	if (render) {
		// A below-the-fold canvas must NOT render at boot: the per-pixel twilight wash +
		// marching-squares contour build is a ~550ms long task that, on the homepage (the
		// map sits far down the page), blocks the hero image's LCP paint.
		//
		// Hand the visibility decision to the IntersectionObserver rather than reading
		// getBoundingClientRect here: a synchronous rect read at boot forces a full layout
		// (~30ms forced reflow on the long homepage) only to learn the map is off-screen.
		// The observer reports the same thing asynchronously, off the critical path, and
		// paints the field the instant it scrolls in — or right away (pre-paint) if it is
		// already on screen. Start hidden so the boot paint below skips the canvas; the
		// cheap readout still paints now, so times/countdown are live immediately. Fail
		// open to the visible:true default when IntersectionObserver is unavailable, so
		// those browsers still render the map at boot.
		if (visObserver) {
			inst.visible = false;
			visObserver.observe(el);
		}
	}
	paint(inst, new Date());
}

/** Is the sun above the horizon over a place right now? Drives the strip's sun/moon icon. */
function isDaylight(loc: FieldLocation, now: Date): boolean {
	const { declRad, eotMin } = solarParams(now);
	const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes() + now.getUTCSeconds() / 60;
	return sunPositionAt(loc.latitude, loc.longitude, utcMin, declRad, eotMin).altDeg >= 0;
}

function paint(inst: Instance, now: Date): void {
	const settings = currentSettings();
	const location = resolveLocation(inst);
	const scheme = schemeNow();
	const st = ensureState(inst, now, location, settings);
	// Skip the (expensive) canvas render when the field is scrolled off-screen; the
	// cheap readout below still updates so times are fresh the moment it scrolls in.
	if (inst.visible) inst.render?.({ location, settings, scheme, variant: "home" }, now);
	if (inst.readout.dayIcon) inst.readout.dayIcon.dataset.day = String(isDaylight(location, now));
	writeReadout(inst, now, st, location);
}

// The day's prayer times depend only on (day, settings, location); the next-prayer target only
// advances when a prayer passes. Compute both lazily and cache on the instance, so the
// per-second tick reuses them instead of re-running adhan's solar maths every second. Recomputes
// today's times on a day/settings/location change, and rolls the target forward (cheaply)
// whenever the current one has passed.
function ensureState(
	inst: Instance,
	now: Date,
	location: FieldLocation,
	settings: PrayerSettings,
): PrayerState {
	const dayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
	const key = `${dayKey}|${cachedSettingsKey}|${location.latitude},${location.longitude}`;
	let st = inst.state;
	if (!st || st.key !== key) {
		const today = computePrayerTimes(location, now, settings);
		st = { key, today, ...resolveNext(today, now, location, settings) };
		inst.state = st;
	} else if (now.getTime() >= st.target) {
		Object.assign(st, resolveNext(st.today, now, location, settings));
	}
	return st;
}

// The next prayer to count down to, rolling to tomorrow's Fajr once the day's are all past.
// Tomorrow's Fajr is computed only at that roll-over (then cached as the target), not per tick.
function resolveNext(
	today: ReturnType<typeof computePrayerTimes>,
	now: Date,
	location: FieldLocation,
	settings: PrayerSettings,
): { nextKey: PrayerKey; target: number } {
	const nk = nextPrayerKeyAt(today, now.getTime());
	if (nk) return { nextKey: nk, target: today[nk].getTime() };
	const tomorrowFajr = computePrayerTimes(
		location,
		new Date(now.getTime() + 86400000),
		settings,
	).fajr.getTime();
	return { nextKey: "fajr", target: tomorrowFajr };
}

// Full readout rewrite (per-minute / on change): today's six times, the next-prayer name and
// highlight, the countdown and the place. The per-second path (updateCountdownOnly) rewrites
// only the countdown string.
function writeReadout(inst: Instance, now: Date, st: PrayerState, location: FieldLocation): void {
	for (const key of PRAYER_ORDER) {
		inst.readout.times
			.get(key)
			?.replaceChildren(document.createTextNode(formatTime(st.today[key])));
	}
	for (const [key, row] of inst.readout.rows) row.classList.toggle("is-next", key === st.nextKey);
	if (inst.readout.nextName) inst.readout.nextName.textContent = PRAYER_LABELS[st.nextKey];
	if (inst.readout.nextSub) inst.readout.nextSub.textContent = PRAYER_SWEDISH_NAMES[st.nextKey];
	if (inst.readout.countdown) {
		inst.readout.countdown.textContent = Number.isFinite(st.target)
			? formatCountdown(st.target - now.getTime())
			: "—";
	}
	if (inst.readout.place) inst.readout.place.textContent = location.name;
	inst.renderedNextKey = st.nextKey;
}

/** Hide every "use my location" button when the browser has no Geolocation API
 *  (older browsers, insecure context) — a control that can't do anything reads as
 *  broken. Runs on every page-load, so view-transition pages are covered too. */
function hideUnsupportedGeo(): void {
	if ("geolocation" in navigator) return;
	for (const btn of document.querySelectorAll<HTMLElement>(".bf-geo")) btn.hidden = true;
}

function wireGeolocation(): void {
	document.addEventListener("click", (e) => {
		const btn = (e.target as HTMLElement)?.closest<HTMLButtonElement>(".bf-geo");
		// Ignore re-clicks while a lookup is in flight (the button is dimmed via aria-busy).
		if (!(btn && navigator.geolocation) || btn.getAttribute("aria-busy") === "true") return;
		const label = btn.textContent ?? "";
		btn.setAttribute("aria-busy", "true");
		// On failure the button has no adjacent status slot, so it speaks for itself:
		// a brief message in place of its label, then back. Success needs no message —
		// saveLocation fires the change event and every field repaints to the new place.
		const finish = (message?: string): void => {
			btn.removeAttribute("aria-busy");
			if (message) {
				btn.textContent = message;
				window.setTimeout(() => {
					btn.textContent = label;
				}, 3000);
			}
		};
		navigator.geolocation.getCurrentPosition(
			async (pos) => {
				// Load the 2 118-place dataset only on demand — it's far too big to ship in
				// the initial bundle just to name a GPS fix.
				const { INDEXED_PLACES } = await import("../lib/bonetider/places-index");
				let best = INDEXED_PLACES[0];
				let bestD = Infinity;
				for (const p of INDEXED_PLACES) {
					const d = (p.lat - pos.coords.latitude) ** 2 + (p.lon - pos.coords.longitude) ** 2;
					if (d < bestD) {
						bestD = d;
						best = p;
					}
				}
				saveLocation({
					name: best.name,
					latitude: pos.coords.latitude,
					longitude: pos.coords.longitude,
				});
				finish();
			},
			() => finish("Hittade inte platsen"),
			{ enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
		);
	});
}

let lastMinute = -1;
function startClock(): void {
	const tick = (): void => {
		const now = new Date();
		const minute = now.getHours() * 60 + now.getMinutes();
		const repaint = minute !== lastMinute; // canvas + times only need per-minute refresh
		lastMinute = minute;
		// Iterate backwards so detached fields (after a view transition) can be pruned.
		for (let i = instances.length - 1; i >= 0; i--) {
			const inst = instances[i];
			if (!inst.el.isConnected) {
				visObserver?.unobserve(inst.el);
				instances.splice(i, 1);
				continue;
			}
			if (repaint) paint(inst, now);
			else updateCountdownOnly(inst, now); // cheap per-second countdown (cached state)
		}
	};
	tick();
	window.setInterval(tick, 1000);
}

// Per-second path: reuse the cached prayer state (no adhan recompute) and rewrite only the
// countdown string. ensureState rolls the target forward cheaply when a prayer passes; on that
// roll the next-prayer name/highlight is refreshed too, so the page stays correct between the
// per-minute repaints.
function updateCountdownOnly(inst: Instance, now: Date): void {
	if (!inst.readout.countdown) return;
	const settings = currentSettings();
	const location = resolveLocation(inst);
	const st = ensureState(inst, now, location, settings);
	if (inst.renderedNextKey !== st.nextKey) {
		for (const [key, row] of inst.readout.rows) row.classList.toggle("is-next", key === st.nextKey);
		if (inst.readout.nextName) inst.readout.nextName.textContent = PRAYER_LABELS[st.nextKey];
		if (inst.readout.nextSub) inst.readout.nextSub.textContent = PRAYER_SWEDISH_NAMES[st.nextKey];
		inst.renderedNextKey = st.nextKey;
	}
	inst.readout.countdown.textContent = Number.isFinite(st.target)
		? formatCountdown(st.target - now.getTime())
		: "—";
}

function repaintAll(): void {
	// A settings or location change fired CHANGE_EVENT — drop the cached settings/location so
	// the repaint (and the new instance state keys) pick up the new values.
	invalidateStorageCache();
	const now = new Date();
	for (const inst of instances) paint(inst, now);
}

function mountAll(): void {
	// .bonetider-readout is a canvas-less today's-times list (the city pages' "Dagens
	// bönetider" block): mounted like the strip so its per-prayer times track the
	// visitor's saved method/madhab live, instead of being frozen at the SSR default.
	for (const el of document.querySelectorAll<HTMLElement>(
		".bonetider-field, .bonetider-strip, .bonetider-readout",
	))
		mountOne(el);
}

let booted = false;
export function boot(): void {
	mountAll();
	hideUnsupportedGeo();
	if (booted) {
		repaintAll();
		return;
	}
	booted = true;
	startClock();
	wireGeolocation();
	window.addEventListener(CHANGE_EVENT, repaintAll);
	window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", repaintAll);
}

// Mount on first load and after every Astro view transition.
document.addEventListener("astro:page-load", boot);
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
