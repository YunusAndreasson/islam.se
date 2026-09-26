// Client half of the front page's prayer-day horizon (components/PrayerHorizon.astro).
//
// Called by bonetider-field.ts on every paint — first load, each minute, a change of
// place or settings — with the day's times it has already computed for the mast, so the
// horizon adds no solar maths of its own. It moves the ticks, the daylight stretch and
// the sun, picks which labels fit the line actually drawn, and rewrites both islamic
// dates for the reader's day. Everything is set with setAttribute/textContent: the CSP
// forbids style attributes, and SVG presentation attributes are not styles.
import { anchorFor, horizon, labelsThatFit, pct } from "../lib/bonetider/horizon";
import { PRAYER_ORDER, type PrayerKey } from "../lib/bonetider/prayer-times";
import { hijriAtLabel } from "../lib/markesdagar";

type DayTimes = Record<PrayerKey, Date>;

/** Rendered width of an SVG text node, 0 if it is not laid out (display: none). */
function textWidth(el: SVGTextElement | null): number {
	if (!el) return 0;
	try {
		return el.getComputedTextLength();
	} catch {
		return 0;
	}
}

type Model = ReturnType<typeof horizon>;

/** Ticks and their labels: position, state, and which labels fit the line as drawn.
 *  The next prayer always keeps its label. */
function paintTicks(
	svg: SVGSVGElement,
	model: Model,
	width: number,
	nextToday: PrayerKey | null,
): void {
	const byKey = new Map(model.ticks.map((t) => [t.key, t]));
	const labelPx = new Map<PrayerKey, number>();
	for (const key of PRAYER_ORDER) {
		const g = svg.querySelector<SVGGElement>(`[data-h-tick="${key}"]`);
		if (!g) continue;
		const tick = byKey.get(key);
		// A time the calculation could not give (high latitude) leaves the line.
		if (!tick) {
			g.setAttribute("display", "none");
			continue;
		}
		g.removeAttribute("display");
		g.classList.toggle("is-next", tick.state === "next");
		g.classList.toggle("is-passed", tick.state === "passed");
		g.classList.toggle("is-later", tick.state === "later");
		const line = g.querySelector("line");
		line?.setAttribute("x1", pct(tick.x));
		line?.setAttribute("x2", pct(tick.x));
		const text = g.querySelector("text");
		text?.removeAttribute("data-hidden");
		const w = textWidth(text) || 48;
		labelPx.set(key, w);
		text?.setAttribute("x", pct(tick.x));
		text?.setAttribute("text-anchor", width ? anchorFor(tick.x, width, w) : "middle");
	}
	if (!width) return;
	const shown = labelsThatFit(model.ticks, width, (k) => labelPx.get(k) ?? 48, nextToday);
	for (const t of model.ticks) {
		if (shown.has(t.key)) continue;
		svg.querySelector(`[data-h-tick="${t.key}"] text`)?.setAttribute("data-hidden", "");
	}
}

/** The two islamic dates. The start of the line carries the date that began at last
 *  night's maghrib; the maghrib tick carries the one that begins there. Whichever is the
 *  CURRENT date is always shown; the other only if it has room. */
function paintHijri(
	svg: SVGSVGElement,
	model: Model,
	width: number,
	now: Date,
	maghrib: Date,
): void {
	const before = svg.querySelector<SVGTextElement>('[data-h="hijri-before"]');
	const after = svg.querySelector<SVGTextElement>('[data-h="hijri-after"]');
	if (before) {
		before.textContent = hijriAtLabel(new Date(maghrib.getTime() - 1), maghrib);
		before.removeAttribute("data-hidden");
	}
	if (!(after && model.maghrib !== null)) return;
	after.textContent = hijriAtLabel(maghrib, maghrib, false);
	after.removeAttribute("data-hidden");
	const w = textWidth(after);
	const x = model.maghrib * width;
	// Past the maghrib tick if it fits before the end of the line; otherwise flush right.
	const flushRight = width > 0 && x + 6 + w > width;
	after.setAttribute("x", flushRight ? "100%" : pct(model.maghrib));
	after.setAttribute("dx", flushRight ? "0" : "6");
	after.setAttribute("text-anchor", flushRight ? "end" : "start");
	const afterLeft = flushRight ? width - w : x + 6;
	if (width && textWidth(before) + 12 > afterLeft) {
		// They collide: keep the current day's.
		const afterMaghrib = now.getTime() >= maghrib.getTime();
		(afterMaghrib ? before : after)?.setAttribute("data-hidden", "");
	}
}

export function paintHorizon(
	root: HTMLElement,
	now: Date,
	today: DayTimes,
	nextToday: PrayerKey | null,
	sunUp: boolean,
): void {
	const svg = root.querySelector<SVGSVGElement>(".horizon-line");
	if (!svg) return;
	const model = horizon(today, now, nextToday);
	const width = svg.getBoundingClientRect().width;

	paintTicks(svg, model, width, nextToday);

	const day = svg.querySelector('[data-h="daylight"]');
	if (day && model.daylight) {
		day.setAttribute("x1", pct(model.daylight[0]));
		day.setAttribute("x2", pct(model.daylight[1]));
	}

	paintHijri(svg, model, width, now, today.maghrib);

	svg.querySelector('[data-h="sun"]')?.setAttribute("cx", pct(model.sun));
	root.toggleAttribute("data-night", !sunUp);
	root.setAttribute("data-live", "");
}
