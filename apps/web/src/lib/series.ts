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
