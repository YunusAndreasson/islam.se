// ONE SOUND AT A TIME. The essay's narration (FloatingPlayer.astro) and a verse's
// recitation (quran-player.ts) are separate, detached Audio objects, so neither heard the
// other start, and a reader who pressed a verse's play mid-narration heard both at once
// (found 2026-10-16). Whichever starts claims the page; every other player pauses.
const EVENT = "islamse:audio-play";

/** Announce that `audio` has started, so every other player on the page pauses. */
export function claimAudio(audio: HTMLMediaElement): void {
	document.dispatchEvent(new CustomEvent<HTMLMediaElement>(EVENT, { detail: audio }));
}

/** Pause `current()` whenever another player claims the page. */
export function yieldAudio(current: () => HTMLMediaElement | null): void {
	document.addEventListener(EVENT, (event) => {
		const own = current();
		const claimant = (event as CustomEvent<HTMLMediaElement>).detail;
		if (own && claimant !== own && !own.paused) own.pause();
	});
}
