/**
 * Drives every essay Quran player (.quran-verse, injected by rehype-quran-verse)
 * on a page: lazy audio on first press, and a word spotlight that follows the
 * recitation. The same mechanism as the homepage daily verse (§7.2), minus the
 * gloss/hover affordances — in an essay the player only plays and highlights.
 *
 * Framework-agnostic so it can be imported from the essay page's module script.
 * Idempotent per element (a `data-qv-ready` flag), so re-running after a View
 * Transition swap is harmless.
 */
type Segment = [word: number, start: number, end: number];

// Only one verse recites at a time across the page — starting one pauses the rest.
let current: HTMLAudioElement | null = null;

function setup(fig: HTMLElement): void {
	const btn = fig.querySelector<HTMLButtonElement>(".qv-play");
	const arabic = fig.querySelector<HTMLElement>(".qv-arabic");
	if (!(btn && arabic) || btn.dataset.qvReady) return;
	btn.dataset.qvReady = "1";

	let segments: Segment[] = [];
	try {
		segments = JSON.parse(arabic.dataset.segments || "[]");
	} catch {
		// Malformed data-segments → the verse simply plays without the highlight.
	}

	let audio: HTMLAudioElement | null = null;
	let active = -1; // 1-based word currently lit, or -1 for none

	const setActive = (word: number): void => {
		if (word === active) return;
		if (active >= 0)
			arabic.querySelector(`.qv-w[data-w="${active}"]`)?.classList.remove("is-active");
		if (word >= 0) {
			arabic.querySelector(`.qv-w[data-w="${word}"]`)?.classList.add("is-active");
			arabic.setAttribute("data-active", "");
		} else {
			arabic.removeAttribute("data-active");
		}
		active = word;
	};

	btn.addEventListener("click", () => {
		// Lazy: no file is fetched until the first press.
		if (!audio) {
			audio = new Audio(btn.dataset.audio);
			audio.preload = "none";
			audio.addEventListener("play", () => {
				if (current && current !== audio) current.pause();
				current = audio;
				btn.setAttribute("data-playing", "");
			});
			audio.addEventListener("pause", () => {
				btn.removeAttribute("data-playing");
				setActive(-1); // restore the full, readable verse
			});
			audio.addEventListener("ended", () => {
				btn.removeAttribute("data-playing");
				setActive(-1);
				if (audio) audio.currentTime = 0;
			});
			// Segments are ordered by start, so a short linear scan suffices; between
			// words we hold the current word rather than flicker off.
			audio.addEventListener("timeupdate", () => {
				if (!(audio && segments.length)) return;
				const t = audio.currentTime * 1000;
				for (const [word, start, end] of segments) {
					if (t >= start && t < end) {
						setActive(word);
						return;
					}
				}
			});
		}
		if (audio.paused)
			audio.play().catch(() => {
				// Autoplay/codec rejection — leave the button idle, no error to surface.
			});
		else audio.pause();
	});
}

/** Wire all essay verse players found under `root` (default: the document). */
export function initQuranPlayers(root: ParentNode = document): void {
	for (const fig of root.querySelectorAll<HTMLElement>(".quran-verse")) setup(fig);
}

// Stop and release on navigation (View Transitions) so audio never bleeds across pages.
if (typeof document !== "undefined") {
	document.addEventListener("astro:before-swap", () => {
		if (current) {
			current.pause();
			current = null;
		}
	});
}
