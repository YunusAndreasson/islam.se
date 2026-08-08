/**
 * Remove the margin-note copies from rendered essay HTML.
 *
 * `rehype-sidenotes` duplicates each footnote body into the prose so CSS can float
 * it into the gutter. On the page that is correct — the copy is shown and the
 * original list is hidden. Anywhere the HTML is consumed OUTSIDE that stylesheet
 * (the RSS feed, a markdown twin) both copies survive, and every note is delivered
 * twice: once mid-sentence, once at the foot.
 *
 * ⚠️ A non-greedy `<span class="sidenote">[\s\S]*?</span>` is WRONG here and looks
 * right. Note bodies contain nested spans — `rehype-honorific` wraps ﷺ in one, and
 * the note's own `.sidenote-num` is another — so the first `</span>` the pattern
 * finds closes a child, and the note is truncated mid-citation. Depth counting is
 * the only correct form, and it is ten lines.
 */

const OPEN = /<span\b[^>]*class="[^"]*\bsidenote\b[^"]*"[^>]*>/i;
const TAG = /<(\/?)span\b[^>]*>/gi;

export function stripSidenotes(html: string): string {
	let out = "";
	let rest = html;

	while (true) {
		const open = OPEN.exec(rest);
		if (!open || open.index === undefined) break;

		out += rest.slice(0, open.index);

		// Scan forward from just past the opening tag, counting spans in and out.
		let depth = 1;
		TAG.lastIndex = open.index + open[0].length;
		let end = -1;
		for (let match = TAG.exec(rest); match !== null; match = TAG.exec(rest)) {
			depth += match[1] === "/" ? -1 : 1;
			if (depth === 0) {
				end = TAG.lastIndex;
				break;
			}
		}

		// Unbalanced markup: drop the remainder of the opening tag only, rather than
		// silently swallowing the rest of the document.
		if (end === -1) {
			rest = rest.slice(open.index + open[0].length);
			continue;
		}

		rest = rest.slice(end);
	}

	return out + rest;
}
