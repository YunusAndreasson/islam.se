// The site's own DOM events that carry a payload, by name, so a listener gets `e.detail`
// typed instead of casting the event it was handed.
interface DocumentEventMap {
	/** One sound at a time: a player started, and every other one pauses
	 *  (scripts/audio-exclusive.ts). */
	"islamse:audio-play": CustomEvent<HTMLMediaElement>;
	/** A »Lyssna« button asks the floating player for its track (AudioPlayer.astro). */
	"floating-player:play": CustomEvent<{
		src: string | undefined;
		title: string | undefined;
		artwork: string | undefined;
		/** The episode's own page in each directory, when the trigger knows it. */
		apple: string | undefined;
		spotify: string | undefined;
	}>;
	/** A prayer-settings form changed a value (scripts/bonetider-settings-form.ts). */
	"bt-settings-change": CustomEvent<
		import("./scripts/bonetider-settings-form").BtSettingsChangeDetail
	>;
}
