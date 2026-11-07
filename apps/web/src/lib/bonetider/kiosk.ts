// The decisions a screen has to make to survive on a wall for months, separated from
// the browser so they can be reasoned about and tested.
//
// A mosque display fails differently from a web page. Nobody reloads it, nobody watches
// it boot, and — the failure that matters — a frozen screen showing yesterday's times
// looks exactly like a working one. Everything here exists because of that asymmetry:
// the screen must be able to notice it has stopped, recover without help, and never
// take an action (a reload, most of all) that could leave the wall blank.

/**
 * Is the congregation in progress?
 *
 * From the iqāma until the window closes the prayer being prayed keeps the large row
 * and its countdown reads »pågår«. Returns false when the mosque holds no iqāma for
 * this prayer, and when the window is configured to zero.
 */
export function inQuietWindow(
	nowMs: number,
	iqamaMs: number | null,
	quietMinutes: number,
): boolean {
	if (iqamaMs === null || quietMinutes <= 0) return false;
	return nowMs >= iqamaMs && nowMs < iqamaMs + quietMinutes * 60_000;
}

/** What the large row is counting towards: the adhān, the iqāma after it, or nothing
 *  because the congregation is praying. */
type HeroPhase = "adhan" | "iqama" | "praying";

export interface HeroMoment<K extends string> {
	key: K;
	phase: HeroPhase;
	/** The adhān, the iqāma, or the end of the congregation's window. */
	targetMs: number;
}

/**
 * Which prayer holds the wall's large row.
 *
 * NOT simply the next adhān. The minutes between a prayer's adhān and its iqāma are
 * when the foyer is full and reading the wall, and "the next adhān" has moved on by
 * then: at 13:15 with Ẓuhr's iqāma at 13:24, the large row read »ʿAṣr, om 3 tim 19 min«
 * and the one time the room was waiting for sat in the small type of the row above. So
 * a prayer keeps the row from its adhān, through the wait for its iqāma, to the end of
 * the congregation, and only then hands it on.
 *
 * `order` is chronological. Returns null once the day is spent, where the caller shows
 * tomorrow's Fajr.
 */
export function heroAt<K extends string>(
	nowMs: number,
	order: readonly K[],
	adhanMs: (key: K) => number,
	iqamaMs: (key: K) => number | null,
	quietMinutes: number,
): HeroMoment<K> | null {
	for (const key of order) {
		const adhan = adhanMs(key);
		if (!Number.isFinite(adhan)) continue;
		if (adhan >= nowMs) return { key, phase: "adhan", targetMs: adhan };
		const iqama = iqamaMs(key);
		if (iqama === null) continue;
		if (nowMs < iqama) return { key, phase: "iqama", targetMs: iqama };
		if (inQuietWindow(nowMs, iqama, quietMinutes)) {
			return { key, phase: "praying", targetMs: iqama + quietMinutes * 60_000 };
		}
	}
	return null;
}

// ---------------------------------------------------------------------------
// Reload
// ---------------------------------------------------------------------------

export interface ReloadContext {
	/** Every moment the room cares about today: the six times, the iqāmas, jumuʿa. */
	prayerTimesMs: readonly number[];
	guardBeforeMs: number;
	guardAfterMs: number;
	/** The screen must not reload mid-move. */
	cameraMoving: boolean;
	uptimeMs: number;
	minUptimeMs: number;
	/** From localStorage, so a boot loop cannot survive a reload. */
	lastReloadMs: number | null;
	minSinceLastReloadMs: number;
}

/**
 * May the screen reload right now?
 *
 * A reload is the only irreversible thing this page does: get it wrong and the wall is
 * blank in front of a congregation. Every guard is a conjunction and each one has cost
 * somebody a screen somewhere — in particular the last, which is what stops a wrong
 * clock or a bad deploy from reloading the wall every minute forever.
 */
export function isReloadSafe(nowMs: number, ctx: ReloadContext): boolean {
	if (ctx.uptimeMs < ctx.minUptimeMs) return false;
	if (ctx.cameraMoving) return false;
	if (ctx.lastReloadMs !== null && nowMs - ctx.lastReloadMs < ctx.minSinceLastReloadMs)
		return false;
	for (const t of ctx.prayerTimesMs) {
		if (!Number.isFinite(t)) continue;
		if (nowMs > t - ctx.guardBeforeMs && nowMs < t + ctx.guardAfterMs) return false;
	}
	return true;
}

/**
 * The minute in the small hours when this particular screen reloads.
 *
 * Derived from a hash of its own config rather than fixed, so a hundred mosque screens
 * pointed at the same deploy do not all hit the origin in the same second. Deterministic,
 * so the same screen keeps the same slot across reboots.
 */
export function nightlyReloadMinute(seed: string, windowStart = 190, windowLength = 40): number {
	let h = 2166136261;
	for (let i = 0; i < seed.length; i++) {
		h ^= seed.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return windowStart + (Math.abs(h) % windowLength);
}

// ---------------------------------------------------------------------------
// Burn-in
// ---------------------------------------------------------------------------

/**
 * Where to park the composition this minute.
 *
 * A wall shows the same layout for months and an OLED panel will keep it. Stepping the
 * whole thing around a small lattice of integer offsets is a compositor transform, so
 * the canvas never re-renders and nothing reflows. Integers only — a fractional
 * translate resamples the text and it goes soft.
 */
export function pixelShiftAt(nowMs: number, amplitude = 6): { x: number; y: number } {
	const step = Math.floor(nowMs / 60_000);
	// An eight-point orbit rather than a random walk, so the screen returns to where it
	// started and no drift accumulates over a month.
	const angle = ((step % 8) / 8) * Math.PI * 2;
	return {
		x: Math.round(Math.cos(angle) * amplitude),
		y: Math.round(Math.sin(angle) * amplitude),
	};
}

// ---------------------------------------------------------------------------
// Clock drift
// ---------------------------------------------------------------------------

export type DriftVerdict = "ok" | "corrected" | "broken";

/**
 * What to do about a device clock that disagrees with the server.
 *
 * Cheap signage hardware drifts, and a wall clock quietly showing the wrong Maghrib is
 * a religious problem rather than a cosmetic one — so the screen applies the server's
 * time rather than displaying its own. Under a minute is ignored: the Date header has
 * one-second resolution and the round trip is noise.
 */
export function driftVerdict(skewMs: number): DriftVerdict {
	const abs = Math.abs(skewMs);
	if (abs <= 60_000) return "ok";
	if (abs <= 30 * 60_000) return "corrected";
	return "broken";
}

/** Swedish, and written for whoever walks past the screen. */
export function driftMessage(skewMs: number): string {
	const verdict = driftVerdict(skewMs);
	if (verdict === "ok") return "";
	const minutes = Math.round(Math.abs(skewMs) / 60_000);
	if (verdict === "corrected")
		return `Skärmens klocka går ${minutes} min fel. Tiderna visas ändå rätt.`;
	return `Skärmens klocka går ${minutes} min fel. Ställ klockan rätt på tv:n eller datorn.`;
}

// ---------------------------------------------------------------------------
// Clock steps
// ---------------------------------------------------------------------------

/**
 * How far the device's clock was SET between two readings, or 0.
 *
 * `performance.now()` is a monotonic clock that no setting can move, so between two readings
 * it and `Date.now()` advance by the same amount, and a difference is the wall clock being
 * set: NTP correcting a signage box that booted with a flat clock battery, or someone changing
 * it by hand. A throttled timer cannot fake a step, because both clocks are read at the same
 * instant. A system suspend can — the monotonic clock stands still while the box sleeps —
 * which is why skewAfterStep does not simply subtract every step it is given.
 */
export function clockStepMs(wallDeltaMs: number, monoDeltaMs: number, thresholdMs = 2000): number {
	const step = wallDeltaMs - monoDeltaMs;
	return Math.abs(step) >= thresholdMs ? step : 0;
}

/**
 * The server offset to use once the device clock has stepped, or null to keep the old one
 * until the server has been asked again.
 *
 * A step that lands the device clock on the server's time — within the minute a Date header
 * can resolve — is a correction, and the offset gives up exactly what the clock gained. Before
 * this, the screen went on adding the old offset to a clock that no longer needed it: every
 * time on the wall that many minutes out for up to an hour, under a message blaming a clock
 * that was by then right.
 *
 * Any other step is ambiguous. A suspend looks exactly like a forward correction, and after one
 * the old offset is still the right one. Those keep it, and the caller asks the server at once.
 */
export function skewAfterStep(skewMs: number, stepMs: number, toleranceMs = 60_000): number | null {
	const corrected = skewMs - stepMs;
	return Math.abs(corrected) <= toleranceMs && Math.abs(corrected) < Math.abs(skewMs)
		? corrected
		: null;
}

/**
 * How long until the server is asked for the time again.
 *
 * An hour after an answer. After a failure, 30 s, doubling to a five-minute ceiling: a box that
 * booted before the mosque's router came up used to wait out a whole hour on its own clock —
 * which, on exactly the hardware that needs correcting, is the wrong one.
 */
export function nextSkewProbeMs(failures: number): number {
	if (failures <= 0) return 60 * 60_000;
	return Math.min(5 * 60_000, 30_000 * 2 ** (failures - 1));
}
