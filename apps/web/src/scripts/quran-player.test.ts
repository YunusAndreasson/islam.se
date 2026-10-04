import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());

async function setup(rejectPlay = false) {
	vi.resetModules();
	const attrs = new Map<string, string>();
	const button = Object.assign(new EventTarget(), {
		dataset: { audio: "/verse.mp3", qvReady: "" },
		setAttribute: (key: string, value: string) => attrs.set(key, value),
		removeAttribute: (key: string) => attrs.delete(key),
	});
	const word = { classList: { add: vi.fn(), remove: vi.fn() } };
	const arabic = {
		dataset: { segments: "[[1,0,1000]]" },
		querySelector: () => word,
		setAttribute: vi.fn(),
		removeAttribute: vi.fn(),
	};
	const fig = { querySelector: (s: string) => (s === ".qv-play" ? button : arabic) };
	vi.stubGlobal("document", new EventTarget());
	let audio: FakeAudio | undefined;
	class FakeAudio extends EventTarget {
		paused = true;
		currentTime = 0;
		constructor() {
			super();
			audio = this;
		}
		play() {
			this.paused = false;
			this.dispatchEvent(new Event("play"));
			return rejectPlay ? Promise.reject(new Error("codec unavailable")) : Promise.resolve();
		}
		pause() {
			this.paused = true;
			this.dispatchEvent(new Event("pause"));
		}
	}
	vi.stubGlobal("Audio", FakeAudio);
	const { initQuranPlayers } = await import("./quran-player");
	initQuranPlayers({ querySelectorAll: () => [fig] } as unknown as ParentNode);
	button.dispatchEvent(new Event("click"));
	await Promise.resolve();
	if (!audio) throw new Error("The play button did not create audio");
	return { audio, attrs, word };
}

describe("Quran player state", () => {
	it("returns to idle when playback rejects after the play event", async () => {
		const { attrs } = await setup(true);
		expect(attrs.has("data-playing")).toBe(false);
		expect(attrs.get("aria-pressed")).toBe("false");
	});

	it("clears the playing state and word highlight on a media error", async () => {
		const { audio, attrs, word } = await setup();
		audio.dispatchEvent(new Event("timeupdate"));
		expect(word.classList.add).toHaveBeenCalledWith("is-active");
		audio.dispatchEvent(new Event("error"));
		expect(attrs.get("aria-pressed")).toBe("false");
		expect(word.classList.remove).toHaveBeenCalledWith("is-active");
	});

	it("does not highlight a word after a paused seek or an ended playback resets time", async () => {
		const { audio, word } = await setup();
		audio.pause();
		audio.dispatchEvent(new Event("ended"));
		audio.dispatchEvent(new Event("timeupdate"));
		expect(word.classList.add).not.toHaveBeenCalled();
	});
});
