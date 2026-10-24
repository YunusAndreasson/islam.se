// Client half of the front page's year line (components/Arslinje.astro).
//
// The line is drawn at build time and the site is deployed by hand, so a line left alone
// would keep the sun on the build's day and go on calling an observance »next« after it
// has passed. On each load the sun is moved to the reader's own today and the marks are
// told again which of them is next. The line's range and its marks are the build's and do
// not move: a build older than a month only means today stands further in.
//
// It also decides which labels fit, from the text and the line as drawn. The build can
// only estimate both, on the safe side, and its answer left two of four observances
// unnamed on a line that had room for all of them.
//
// Everything is set with setAttribute and classList: the CSP forbids style attributes, and
// SVG presentation attributes are not styles.
import { fractionOf, labelsThatFit, type MarkState, markStates } from "../lib/arslinje";
import { pct } from "../lib/bonetider/horizon";
import { localIsoDate } from "../lib/daily";
import { onPage } from "./page";

/** Rendered width of an SVG text node, 0 if it is not laid out. */
function textWidth(el: SVGTextElement): number {
	try {
		return el.getComputedTextLength();
	} catch {
		return 0;
	}
}

function paint(root: HTMLElement): void {
	const { start, end } = root.dataset;
	const svg = root.querySelector<SVGSVGElement>("svg");
	if (!(start && end && svg)) return;

	const idag = localIsoDate();
	svg.querySelector('[data-a="sol"]')?.setAttribute("cx", pct(fractionOf(idag, start, end)));

	const groups = [...svg.querySelectorAll<SVGGElement>(".arslinje-marke[data-end]")];
	const states = markStates(
		groups.map((g) => ({ endISO: g.dataset.end ?? "" })),
		idag,
	);
	const marks = groups.map((g, i) => {
		const state: MarkState = states[i] ?? "later";
		for (const s of ["passed", "next", "later"]) g.classList.toggle(`is-${s}`, s === state);
		return { x: Number(g.dataset.x ?? 0), state };
	});

	// Shown while they are measured: a hidden text has no length.
	const texts = groups.map((g) => [...g.querySelectorAll<SVGTextElement>("text")]);
	for (const text of texts.flat()) text.removeAttribute("data-hidden");
	const turn = svg.querySelector<SVGTextElement>('[data-a="nyar"]');
	turn?.removeAttribute("data-hidden");
	root.setAttribute("data-live", "");

	const width = svg.getBoundingClientRect().width;
	if (!width) return;
	const widths = texts.map((pair) => Math.max(0, ...pair.map(textWidth)) || 60);
	const shown = labelsThatFit(marks, width, (i) => widths[i] ?? 60);
	texts.forEach((pair, i) => {
		if (shown.has(i)) return;
		for (const text of pair) text.setAttribute("data-hidden", "");
	});

	// The year that begins at 1 Muḥarram, past its tick, if the opening label leaves room.
	const opens = svg.querySelector<SVGTextElement>('[data-a="oppnar"]');
	if (turn && opens && Number(turn.dataset.x ?? 0) * width < textWidth(opens) + 14) {
		turn.setAttribute("data-hidden", "");
	}
}

function uppdatera(): () => void {
	const observers: ResizeObserver[] = [];
	for (const root of document.querySelectorAll<HTMLElement>(".arslinje[data-start]")) {
		paint(root);
		// The line is a fraction of the window: a rotated phone has a different one.
		let seen = root.getBoundingClientRect().width;
		const observer = new ResizeObserver(() => {
			const w = root.getBoundingClientRect().width;
			if (Math.abs(w - seen) < 1) return;
			seen = w;
			paint(root);
		});
		observer.observe(root);
		observers.push(observer);
	}
	// An observer holds the line it watches: let go of the page's before the next one.
	return () => {
		for (const observer of observers) observer.disconnect();
	};
}

// It measures the line as drawn, so it waits for the finished page (page.ts, "load").
onPage(uppdatera, { when: "load" });
