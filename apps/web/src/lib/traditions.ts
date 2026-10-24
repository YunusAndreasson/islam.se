// THE TWO TRADITIONS of the dialogue the site shows (DESIGN.md, »The Browse Axes«: the
// classical Islamic tradition and the Swedish and Western voices that meet it). Their names
// were typed in five places and had drifted: »Den klassiska traditionen« at an essay's
// foot, »Tänkare — svensk röst« with an em dash on the share card. Pure, so the search
// palette's client script reads it as well as the build.

/** Also the thinker schema's `tradition` enum (content.config.ts). */
export const TRADITION_KEYS = ["sunni", "western"] as const;

export type Tradition = (typeof TRADITION_KEYS)[number];

export const TRADITIONS: Readonly<
	Record<Tradition, { readonly label: string; readonly singular: string }>
> = {
	/** `label` heads a side of the dialogue; `singular` says which side one thinker is on. */
	sunni: { label: "Den klassiska islamiska traditionen", singular: "Klassisk islamisk tradition" },
	western: { label: "Svenska och västerländska röster", singular: "Svensk och västerländsk röst" },
};

/** Thinkers split by tradition, each side in the order given. */
export function byTradition<T>(
	thinkers: readonly T[],
	traditionOf: (thinker: T) => Tradition,
): Record<Tradition, T[]> {
	return {
		sunni: thinkers.filter((t) => traditionOf(t) === "sunni"),
		western: thinkers.filter((t) => traditionOf(t) === "western"),
	};
}
