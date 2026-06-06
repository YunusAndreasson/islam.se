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
import { solarParams, sunPositionAt } from "../lib/bonetider/solar/sun";
import { CHANGE_EVENT, loadLocation, loadSettings, saveLocation } from "../lib/bonetider/storage";

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
}

const instances: Instance[] = [];

// Skip the canvas render for off-screen fields. rootMargin pre-renders just before
// a field scrolls in, so there's no pop-in. Fail-open if the API is missing.
const visObserver =
	typeof IntersectionObserver !== "undefined"
		? new IntersectionObserver(
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
			)
		: null;

function schemeNow(): Scheme {
	const explicit = document.documentElement.dataset.theme;
	if (explicit === "dark" || explicit === "light") return explicit;
	return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveLocation(inst: Instance): FieldLocation {
	if (inst.fixed) return inst.base;
	const stored = loadLocation();
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
	if (render) visObserver?.observe(el);
	paint(inst, new Date());
}

/** Is the sun above the horizon over a place right now? Drives the strip's sun/moon icon. */
function isDaylight(loc: FieldLocation, now: Date): boolean {
	const { declRad, eotMin } = solarParams(now);
	const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes() + now.getUTCSeconds() / 60;
	return sunPositionAt(loc.latitude, loc.longitude, utcMin, declRad, eotMin).altDeg >= 0;
}

function paint(inst: Instance, now: Date): void {
	const settings = loadSettings();
	const location = resolveLocation(inst);
	const scheme = schemeNow();
	// Skip the (expensive) canvas render when the field is scrolled off-screen; the
	// cheap readout below still updates so times are fresh the moment it scrolls in.
	if (inst.visible) inst.render?.({ location, settings, scheme, variant: "home" }, now);
	if (inst.readout.dayIcon) inst.readout.dayIcon.dataset.day = String(isDaylight(location, now));
	updateReadout(inst, now, location);
}

function updateReadout(inst: Instance, now: Date, location: FieldLocation): void {
	const settings = loadSettings();
	const today = computePrayerTimes(location, now, settings);
	for (const key of PRAYER_ORDER) {
		inst.readout.times.get(key)?.replaceChildren(document.createTextNode(formatTime(today[key])));
	}

	// Next prayer (rolling to tomorrow's Fajr once the day's are all past).
	let nextKey = nextPrayerKeyAt(today, now.getTime());
	let target: number;
	if (nextKey) {
		target = today[nextKey].getTime();
	} else {
		const tomorrow = computePrayerTimes(location, new Date(now.getTime() + 86400000), settings);
		nextKey = "fajr";
		target = tomorrow.fajr.getTime();
	}

	for (const [key, row] of inst.readout.rows) row.classList.toggle("is-next", key === nextKey);
	if (inst.readout.nextName && nextKey) inst.readout.nextName.textContent = PRAYER_LABELS[nextKey];
	if (inst.readout.nextSub && nextKey)
		inst.readout.nextSub.textContent = PRAYER_SWEDISH_NAMES[nextKey];
	if (inst.readout.countdown) {
		inst.readout.countdown.textContent = Number.isFinite(target)
			? formatCountdown(target - now.getTime())
			: "—";
	}
	if (inst.readout.place) inst.readout.place.textContent = location.name;
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
			const location = resolveLocation(inst);
			if (repaint) paint(inst, now);
			else updateCountdownOnly(inst, now, location); // cheap per-second countdown
		}
	};
	tick();
	window.setInterval(tick, 1000);
}

// Per-second path: only the countdown text changes (avoids recomputing the grid/wash).
function updateCountdownOnly(inst: Instance, now: Date, location: FieldLocation): void {
	if (!inst.readout.countdown) return;
	const settings = loadSettings();
	const today = computePrayerTimes(location, now, settings);
	const nextKey = nextPrayerKeyAt(today, now.getTime());
	let target: number;
	if (nextKey) target = today[nextKey].getTime();
	else
		target = computePrayerTimes(
			location,
			new Date(now.getTime() + 86400000),
			settings,
		).fajr.getTime();
	inst.readout.countdown.textContent = Number.isFinite(target)
		? formatCountdown(target - now.getTime())
		: "—";
}

function repaintAll(): void {
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
