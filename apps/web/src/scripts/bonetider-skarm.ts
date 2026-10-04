// The moskéskärm's engine.
//
// Deliberately NOT an extension of bonetider-field.ts. That module is tuned for an
// article page — it stops ticking when the tab is hidden, sleeps to the minute boundary
// when nothing needs seconds, and prunes instances after a view transition. Every one of
// those is wrong on a wall: `document.hidden` on a kiosk usually means the panel blanked,
// not that nobody cares, and the screen must be correct the instant it lights again.
//
// What it shares instead is the LIBRARY — computePrayerTimes, stockholmDayKey,
// createFieldRenderer — so there is one prayer-time implementation on
// the site and this file owns only the things a wall needs: a camera that moves, the
// prayer in progress at the iqāma, and enough self-defence to run for months with nobody
// watching.

import reliefUrl from "../assets/bonetider/relief-screen.webp?url";
import {
	type Camera,
	type CameraSchedule,
	cameraAround,
	cameraAt,
	cameraForBBox,
	DEFAULT_SCHEDULE,
} from "../lib/bonetider/camera";
import {
	clockStepMs,
	driftMessage,
	type HeroMoment,
	heroAt,
	isReloadSafe,
	nextSkewProbeMs,
	nightlyReloadMinute,
	pixelShiftAt,
	skewAfterStep,
} from "../lib/bonetider/kiosk";
import {
	computePrayerTimes,
	dateForStockholmDay,
	formatTime,
	PRAYER_LABELS,
	PRAYER_ORDER,
	PRAYER_SWEDISH_NAMES,
	type PrayerKey,
	stockholmDateLabel,
	stockholmDateParts,
	stockholmDayKey,
	stockholmIsoDate,
	TIME_ZONE,
} from "../lib/bonetider/prayer-times";
import { RELIEF_SCREEN } from "../lib/bonetider/relief-screen";
import type { MapDetail } from "../lib/bonetider/render-field";
import {
	decodeClockOffset,
	decodeScreenConfig,
	IQAMA_KEYS,
	type IqamaKey,
	resolveIqama,
	type ScreenConfig,
} from "../lib/bonetider/screen-config";
import { hijriLabel } from "../lib/markesdagar";

/** How wide the close camera frames the country around the mosque. Ten degrees of
 *  latitude is about Malmö to Stockholm: close enough that the line visibly arrives on
 *  this town, wide enough that it is still a map of Sweden and not a street. */
const CLOSE_SPAN_DEG = 10;

const STORE_KEY = "bonetider:skarm";
const LAST_RELOAD_KEY = "bonetider:skarm:lastReload";

type Renderer = { render(cfg: Record<string, unknown>, now: Date): void };

interface DayState {
	key: string;
	times: ReturnType<typeof computePrayerTimes>;
	/** Congregation times, null where the mosque holds none. */
	iqama: Map<IqamaKey, Date | null>;
	/** Tomorrow's Fajr, so the countdown after ʿIshāʾ does not recompute every second. */
	tomorrowFajr: number;
	/** …and its iqāma: once the day is spent, the Fajr row shows tomorrow's times. */
	tomorrowFajrIqama: Date | null;
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
	/** Both clocks as the last tick read them, to catch the device clock being set in between
	 *  (watchClockStep). */
	let lastWall = Date.now();
	let lastMono = performance.now();

	// Monotonic: a clock set after boot must not make the screen look minutes or hours old.
	const bootedMono = performance.now();
	const els = collect(root);
	let day: DayState | null = null;
	let renderer: Renderer | null = null;
	let lastMinute = -1;
	/** The key of the prayer last written as the large row, or "tomorrow". */
	let lastHero = "";
	let lastShift = "";
	let rafHandle = 0;
	let tickTimer: number | undefined;
	let lastBeat = performance.now();
	let stalls = 0;
	let reloading = false;

	// ---- static copy -----------------------------------------------------
	els.mosque.textContent = config.name || config.ortName;
	// Read by MosqueScreen.astro, which sets a long name one step smaller so it keeps to two lines.
	els.mosque.dataset.long = (config.name || config.ortName).length > 24 ? "1" : "0";
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

	// The marker takes the ORT, never the mosque's own name. Two reasons, and both are
	// visible on a wall: the mosque name is already the largest thing on the screen and
	// this display's whole premise is that nothing is stated twice; and a real name like
	// "Islamiska Kulturföreningen i Kiruna" draws a pill wide enough to collide with the
	// isoline labels beside it. The coordinates stay the mosque's, so the pin is still on
	// the building rather than on the town centre.
	const location = {
		name: config.ortName,
		latitude: config.lat,
		longitude: config.lon,
	};

	// Every mosque in the directory, lit on the map (render-field.ts drawLights). Baked into
	// the page by MosqueScreen.astro and read once: the list does not change while it runs,
	// and a wall that cannot parse it is still a working wall, only without its lights.
	const lights: readonly (readonly [number, number])[] = (() => {
		try {
			const raw = root.querySelector(".ms-lights")?.textContent;
			return raw ? (JSON.parse(raw) as [number, number][]) : [];
		} catch {
			return [];
		}
	})();

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
		day = {
			key,
			times,
			iqama,
			tomorrowFajr: tomorrow.fajr.getTime(),
			tomorrowFajrIqama: resolveIqama(config.iqama.fajr, tomorrow.fajr, TIME_ZONE),
			moments,
		};
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
	/** CSS px of the canvas under the type pane, measured with the schedule. */
	let occludedLeft = 0;
	function scheduleFor(): CameraSchedule {
		if (schedule) return schedule;
		const w = canvas.clientWidth || 1;
		const h = canvas.clientHeight || 1;
		// The canvas runs under the type pane (MosqueScreen.astro .ms-pane), so a camera frames
		// only what the pane leaves open, and is then moved left by half the pane so that
		// frame lands in the open part of the canvas rather than its middle.
		const pane = root.querySelector<HTMLElement>(".ms-pane");
		const covered = pane
			? Math.max(
					0,
					Math.min(w, pane.getBoundingClientRect().right - canvas.getBoundingClientRect().left),
				)
			: 0;
		occludedLeft = covered;
		const open = w - covered;
		const vp = { w: open, h, padX: open * 0.03, padTop: h * 0.03, padBottom: h * 0.03 };
		const beside = (cam: Camera): Camera => ({ ...cam, cx: cam.cx - covered / 2 / cam.scale });
		schedule = {
			// Framed on Sweden, not on VIEW_BBOX. Height decides the fit here (the edge-to-edge
			// stage is wider than any of these boxes), so the latitude range IS the zoom: 50–72
			// left Sweden a narrow figure in a sea of neighbours once the map ran to the edges.
			// 53.5–71 keeps Denmark to the south and sea north of Kiruna for the line labels,
			// about 1.23x closer; the longitude only centres it, on Sweden's middle (17.5°E).
			wide: beside(cameraForBBox([5, 53.5, 30, 71], vp)),
			close: beside(cameraAround(config.lat, config.lon, CLOSE_SPAN_DEG, vp)),
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
	/** Today's congregation time for a prayer, or null where the mosque holds none. */
	function iqamaOf(state: DayState, key: PrayerKey): Date | null {
		return IQAMA_KEYS.includes(key as IqamaKey) ? (state.iqama.get(key as IqamaKey) ?? null) : null;
	}

	/** Which prayer holds the large row and what it counts towards (kiosk.ts heroAt). Null
	 *  once the day is spent, when the large row is tomorrow's Fajr. */
	function heroFor(state: DayState, nowMs: number): HeroMoment<PrayerKey> | null {
		return heroAt(
			nowMs,
			PRAYER_ORDER,
			(key) => state.times[key].getTime(),
			(key) => iqamaOf(state, key)?.getTime() ?? null,
			config.quietMinutes,
		);
	}

	/** One prayer's row. Jumuʿa replaces Ẓuhr on Fridays, exactly as the printed month
	 *  sheet already does (pdf.ts) — the mosque foyer's paper ancestor.
	 *
	 *  `tomorrow` is set on the Fajr row once the day is spent. That row used to keep
	 *  today's Fajr while its countdown ran to tomorrow's, so after ʿIshāʾ the wall showed
	 *  one time and counted to another a few minutes away. */
	function writeRow(
		row: RowEls,
		key: PrayerKey,
		state: DayState,
		friday: boolean,
		isNext: boolean,
		tomorrow: boolean,
	): void {
		const isJumua = !tomorrow && friday && key === "dhuhr" && config.jumua !== "";
		setMarked(row.name, isJumua ? "Jumuʿa" : PRAYER_LABELS[key]);
		row.sv.textContent = tomorrow
			? "i morgon"
			: isJumua
				? "Fredagsbönen"
				: PRAYER_SWEDISH_NAMES[key];
		row.adhan.textContent = formatTime(tomorrow ? new Date(state.tomorrowFajr) : state.times[key]);
		const iq = tomorrow ? state.tomorrowFajrIqama : iqamaOf(state, key);
		if (isJumua) row.iqama.textContent = `khutba ${config.jumua}`;
		else row.iqama.textContent = iq ? `iqāma ${formatTime(iq)}` : "";
		row.el.dataset.next = isNext ? "1" : "0";
	}

	function writeTimes(state: DayState, at: Date, hero: HeroMoment<PrayerKey> | null): void {
		const friday = isFriday(at);
		for (const key of PRAYER_ORDER) {
			const row = els.rows.get(key);
			if (!row) continue;
			const isNext = key === (hero?.key ?? "fajr");
			writeRow(row, key, state, friday, isNext, hero === null && key === "fajr");
		}

		els.date.textContent = stockholmDateLabel(at);
		els.date.setAttribute("datetime", stockholmIsoDate(at));
		// ⚠️ NOT `at`. hijriLabel reads its argument in UTC, so any instant between
		// Swedish midnight and 02:00 lands on the previous UTC day and the wall shows
		// yesterday's Hijri date — which markesdagar.ts warns about in as many words, and
		// which a screen that never navigates would then display for two hours every
		// single night. dateForStockholmDay builds UTC noon of the Stockholm day, which
		// is inside the intended day whatever the offset.
		const { year: hy, month: hm, dayOfMonth: hd } = partsOf(at);
		setMarked(els.hijri, hijriLabel(dateForStockholmDay(hy, hm, hd + config.settings.hijriOffset)));
		root.dataset.ready = "1";
	}

	/** The large row's third line. Counting to the adhān it is a bare countdown; waiting for
	 *  the congregation it names what it counts to, »iqāma om 9 min«, since the time above
	 *  it is already past; during the prayer it is »pågår«. data-phase gives the last two
	 *  the congregation's brass (MosqueScreen.astro). */
	function writeCountdown(state: DayState, at: Date, hero: HeroMoment<PrayerKey> | null): void {
		const row = els.rows.get(hero?.key ?? "fajr");
		if (!row) return;
		const phase = hero?.phase ?? "adhan";
		const left = (hero ? hero.targetMs : state.tomorrowFajr) - at.getTime();
		const text =
			phase === "praying"
				? "pågår"
				: phase === "iqama"
					? `iqāma ${countdownLabel(left)}`
					: countdownLabel(left);
		if (row.count.textContent !== text) row.count.textContent = text;
		if (row.count.dataset.phase !== phase) row.count.dataset.phase = phase;
	}

	/** The time now, from the same clock as everything else here — so it carries the
	 *  server-skew correction, and the debug offset when a day is being stepped through. */
	function writeClock(at: Date): void {
		const [h = "", m = ""] = formatTime(at).split(":");
		if (els.clockH.textContent !== h) els.clockH.textContent = h;
		if (els.clockM.textContent !== m) els.clockM.textContent = m;
		// The colon's beat (MosqueScreen.astro). UTC seconds are Stockholm's: the offset is
		// whole hours.
		els.clock.dataset.beat = String(at.getUTCSeconds() % 2);
	}

	/** The detailed map — coast, islands, lakes, rivers, towns — fetched after first paint.
	 *  The screen is correct without it (it is the same map, simplified), so its 2 MB never
	 *  block the first frame, and after the first load the browser cache serves it. */
	let detail: MapDetail | undefined;
	/** The baked hillshade (build-screen-relief.mjs). A map without it is still the map.
	 *
	 *  Decoded once into an ImageBitmap the canvas owns. As an <img> the relief — 2 816 px
	 *  square, 32 MB of pixels — is decoded on the main thread, and its decoded copy is the
	 *  browser's to drop while the camera holds still and decode again inside the next ground
	 *  repaint, which is the frame a move settles on. createImageBitmap decodes off the main
	 *  thread into pixels no image cache can evict. The <img> stays for a browser without it. */
	async function loadRelief(): Promise<MapDetail["relief"]> {
		try {
			if (typeof createImageBitmap === "function") {
				const res = await fetch(reliefUrl);
				if (res.ok) return { image: await createImageBitmap(await res.blob()), ...RELIEF_SCREEN };
			}
		} catch {
			/* fall back to the <img> below */
		}
		const image = new Image();
		image.src = reliefUrl;
		try {
			await image.decode();
			return { image, ...RELIEF_SCREEN };
		} catch {
			return undefined;
		}
	}
	async function loadDetail(): Promise<void> {
		try {
			const [d, relief] = await Promise.all([import("../lib/bonetider/map-detail"), loadRelief()]);
			detail = {
				sweden: d.SWEDEN_DETAIL,
				neighbors: d.NEIGHBORS_DETAIL,
				lakes: d.LAKES_DETAIL,
				rivers: d.RIVERS_DETAIL,
				islands: d.ISLANDS_DETAIL,
				towns: d.TOWNS_DETAIL,
				borders: d.BORDERS_DETAIL,
				countries: d.COUNTRIES_DETAIL,
				seas: d.SEAS_DETAIL,
				cities: d.CITIES_DETAIL,
				parks: d.PARKS_DETAIL,
				relief,
			};
			const at = now();
			paintCanvas(ensureDay(at), at);
		} catch {
			/* the coarse outline every other page uses is a perfectly good fallback */
		}
	}

	function paintCanvas(state: DayState, at: Date): void {
		if (!renderer) return;
		const [focus, after] = focusPair(state, at.getTime());
		const sched = scheduleFor();
		const cam = cameraAt(at.getTime(), focus, after, sched);
		// The camera's phase picks the renderer's path, never the caller. A move always begins
		// on a minute boundary — its lead-in is whole minutes before an iqāma that is itself on
		// the minute — so the minute tick landed on the first frame of every move and painted
		// the full-detail map (relief, ~110 000 points, halos, a ground-cache copy) for a camera
		// the next frame threw away: measured, a 350 ms stall in Zen and 600–700 ms in Chromium
		// at the start of every move. Under reduced motion no in-between frames are drawn, so
		// the one frame the tick does draw is the sharp one.
		const moving = (cam.phase === "closing" || cam.phase === "opening") && !REDUCED_MOTION.matches;
		renderer.render(
			{
				location,
				settings: config.settings,
				// Always dark — see MosqueScreen.astro, where the ground is set.
				scheme: "dark",
				variant: "screen",
				camera: cam.camera,
				moving,
				detail,
				occludedLeft,
				lights,
				// The two cameras it holds still at, so the renderer can keep both finished.
				frames: { wide: sched.wide, close: sched.close },
				qibla: true,
				// The rank already names Friday's Ẓuhr Jumuʿa; the line on the map says the same.
				jumua: isFriday(at) && config.jumua !== "",
			},
			at,
		);
		root.dataset.phase = cam.phase;
	}

	// ---- the tick --------------------------------------------------------
	function runTick(): void {
		try {
			if (!preview) watchClockStep();
			const at = now();
			const state = ensureDay(at);
			const hero = heroFor(state, at.getTime());
			const heroKey = hero?.key ?? "tomorrow";
			const minute = Math.floor(at.getTime() / 60_000);
			// A new minute, or the large row changing hands between two minute ticks — which a
			// prayer time calculated without rounding does.
			if (minute !== lastMinute || heroKey !== lastHero) {
				// A hand-off, not the first write: at boot there is no earlier rank to move from.
				const handOff = lastHero !== "" && heroKey !== lastHero;
				lastMinute = minute;
				lastHero = heroKey;
				if (handOff) morphRank(() => writeTimes(state, at, hero));
				else writeTimes(state, at, hero);
				paintCanvas(state, at);
				if (!preview) driftShift(at);
			}
			writeCountdown(state, at, hero);
			writeClock(at);
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
			// Aimed just past the next second boundary of the screen's own clock, not a flat
			// 1000 ms: a timer drifts a few ms a tick, and with the clock's colon beating on the
			// wall that drift showed as a beat skipped — or held for two — every few minutes.
			tickTimer = window.setTimeout(runTick, 1020 - (now().getTime() % 1000));
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
		if (REDUCED_MOTION.matches) return;
		const step = (): void => {
			rafHandle = 0;
			// The last frame of a move finds the phase settled, and paintCanvas then draws the
			// sharp map with its halos — the settle is this same call, not a second full paint.
			paintCanvas(state, now());
			const p = root.dataset.phase;
			if (p === "closing" || p === "opening") rafHandle = window.requestAnimationFrame(step);
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
				uptimeMs: performance.now() - bootedMono,
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
			paintCanvas(ensureDay(at), at);
			loadDetail();
		} catch {
			/* the screen is still a working prayer-time board without the canvas */
		}
	}
	loadRenderer();

	/** A wall clock quietly showing the wrong Maghrib is a religious problem, not a
	 *  cosmetic one, so the screen corrects itself against the server rather than
	 *  trusting cheap signage hardware. */
	let skewFailures = 0;
	let skewTimer: number | undefined;
	let probing = false;
	/** Bumped whenever the device clock is seen being set, so a probe in flight across the step
	 *  — one reading either side of it — is thrown away rather than applied. */
	let clockSteps = 0;

	function setSkew(ms: number): void {
		skewMs = ms;
		driftIssue = driftMessage(ms);
		writeIssue();
	}

	function probeSkewIn(delayMs: number): void {
		if (skewTimer !== undefined) clearTimeout(skewTimer);
		skewTimer = window.setTimeout(applySkew, delayMs);
	}

	/** Measure the offset, then book the next measurement (kiosk.ts nextSkewProbeMs): an hour
	 *  after an answer, seconds after a failure. */
	async function applySkew(): Promise<void> {
		if (probing) return;
		probing = true;
		const steps = clockSteps;
		try {
			const ms = await probeSkew();
			if (clockSteps !== steps) {
				// Measured across a step. The step asked for a probe while this one was in flight,
				// and was turned away by `probing` — so it is asked for again here.
				probeSkewIn(0);
				return;
			}
			if (ms === null) skewFailures += 1;
			else {
				skewFailures = 0;
				setSkew(ms);
			}
			probeSkewIn(nextSkewProbeMs(skewFailures));
		} finally {
			probing = false;
		}
	}

	/** The device clock set between two ticks — NTP just after boot, most often (kiosk.ts
	 *  clockStepMs). A correction is followed at once; anything else is checked with the server. */
	function watchClockStep(): void {
		const wall = Date.now();
		const mono = performance.now();
		const step = clockStepMs(wall - lastWall, mono - lastMono);
		lastWall = wall;
		lastMono = mono;
		if (step === 0) return;
		clockSteps += 1;
		const corrected = skewAfterStep(skewMs, step);
		if (corrected !== null) setSkew(corrected);
		// Either way the server is asked now, not at the top of the next hour.
		probeSkewIn(0);
	}

	if (preview) document.querySelector<HTMLElement>(".ms-fullscreen")?.remove();

	runTick();
	if (!preview) {
		applySkew();
		// ...and again every hour (applySkew books its own next run), because a single boot-time
		// measurement does not meet the premise. The nightly reload is the only other thing that
		// would re-run this, and it is conditional on isReloadSafe AND a successful reachability
		// probe — a screen on a mosque's flaky wifi can skip it for days, and a screen whose clock
		// is wrong enough never reaches its reload minute at all. Those are precisely the screens
		// whose clock is drifting. The probe is one GET of this page, past the cache, so its Date
		// header is the server's time now rather than a stored copy's.
		keepAwake();
		hideCursorWhenIdle();
		wireFullscreen(root);
	}

	window.addEventListener("hashchange", () => {
		// The builder drives its preview by writing the hash, and an operator can tweak a
		// live screen the same way.
		window.location.reload();
	});
	// The canvas's own box. When it changes size — going fullscreen, a rotated panel, the
	// builder's frame — the map is redrawn in that same frame; the resize event only marked it
	// stale and left the old bitmap stretched over the new box until the next second's tick.
	// The tick still repaints either way, which is all a browser without ResizeObserver gets.
	const invalidate = (): void => {
		schedule = null;
		lastMinute = -1;
	};
	if (typeof ResizeObserver === "function") {
		new ResizeObserver(() => {
			invalidate();
			const at = now();
			paintCanvas(ensureDay(at), at);
		}).observe(canvas);
	} else window.addEventListener("resize", invalidate);
	window.addEventListener("beforeunload", () => {
		clearInterval(watchdog);
		if (tickTimer !== undefined) clearTimeout(tickTimer);
		if (skewTimer !== undefined) clearTimeout(skewTimer);
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
	clock: HTMLElement;
	clockH: HTMLElement;
	clockM: HTMLElement;
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
		clock: q(".ms-clock"),
		clockH: q(".ms-clock-h"),
		clockM: q(".ms-clock-m"),
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
const CLOCK_FORMAT = new Intl.DateTimeFormat("en-GB", {
	timeZone: TIME_ZONE,
	hour: "2-digit",
	minute: "2-digit",
	hourCycle: "h23",
});

/** Live: `matches` follows the OS setting as it changes, and reading it is free, where
 *  matchMedia() parses its query afresh — which the camera loop did on every tick of a move. */
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");

/**
 * The large row changing hands, as one movement: every row glides to its new place and the
 * next prayer swells into its own, where the rank used to jump from one layout to the next.
 * It is the one reflow on the wall, six times a day, and the moment anyone looking up sees
 * the screen change.
 *
 * A view transition, so the browser animates snapshots on the compositor rather than laying
 * the rank out again on every frame. But nothing on this wall may wait on a frame (see
 * runTick): the transition only runs its callback once it has captured one, which a panel
 * behind an occluding window never gives it. So the same write is armed on a timer too, and
 * whichever comes first applies it — the other finds it done.
 */
function morphRank(write: () => void): void {
	let done = false;
	const apply = (): void => {
		if (done) return;
		done = true;
		write();
	};
	if (
		typeof document.startViewTransition !== "function" ||
		document.hidden ||
		REDUCED_MOTION.matches
	) {
		apply();
		return;
	}
	window.setTimeout(apply, 1000);
	const vt = document.startViewTransition(apply);
	// A skipped transition rejects both; that is not an error on a wall. A write that threw
	// still reaches the console, through updateCallbackDone.
	vt.ready.catch(() => {
		/* skipped: the timer has applied the write */
	});
	vt.finished.catch(() => {
		/* as above */
	});
}

function isFriday(at: Date): boolean {
	return WEEKDAY_FORMAT.format(at) === "Fri";
}

function partsOf(at: Date): { year: number; month: number; dayOfMonth: number } {
	const { year, month, day } = stockholmDateParts(at);
	return { year, month, dayOfMonth: day };
}

/** Text with each ʿayn and hamza in a span of its own, which MosqueScreen.astro tightens.
 *  Literata sets both marks as spacing letters with wide side bearings, so at the wall's
 *  size a name read »ʿ Aṣr« and »Jumu ʿ a«; and Source Sans 3 has no glyph for them at
 *  all, so the Hijri line borrowed one from whatever system font came next. */
function setMarked(el: HTMLElement, text: string): void {
	// Keyed on a data attribute, not textContent: the rank's names arrive server-rendered
	// as plain text, so "ʿAṣr" already matched and was never split into its spans.
	if (el.dataset.marked === text) return;
	el.dataset.marked = text;
	el.replaceChildren(
		...text
			.split(/([ʿʾ])/)
			.filter((part) => part !== "")
			.map((part) => {
				if (part !== "ʿ" && part !== "ʾ") return document.createTextNode(part);
				const mark = document.createElement("span");
				mark.className = part === "ʿ" ? "ms-ayn" : "ms-hamza";
				mark.textContent = part;
				return mark;
			}),
	);
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
	// "om 3 tim", never "om 3 tim 0 min".
	return mins % 60 === 0 ? `om ${hours} tim` : `om ${hours} tim ${mins % 60} min`;
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
	if (!("wakeLock" in navigator)) return;
	let held: WakeLockSentinel | null = null;
	let pending = false;
	let backoff = 5000;
	const take = async (): Promise<void> => {
		// The request is rejected outright while hidden. And one lock, one request for it at a
		// time: the release listener and the visibilitychange below both fire on the same wake,
		// so a panel that blanked and woke inside a second took a lock from each, and a refused
		// request's retry timer ran beside the next wake's attempt.
		if (document.hidden || pending || (held !== null && !held.released)) return;
		pending = true;
		try {
			held = await navigator.wakeLock.request("screen");
			backoff = 5000;
			// The lock is dropped automatically whenever the page hides, and nothing
			// re-takes it for you.
			held.addEventListener("release", () => window.setTimeout(take, 1000), { once: true });
		} catch {
			// Backed off rather than retried tight: a browser that refuses the lock while
			// the panel is asleep would otherwise spin for as long as it stays asleep.
			backoff = Math.min(backoff * 2, 300_000);
			window.setTimeout(take, backoff);
		} finally {
			pending = false;
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
	// ⚠️ `pointermove` alone was a real trap on the one device this screen is FOR. A
	// television is driven by a remote and never sends a pointer event, so four seconds
	// after boot the idle state latched on and the screen's only control became
	// unreachable: faded to nothing, pointer-events off, and no way to bring it back
	// without plugging in a mouse. Any input at all counts as someone being there.
	document.addEventListener("pointermove", wake, { passive: true });
	document.addEventListener("pointerdown", wake, { passive: true });
	document.addEventListener("keydown", wake, { passive: true });
	// Leaving fullscreen is a state change the wall must not make silently — a nudged
	// keyboard drops it out and it would otherwise sit windowed, showing browser chrome,
	// until somebody happened to look. Waking puts the way back on screen.
	document.addEventListener("fullscreenchange", wake);
	wake();
}

/** The one control on the screen, and it fades with the cursor. A browser will only
 *  grant fullscreen from a real gesture, so it cannot be done on load. */
function wireFullscreen(root: HTMLElement): void {
	const btn = document.querySelector<HTMLButtonElement>(".ms-fullscreen");
	if (!btn) return;
	// No button where the browser cannot go fullscreen at all — Safari on an iPhone, a frame
	// without allowfullscreen, many TV browsers. There it could only ever do nothing.
	if (!document.fullscreenEnabled) {
		btn.remove();
		return;
	}
	btn.addEventListener("click", async () => {
		try {
			if (document.fullscreenElement) await document.exitFullscreen();
			// "hide" asks for the immersive mode: a tablet or TV box is otherwise free to keep
			// its own navigation bar across the bottom of the wall.
			else await root.closest("main")?.requestFullscreen({ navigationUI: "hide" });
		} catch {
			// A browser may refuse — an iframe without allowfullscreen, or a gesture it
			// did not trust. The screen is perfectly usable windowed, and the setup page
			// says so rather than leaving the mosque with a button that does nothing.
		}
	});
}

const root = document.querySelector<HTMLElement>(".ms");
if (root) mount(root);
