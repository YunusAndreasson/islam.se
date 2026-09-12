// The decisions a screen has to make to survive on a wall for months, separated from
// the browser so they can be reasoned about and tested.
//
// A mosque display fails differently from a web page. Nobody reloads it, nobody watches
// it boot, and — the failure that matters — a frozen screen showing yesterday's times
// looks exactly like a working one. Everything here exists because of that asymmetry:
// the screen must be able to notice it has stopped, recover without help, and never
// take an action (a reload, most of all) that could leave the wall blank.

/** Which ground the screen paints, from the sun's own position over this mosque. */
export type Ground = "day" | "night";

/**
 * Parchment while the sun is up over the mosque, warm near-black once it has set.
 *
 * The boundary is the mosque's own Shurūq and Maghrib rather than a clock hour, so the
 * screen darkens at the moment the sun actually sets over that building. That is the
 * honest mapping: the whole screen is about where the sun is.
 *
 * Both arguments may be Invalid Date — north of the Arctic Circle a day can have
 * neither a sunrise nor a sunset. The fallback is the one that cannot mislead: if the
 * sun never set, it is day; if it never rose, it is night; and altitude decides when
 * neither is known.
 */
export function groundFor(now: Date, sunrise: Date, maghrib: Date, sunUp: boolean): Ground {
	const rise = sunrise.getTime();
	const set = maghrib.getTime();
	if (!(Number.isFinite(rise) && Number.isFinite(set))) return sunUp ? "day" : "night";
	const t = now.getTime();
	return t >= rise && t < set ? "day" : "night";
}

/**
 * Is the congregation in progress?
 *
 * From the iqāma until the window closes the screen goes quiet: the rank recedes and
 * one line holds the wall. Returns false when the mosque holds no iqāma for this
 * prayer, and when the window is configured to zero.
 */
export function inQuietWindow(
	nowMs: number,
	iqamaMs: number | null,
	quietMinutes: number,
): boolean {
	if (iqamaMs === null || quietMinutes <= 0) return false;
	return nowMs >= iqamaMs && nowMs < iqamaMs + quietMinutes * 60_000;
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
		return `Enhetens klocka går ${minutes} min fel – tiderna visas korrigerade.`;
	return `Enhetens klocka går ${minutes} min fel. Ställ om klockan på skärmens enhet.`;
}
