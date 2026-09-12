// The moskéskärm's engine.
//
// Deliberately NOT an extension of bonetider-field.ts. That module is tuned for an
// article page — it stops ticking when the tab is hidden, sleeps to the minute boundary
// when nothing needs seconds, and prunes instances after a view transition. Every one of
// those is wrong on a wall: `document.hidden` on a kiosk usually means the panel blanked,
// not that nobody cares, and the screen must be correct the instant it lights again.
//
// What it shares instead is the LIBRARY — computePrayerTimes, nextPrayerKeyAt,
// stockholmDayKey, createFieldRenderer — so there is one prayer-time implementation on
// the site and this file owns only the things a wall needs: a camera that moves, a ground
// that follows the sun, a quiet state at the iqāma, and enough self-defence to run for
// months with nobody watching.

import {
	type CameraSchedule,
	cameraAround,
	cameraAt,
	cameraForBBox,
	DEFAULT_SCHEDULE,
} from "../lib/bonetider/camera";
import {
	driftMessage,
	groundFor,
	inQuietWindow,
	isReloadSafe,
	nightlyReloadMinute,
	pixelShiftAt,
} from "../lib/bonetider/kiosk";
import {
	computePrayerTimes,
	dateForStockholmDay,
	formatTime,
	nextPrayerKeyAt,
	PRAYER_LABELS,
	PRAYER_ORDER,
	PRAYER_SWEDISH_NAMES,
	type PrayerKey,
	stockholmDateParts,
	stockholmDayKey,
	TIME_ZONE,
} from "../lib/bonetider/prayer-times";
import {
	decodeClockOffset,
	decodeScreenConfig,
	IQAMA_KEYS,
	type IqamaKey,
	resolveIqama,
	type ScreenConfig,
} from "../lib/bonetider/screen-config";
import { sunAltitudeDeg } from "../lib/bonetider/solar/sun";
import { hijriLabel } from "../lib/markesdagar";

/** The site's own palette, both halves, as literals — a registered @property needs a
 *  real colour, not a var() reference. Mirrors tokens.css; see MosqueScreen.astro. */
const GROUNDS = {
	day: { bg: "#fff6e8", ink: "#1a1914", muted: "#776d61", brass: "#b8862f" },
	night: { bg: "#1d1912", ink: "#e8e5e0", muted: "#bdb6aa", brass: "#c89a48" },
} as const;

/** How wide the close camera frames the country around the mosque. Ten degrees of
 *  latitude is about Malmö to Stockholm: close enough that the line visibly arrives on
 *  this town, wide enough that it is still a map of Sweden and not a street. */
const CLOSE_SPAN_DEG = 10;

const STORE_KEY = "bonetider:skarm";
const LAST_RELOAD_KEY = "bonetider:skarm:lastReload";

type Scheme = "light" | "dark";
type Renderer = { render(cfg: Record<string, unknown>, now: Date): void };

interface DayState {
	key: string;
	times: ReturnType<typeof computePrayerTimes>;
	/** Congregation times, null where the mosque holds none. */
	iqama: Map<IqamaKey, Date | null>;
	/** Tomorrow's Fajr, so the countdown after ʿIshāʾ does not recompute every second. */
	tomorrowFajr: number;
	/** Every instant the room cares about — what the reload guard checks against. */
	moments: number[];
}

function mount(root: HTMLElement): void {
	// Framed means the builder's live preview. It is the real display page — that is the
	// point of previewing it — but it must not take the wake lock, hide the cursor,
	// schedule a reload or offer a fullscreen button inside somebody's settings form.
	const preview = root.dataset.preview === "1" || window.self !== window.top;
	const found = root.querySelector<HTMLCanvasElement>(".ms-canvas");
	if (!found) return;
	// Re-bound after the guard: TypeScript does not carry the narrowing into the nested
	// closures below, and every one of them needs the element.
	const canvas: HTMLCanvasElement = found;

	// ---- config ----------------------------------------------------------
	const hash = window.location.hash;
	const decoded = decodeScreenConfig(hash.length > 1 ? hash : readStoredHash());
	const config: ScreenConfig = decoded.config;
	// NOT in the preview. The builder's iframe is a real load of this page on the same
	// origin, so every debounced keystroke in the form would rewrite the one STORE_KEY that
	// every screen on this device falls back to — configuring a second wall would quietly
	// take the first one's offline config with it. Exactly the cross-contamination the
	// settings form's `detached` mode exists to prevent for prayer settings.
	if (!preview && hash.length > 1) storeHash(hash.slice(1));

	// ---- clock -----------------------------------------------------------
	// One seam. Nothing else in this file calls Date.now(): the debug offset that lets a
	// whole day be stepped through in seconds, and the measured server skew that corrects
	// a drifting signage clock, both have to apply everywhere or nowhere.
	const debugOffset = decodeClockOffset(hash, Date.now());
	let skewMs = 0;
	const now = (): Date => new Date(Date.now() + debugOffset + skewMs);

	const bootedAt = Date.now();
	const els = collect(root);
	let day: DayState | null = null;
	let renderer: Renderer | null = null;
	let lastMinute = -1;
	let lastGround: Ground | "" = "";
	let lastShift = "";
	let rafHandle = 0;
	let tickTimer: number | undefined;
	let lastBeat = performance.now();
	let stalls = 0;
	let reloading = false;

	// ---- static copy -----------------------------------------------------
	els.mosque.textContent = config.name || config.ortName;
	els.place.textContent = config.place || (config.name ? config.ortName : "");
	els.notice.textContent = config.notice;
	// Kept, because the clock message below shares this line and must not erase it. Of the
	// two, the decode issue is the one that cannot be discovered any other way: a screen
	// showing Stockholm's Maghrib in Kiruna looks perfectly healthy, which is the whole
	// argument for printing it (screen-config.ts).
	const decodeIssue = decoded.issues.map((i) => i.message).join(" ");
	let driftIssue = "";
	function writeIssue(): void {
		const text = [decodeIssue, driftIssue].filter((s) => s !== "").join(" ");
		els.issue.textContent = text;
		els.issue.hidden = text === "";
	}
	writeIssue();

	const location = {
		name: config.name || config.ortName,
		latitude: config.lat,
		longitude: config.lon,
	};

	// ---- the day ---------------------------------------------------------
	function ensureDay(at: Date): DayState {
		const key = stockholmDayKey(at);
		if (day && day.key === key) return day;
		const times = computePrayerTimes(location, at, config.settings);
		const iqama = new Map<IqamaKey, Date | null>();
		const moments: number[] = [];
		for (const k of PRAYER_ORDER) {
			const t = times[k].getTime();
			if (Number.isFinite(t)) moments.push(t);
		}
		for (const k of IQAMA_KEYS) {
			const resolved = resolveIqama(config.iqama[k], times[k], TIME_ZONE);
			iqama.set(k, resolved);
			if (resolved) moments.push(resolved.getTime());
		}
		const { year, month, dayOfMonth } = partsOf(at);
		const tomorrow = computePrayerTimes(
			location,
			dateForStockholmDay(year, month, dayOfMonth + 1),
			config.settings,
		);
		day = { key, times, iqama, tomorrowFajr: tomorrow.fajr.getTime(), moments };
		return day;
	}

	// ---- the camera ------------------------------------------------------
	/** Both cameras are pure functions of (config, viewport), so this is cached until the
	 *  viewport actually changes. Reading clientWidth/clientHeight flushes style and layout,
	 *  and paintCanvas calls this unconditionally — including from the requestAnimationFrame
	 *  loop that drives a six-second camera move, which made it a forced synchronous layout
	 *  on every one of ~360 frames, on exactly the frames the move is judged by. Invalidated
	 *  by the resize listener at the bottom of mount(). */
	let schedule: CameraSchedule | null = null;
	function scheduleFor(): CameraSchedule {
		if (schedule) return schedule;
		const w = canvas.clientWidth || 1;
		const h = canvas.clientHeight || 1;
		const vp = { w, h, padX: w * 0.03, padTop: h * 0.03, padBottom: h * 0.03 };
		schedule = {
			wide: cameraForBBox([-8, 50, 30, 72], vp),
			close: cameraAround(config.lat, config.lon, CLOSE_SPAN_DEG, vp),
			...DEFAULT_SCHEDULE,
		};
		return schedule;
	}

	/** Today's moments the camera can aim at, ascending: the congregation where the
	 *  mosque holds one, otherwise the adhān. Aiming at the adhān when the room actually
	 *  gathers fifteen minutes later would point the screen at the wrong moment. */
	function focusMoments(state: DayState): number[] {
		const out: number[] = [];
		for (const key of PRAYER_ORDER) {
			const iq = IQAMA_KEYS.includes(key as IqamaKey) ? state.iqama.get(key as IqamaKey) : null;
			const t = iq ? iq.getTime() : state.times[key].getTime();
			if (Number.isFinite(t)) out.push(t);
		}
		return out.sort((a, b) => a - b);
	}

	/**
	 * Which moment the camera is currently about, and the one after it.
	 *
	 * Deliberately NOT "the next prayer". The instant Maghrib's adhān passes,
	 * nextPrayerKeyAt moves on to ʿIshāʾ — so a camera following it would pull out of
	 * Göteborg at 19:42, five minutes into the gathering and three minutes before the
	 * congregation it had just spent six seconds zooming in for. The camera stays with a
	 * moment until that moment's hold has expired, which is what the hold is for.
	 */
	function focusPair(state: DayState, nowMs: number): [number | null, number | null] {
		const moments = focusMoments(state);
		const tail = DEFAULT_SCHEDULE.holdAfterMs + DEFAULT_SCHEDULE.tweenMs;
		for (let i = 0; i < moments.length; i++) {
			const m = moments[i];
			if (m !== undefined && nowMs < m + tail) return [m, moments[i + 1] ?? null];
		}
		// The day is spent; tomorrow's Fajr is hours away, so the frame stays wide.
		return [null, null];
	}

	// ---- paint -----------------------------------------------------------
	/** One prayer's row. Jumuʿa replaces Ẓuhr on Fridays, exactly as the printed month
	 *  sheet already does (pdf.ts) — the mosque foyer's paper ancestor. */
	function writeRow(
		row: RowEls,
		key: PrayerKey,
		state: DayState,
		friday: boolean,
		isNext: boolean,
	): void {
		const isJumua = friday && key === "dhuhr" && config.jumua !== "";
		row.name.textContent = isJumua ? "Jumuʿa" : PRAYER_LABELS[key];
		row.sv.textContent = isJumua ? "Fredagsbönen" : PRAYER_SWEDISH_NAMES[key];
		row.adhan.textContent = formatTime(state.times[key]);
		const iq = IQAMA_KEYS.includes(key as IqamaKey) ? state.iqama.get(key as IqamaKey) : null;
		if (isJumua) row.iqama.textContent = `khutba ${config.jumua}`;
		else row.iqama.textContent = iq ? `iqāma ${formatTime(iq)}` : "";
		row.el.dataset.next = isNext ? "1" : "0";
	}

	function writeTimes(state: DayState, at: Date): void {
		// While the congregation is in progress the emphasis stays on the prayer being
		// prayed, not on the one after it — nextPrayerKeyAt has already moved on by then.
		const praying = prayingNow(state, at.getTime());
		const nextKey = praying ?? nextPrayerKeyAt(state.times, at.getTime()) ?? "fajr";
		const friday = isFriday(at);

		for (const key of PRAYER_ORDER) {
			const row = els.rows.get(key);
			if (row) writeRow(row, key, state, friday, key === nextKey);
		}

		els.date.textContent = dateLabel(at);
		els.date.setAttribute("datetime", at.toLocaleDateString("sv-SE", { timeZone: TIME_ZONE }));
		// ⚠️ NOT `at`. hijriLabel reads its argument in UTC, so any instant between
		// Swedish midnight and 02:00 lands on the previous UTC day and the wall shows
		// yesterday's Hijri date — which markesdagar.ts warns about in as many words, and
		// which a screen that never navigates would then display for two hours every
		// single night. dateForStockholmDay builds UTC noon of the Stockholm day, which
		// is inside the intended day whatever the offset.
		const { year: hy, month: hm, dayOfMonth: hd } = partsOf(at);
		els.hijri.textContent = hijriLabel(
			dateForStockholmDay(hy, hm, hd + config.settings.hijriOffset),
		);
		root.dataset.ready = "1";
	}

	function writeCountdown(state: DayState, at: Date): void {
		const praying = prayingNow(state, at.getTime());
		if (praying) {
			const row = els.rows.get(praying);
			if (row) row.count.textContent = "pågår";
			return;
		}
		const key = nextPrayerKeyAt(state.times, at.getTime());
		const row = els.rows.get(key ?? "fajr");
		if (!row) return;
		const target = key ? state.times[key].getTime() : state.tomorrowFajr;
		row.count.textContent = countdownLabel(target - at.getTime());
	}

	function applyGround(state: DayState, at: Date): void {
		// The sun's real altitude, not a comparison against sunrise — because the ONLY time
		// groundFor consults this argument is when sunrise is Invalid Date, and `NaN >= NaN`
		// is false. So the old reading made the documented "if the sun never set, it is day"
		// fallback unreachable: a Kiruna screen on polarCircleResolution=unresolved painted
		// the near-black night ground straight through the midnight sun. kiosk.test.ts hands
		// groundFor `sunUp: true` directly, so the contract was tested and the caller was not.
		const sunUp = sunAltitudeDeg(config.lat, config.lon, at) > 0;
		const ground = groundFor(at, state.times.sunrise, state.times.maghrib, sunUp);
		if (ground === lastGround) return;
		const first = lastGround === "";
		lastGround = ground;
		const g = GROUNDS[ground];
		root.style.setProperty("--screen-bg", g.bg);
		root.style.setProperty("--screen-ink", g.ink);
		root.style.setProperty("--screen-muted", g.muted);
		root.style.setProperty("--screen-brass", g.brass);
		document.documentElement.style.colorScheme = ground === "night" ? "dark" : "light";
		// The cross-fade belongs to the sun crossing the horizon, not to page load. Armed
		// one frame after the first ground lands, so a screen booted at night comes up
		// dark instead of spending ninety seconds dimming in a dark prayer hall.
		if (first)
			requestAnimationFrame(() => {
				root.style.setProperty("--ms-fade", "90s");
			});
	}

	/** Which prayer, if any, the room is praying right now. */
	function prayingNow(state: DayState, nowMs: number): IqamaKey | null {
		for (const key of IQAMA_KEYS) {
			const iq = state.iqama.get(key);
			if (inQuietWindow(nowMs, iq ? iq.getTime() : null, config.quietMinutes)) return key;
		}
		return null;
	}

	function applyQuiet(state: DayState, at: Date): void {
		const active = prayingNow(state, at.getTime());
		root.dataset.quiet = active ? "1" : "0";
		for (const [key, row] of els.rows) row.el.dataset.praying = key === active ? "1" : "0";
	}

	function paintCanvas(state: DayState, at: Date, moving: boolean): void {
		if (!renderer) return;
		const [focus, after] = focusPair(state, at.getTime());
		const cam = cameraAt(at.getTime(), focus, after, scheduleFor());
		renderer.render(
			{
				location,
				settings: config.settings,
				scheme: (lastGround === "night" ? "dark" : "light") satisfies Scheme,
				variant: "screen",
				camera: cam.camera,
				moving,
			},
			at,
		);
		root.dataset.phase = cam.phase;
	}

	// ---- the tick --------------------------------------------------------
	function runTick(): void {
		try {
			const at = now();
			const state = ensureDay(at);
			const minute = Math.floor(at.getTime() / 60_000);
			applyGround(state, at);
			applyQuiet(state, at);
			if (minute !== lastMinute) {
				lastMinute = minute;
				writeTimes(state, at);
				paintCanvas(state, at, false);
				if (!preview) driftShift(at);
			}
			writeCountdown(state, at);
			driveCamera(state);
			if (!preview) maybeReload(state, at);
			lastBeat = performance.now();
			// A tick that completed is the definition of recovered. Without this reset the
			// watchdog's `stalls` only ever counts up, so the SECOND stall in the screen's
			// whole life — months later, after a year of health — takes the escalation path
			// instead of the cheap in-place recovery that fixed the first one.
			stalls = 0;
		} finally {
			// The clock's only heartbeat. A throw anywhere above must not be able to stop
			// the wall — a frozen screen showing yesterday's times is indistinguishable
			// from a working one, which is this whole file's governing failure mode.
			//
			// Cleared first so runTick is idempotent from ANY caller. It is called directly
			// from two other places, and the visibilitychange one did not clear: a panel that
			// blanks and wakes — sleep timer, HDMI-CEC, screensaver — left the pending timer
			// running and started a second self-perpetuating chain beside it. N wakes, N+1
			// concurrent tick loops, each one independently refreshing `lastBeat` (so the
			// watchdog sees a healthy screen) and independently calling maybeReload (so the
			// nightly fetch multiplies). On a wall that runs for months it compounds without
			// bound. bonetider-field.ts's scheduleTick, which this was modelled on, does clear.
			if (tickTimer !== undefined) clearTimeout(tickTimer);
			tickTimer = window.setTimeout(runTick, 1000);
		}
	}

	/** A camera move needs frames, but nothing essential may DEPEND on them: Chrome
	 *  suspends animation frames in an occluded window that still reports itself
	 *  visible, which is the ordinary state of a second screen. So the tick above always
	 *  lands the camera by timer, and this only makes the move smooth in between. */
	function driveCamera(state: DayState): void {
		if (rafHandle !== 0) return;
		const phase = root.dataset.phase;
		if (phase !== "closing" && phase !== "opening") return;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		const step = (): void => {
			rafHandle = 0;
			const at = now();
			paintCanvas(state, at, true);
			const p = root.dataset.phase;
			if (p === "closing" || p === "opening") rafHandle = window.requestAnimationFrame(step);
			else paintCanvas(state, at, false); // settle: the real glow comes back
		};
		rafHandle = window.requestAnimationFrame(step);
	}

	function driftShift(at: Date): void {
		const { x, y } = pixelShiftAt(at.getTime());
		const next = `${x}px,${y}px`;
		if (next === lastShift) return;
		lastShift = next;
		root.style.setProperty("--ms-shift-x", `${x}px`);
		root.style.setProperty("--ms-shift-y", `${y}px`);
	}

	function maybeReload(state: DayState, at: Date): void {
		const parts = stockholmClockMinutes(at);
		if (parts !== nightlyReloadMinute(window.location.hash)) return;
		if (
			!isReloadSafe(at.getTime(), {
				prayerTimesMs: state.moments,
				guardBeforeMs: 20 * 60_000,
				guardAfterMs: 10 * 60_000,
				cameraMoving: root.dataset.phase === "closing" || root.dataset.phase === "opening",
				uptimeMs: Date.now() - bootedAt,
				minUptimeMs: 30 * 60_000,
				lastReloadMs: readLastReload(),
				minSinceLastReloadMs: 30 * 60_000,
			})
		)
			return;
		reloadIfReachable();
	}

	/** Positive proof before touching the wall. navigator.onLine is true on a router with
	 *  no uplink and a captive portal answers 200, so only the build sentinel proves this
	 *  page is really fetchable. The request also warms the HTTP cache, which makes the
	 *  reload that follows instant. */
	async function reloadIfReachable(): Promise<void> {
		// One probe at a time. Both callers fire on a repeating timer and neither can know
		// the previous attempt is still in flight: maybeReload's only gate is the clock
		// minute, which holds true for sixty consecutive ticks, and the watchdog retries
		// every five seconds. The sentinel that would stop them — LAST_RELOAD_KEY — is only
		// written after a probe SUCCEEDS, so on a screen that is offline at its reload minute
		// nothing was stopping sixty concurrent uncached full-document fetches, every night,
		// all of them failing.
		if (reloading) return;
		reloading = true;
		try {
			const res = await fetch(window.location.pathname, {
				cache: "reload",
				signal: AbortSignal.timeout(5000),
			});
			if (!res.ok) return;
			const body = await res.text();
			if (!body.includes("skarm-ok")) return;
			try {
				localStorage.setItem(LAST_RELOAD_KEY, String(Date.now()));
			} catch {
				/* storage blocked — the uptime guard still bounds the loop */
			}
			window.location.reload();
		} catch {
			// Offline, or the origin is down. There is no service worker, so a reload now
			// would land on the browser's error page — a blank wall is strictly worse than
			// a screen that is merely a deploy behind.
		} finally {
			// Released even on the success path: window.location.reload() does not stop this
			// frame, and a navigation the browser then refuses would otherwise leave the
			// screen unable to try again for as long as it stays up.
			reloading = false;
		}
	}

	// ---- watchdog --------------------------------------------------------
	// On its own timer, deliberately: a throw that killed the tick must not be able to
	// kill the thing that notices.
	const watchdog = window.setInterval(() => {
		if (performance.now() - lastBeat < 20_000) return;
		stalls += 1;
		lastBeat = performance.now();
		if (stalls === 1) {
			// Drop every cache first. A recovery that reuses a poisoned one re-throws
			// immediately and the screen just stalls again.
			day = null;
			lastMinute = -1;
			lastGround = "";
			runTick();
			return;
		}
		// The in-place recovery did not take, so the page itself has to go. Through the
		// reachability probe, never a bare reload: that path checked NOTHING — not the
		// sentinel, not the origin being up — and this file's whole argument is that there
		// is no service worker, so a reload while the mosque's wifi is down lands the wall
		// on the browser's error page in front of the congregation. A screen that is merely
		// stalled still shows today's date, today's times and a plausible countdown; a blank
		// one shows nothing. Offline, the probe declines and the watchdog tries again in five
		// seconds, for as long as it takes.
		//
		// isReloadSafe is deliberately NOT consulted here. Its guards exist to keep a HEALTHY
		// screen from reloading at a bad moment; waiting out a 20-minute prayer window with a
		// frozen wall is the thing it was protecting against.
		if (!preview) reloadIfReachable();
	}, 5000);

	// ---- boot ------------------------------------------------------------
	/** Dynamically imported for the same reason bonetider-field.ts does it: a static
	 *  import put ~32 kB gzip of renderer on every page. Never rejects — if the chunk
	 *  never arrives the times, the countdown and the ground stay live and the wall is
	 *  merely missing its map. */
	async function loadRenderer(): Promise<void> {
		try {
			const mod = await import("../lib/bonetider/render-field");
			renderer = mod.createFieldRenderer(canvas) as unknown as Renderer;
			const at = now();
			paintCanvas(ensureDay(at), at, false);
		} catch {
			/* the screen is still a working prayer-time board without the canvas */
		}
	}
	loadRenderer();

	/** A wall clock quietly showing the wrong Maghrib is a religious problem, not a
	 *  cosmetic one, so the screen corrects itself against the server rather than
	 *  trusting cheap signage hardware. */
	async function applySkew(): Promise<void> {
		const ms = await probeSkew();
		if (ms === null) return;
		skewMs = ms;
		driftIssue = driftMessage(ms);
		writeIssue();
	}

	if (preview) document.querySelector<HTMLElement>(".ms-fullscreen")?.remove();

	runTick();
	if (!preview) {
		applySkew();
		// ...and again every hour, because a single boot-time measurement does not meet the
		// premise. The nightly reload is the only other thing that would re-run this, and it
		// is conditional on isReloadSafe AND a successful reachability probe — a screen on a
		// mosque's flaky wifi can skip it for days, and a screen whose clock is wrong enough
		// never reaches its reload minute at all. Those are precisely the screens whose clock
		// is drifting. The probe is one conditional GET of a page already in cache.
		window.setInterval(applySkew, 60 * 60_000);
		keepAwake();
		hideCursorWhenIdle();
		wireFullscreen(root);
	}

	window.addEventListener("hashchange", () => {
		// The builder drives its preview by writing the hash, and an operator can tweak a
		// live screen the same way.
		window.location.reload();
	});
	window.addEventListener("resize", () => {
		schedule = null;
		lastMinute = -1;
	});
	window.addEventListener("beforeunload", () => {
		clearInterval(watchdog);
		if (tickTimer !== undefined) clearTimeout(tickTimer);
	});
	document.addEventListener("visibilitychange", () => {
		// Coming back can be hours later on a panel that blanked overnight.
		if (!document.hidden) {
			lastMinute = -1;
			runTick();
		}
	});
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

type Ground = "day" | "night";

interface RowEls {
	el: HTMLElement;
	name: HTMLElement;
	sv: HTMLElement;
	adhan: HTMLElement;
	iqama: HTMLElement;
	count: HTMLElement;
}

interface Els {
	mosque: HTMLElement;
	place: HTMLElement;
	date: HTMLElement;
	hijri: HTMLElement;
	notice: HTMLElement;
	issue: HTMLElement;
	rows: Map<PrayerKey, RowEls>;
}

function collect(root: HTMLElement): Els {
	const q = <T extends HTMLElement>(sel: string): T =>
		(root.querySelector<T>(sel) ?? document.createElement("span")) as T;
	const rows = new Map<PrayerKey, RowEls>();
	for (const el of root.querySelectorAll<HTMLElement>(".ms-row")) {
		const key = el.dataset.prayer as PrayerKey | undefined;
		if (!key) continue;
		rows.set(key, {
			el,
			name: el.querySelector<HTMLElement>(".ms-name") ?? el,
			sv: el.querySelector<HTMLElement>(".ms-sv") ?? el,
			adhan: el.querySelector<HTMLElement>(".ms-adhan") ?? el,
			iqama: el.querySelector<HTMLElement>(".ms-iqama") ?? el,
			count: el.querySelector<HTMLElement>(".ms-count") ?? el,
		});
	}
	return {
		mosque: q(".ms-mosque"),
		place: q(".ms-place"),
		date: q(".ms-date"),
		hijri: q(".ms-hijri"),
		notice: q(".ms-notice"),
		issue: q(".ms-issue"),
		rows,
	};
}

// Module constants, the pattern prayer-times.ts already establishes. Constructing an
// Intl.DateTimeFormat resolves a locale and a time zone every time, and CLOCK_FORMAT is on
// the one-second path — 86 400 constructions a day on a Celeron-class signage box, for a
// value that is the same formatter every time.
const WEEKDAY_FORMAT = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "short" });
const DATE_FORMAT = new Intl.DateTimeFormat("sv-SE", {
	timeZone: TIME_ZONE,
	weekday: "long",
	day: "numeric",
	month: "long",
});
const CLOCK_FORMAT = new Intl.DateTimeFormat("en-GB", {
	timeZone: TIME_ZONE,
	hour: "2-digit",
	minute: "2-digit",
	hourCycle: "h23",
});

function isFriday(at: Date): boolean {
	return WEEKDAY_FORMAT.format(at) === "Fri";
}

function partsOf(at: Date): { year: number; month: number; dayOfMonth: number } {
	const { year, month, day } = stockholmDateParts(at);
	return { year, month, dayOfMonth: day };
}

function dateLabel(at: Date): string {
	return DATE_FORMAT.format(at);
}

function stockholmClockMinutes(at: Date): number {
	const parts = CLOCK_FORMAT.formatToParts(at);
	const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? "0");
	return get("hour") * 60 + get("minute");
}

/** "om 1 tim 12 min" — the same vocabulary the prayer field already uses. */
function countdownLabel(msLeft: number): string {
	if (msLeft <= 0) return "nu";
	const total = Math.round(msLeft / 1000);
	if (total < 60) return `om ${total} sek`;
	const mins = Math.round(total / 60);
	if (mins < 60) return `om ${mins} min`;
	const hours = Math.floor(mins / 60);
	return `om ${hours} tim ${mins % 60} min`;
}

function readStoredHash(): string {
	try {
		return localStorage.getItem(STORE_KEY) ?? "";
	} catch {
		return "";
	}
}

function storeHash(body: string): void {
	try {
		localStorage.setItem(STORE_KEY, body);
	} catch {
		/* a TV in private mode; the URL is still the source of truth */
	}
}

function readLastReload(): number | null {
	try {
		const raw = localStorage.getItem(LAST_RELOAD_KEY);
		const n = raw === null ? Number.NaN : Number(raw);
		return Number.isFinite(n) ? n : null;
	} catch {
		return null;
	}
}

/** Skew against the server, from the Date header of a request we have to make anyway. */
async function probeSkew(): Promise<number | null> {
	try {
		const t0 = Date.now();
		const res = await fetch(window.location.pathname, {
			cache: "reload",
			signal: AbortSignal.timeout(5000),
		});
		const t1 = Date.now();
		const header = res.headers.get("date");
		if (header === null) return null;
		const server = Date.parse(header);
		if (!Number.isFinite(server)) return null;
		return server - (t0 + (t1 - t0) / 2);
	} catch {
		return null;
	}
}

function keepAwake(): void {
	const nav = navigator as Navigator & {
		wakeLock?: {
			request(kind: "screen"): Promise<{ addEventListener(t: string, f: () => void): void }>;
		};
	};
	if (!nav.wakeLock) return;
	let backoff = 5000;
	const take = async (): Promise<void> => {
		if (document.hidden) return; // the request is rejected outright while hidden
		try {
			const sentinel = await nav.wakeLock?.request("screen");
			backoff = 5000;
			// The lock is dropped automatically whenever the page hides, and nothing
			// re-takes it for you.
			sentinel?.addEventListener("release", () => {
				window.setTimeout(take, 1000);
			});
		} catch {
			// Backed off rather than retried tight: a browser that refuses the lock while
			// the panel is asleep would otherwise spin for as long as it stays asleep.
			backoff = Math.min(backoff * 2, 300_000);
			window.setTimeout(take, backoff);
		}
	};
	take();
	document.addEventListener("visibilitychange", () => {
		if (!document.hidden) take();
	});
}

function hideCursorWhenIdle(): void {
	let timer: number | undefined;
	const wake = (): void => {
		document.body.dataset.idle = "0";
		if (timer !== undefined) clearTimeout(timer);
		timer = window.setTimeout(() => {
			document.body.dataset.idle = "1";
		}, 4000);
	};
	document.addEventListener("pointermove", wake, { passive: true });
	wake();
}

/** The one control on the screen, and it fades with the cursor. A browser will only
 *  grant fullscreen from a real gesture, so it cannot be done on load. */
function wireFullscreen(root: HTMLElement): void {
	const btn = document.querySelector<HTMLButtonElement>(".ms-fullscreen");
	if (!btn) return;
	btn.addEventListener("click", async () => {
		try {
			if (document.fullscreenElement) await document.exitFullscreen();
			else await root.closest("main")?.requestFullscreen?.();
		} catch {
			// A browser may refuse — an iframe without allowfullscreen, or a gesture it
			// did not trust. The screen is perfectly usable windowed, and the setup page
			// says so rather than leaving the mosque with a button that does nothing.
		}
	});
}

const root = document.querySelector<HTMLElement>(".ms");
if (root) mount(root);
