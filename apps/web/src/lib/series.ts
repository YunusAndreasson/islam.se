// WHERE AN ESSAY STANDS IN AN ESSÄSERIE: its part, the number of parts, and the parts
// either side of it. A series is a reading order (DESIGN.md, »The Browse Axes«), so the
// end of an essay offers the next part (EssayConnections) and every count agrees with the
// series page and the front page: all three count only the parts that are published.
//
// Pure, so the order is tested without the content layer (series.test.ts).

export interface SeriesPosition {
	/** 1-based, as »del 3 av 6« says it. */
	part: number;
	parts: number;
	prev?: string;
	next?: string;
}

/** »6 delar«: a series counts its parts, never its essäer. */
export function partsLabel(parts: number): string {
	return `${parts} ${parts === 1 ? "del" : "delar"}`;
}

/** The minutes it takes to read every part: a series is read whole. */
export function seriesMinutes(parts: readonly { readingTime: number }[]): number {
	return parts.reduce((sum, part) => sum + part.readingTime, 0);
}

/** »6 delar · lästid 65 min«: how long a series is, said the same way wherever it is
 *  listed (its card, its page, the front page's way on). Four places derived it, and the
 *  front page's had dropped the parts. */
export function seriesLength(parts: readonly { readingTime: number }[]): string {
	return `${partsLabel(parts.length)} · lästid ${seriesMinutes(parts)} min`;
}

/** The position of `slug` among a series' published `members`, in the series' own
 *  order; null when the essay is not a part of it. */
export function seriesPosition(members: readonly string[], slug: string): SeriesPosition | null {
	const index = members.indexOf(slug);
	if (index < 0) return null;
	const prev = members[index - 1];
	const next = members[index + 1];
	return {
		part: index + 1,
		parts: members.length,
		...(prev === undefined ? {} : { prev }),
		...(next === undefined ? {} : { next }),
	};
}
