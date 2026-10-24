/**
 * Drives every essay Quran player (.quran-verse, injected by rehype-quran-verse)
 * on a page: lazy audio on first press, and a word spotlight that follows the
 * recitation. In an essay the player only plays and highlights.
 *
 * Wired by ArticleBody (every reading template) and by QuranVerse (a hand-composed
 * page). Idempotent per element (a `data-qv-ready` flag), so the two wiring the same
 * page, or a re-run after a client navigation, set each player up once.
 */
import type { Segment } from "../lib/arabic";
import { claimAudio, yieldAudio } from "./audio-exclusive";

// Only one verse recites at a time across the page — starting one pauses the rest — and
// none plays over the essay's narration (audio-exclusive.ts).
let current: HTMLAudioElement | null = null;
yieldAudio(() => current);

function setup(fig: HTMLElement): void {
	const btn = fig.querySelector<HTMLButtonElement>(".qv-play");
	const arabic = fig.querySelector<HTMLElement>(".qv-arabic");
	if (!(btn && arabic) || btn.dataset.qvReady) return;
	btn.dataset.qvReady = "1";
	btn.setAttribute("aria-pressed", "false");

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

	const setIdle = (): void => {
		btn.removeAttribute("data-playing");
		btn.setAttribute("aria-pressed", "false");
		setActive(-1);
	};

	btn.addEventListener("click", () => {
		// Lazy: no file is fetched until the first press.
		if (!audio) {
			audio = new Audio(btn.dataset.audio);
			audio.preload = "none";
			audio.addEventListener("play", () => {
				if (current && current !== audio) current.pause();
				current = audio;
				if (audio) claimAudio(audio);
				btn.setAttribute("data-playing", "");
				btn.setAttribute("aria-pressed", "true");
			});
			audio.addEventListener("pause", () => {
				setIdle(); // restore the full, readable verse
			});
			audio.addEventListener("ended", () => {
				setIdle();
				if (audio) audio.currentTime = 0;
			});
			audio.addEventListener("error", setIdle);
			// Segments are ordered by start, so a short linear scan suffices; between
			// words we hold the current word rather than flicker off.
			audio.addEventListener("timeupdate", () => {
				if (!(audio && !audio.paused && segments.length)) return;
				const t = audio.currentTime * 1000;
				for (const [word, start, end] of segments) {
					if (t >= start && t < end) {
						setActive(word);
						return;
					}
				}
			});
		}
		if (audio.paused) audio.play().catch(setIdle);
		else audio.pause();
	});
}

/** Wire all essay verse players found under `root` (default: the document). */
export function initQuranPlayers(root: ParentNode = document): void {
	for (const fig of root.querySelectorAll<HTMLElement>(".quran-verse")) setup(fig);
}

// Stop and release on navigation (View Transitions) so audio never bleeds across pages.
document.addEventListener("astro:before-swap", () => {
	if (current) {
		current.pause();
		current = null;
	}
});
