// MARKS THE ESSAYS A READER HAS FINISHED, in any list of them: every `.archive-item` with
// a `data-slug` gets `data-read` when its essay is read (reading-progress.ts), and the
// list's CSS then mutes the title and shows »· läst« in place (layout.css, »A read
// essay«). /essaer/ and the ämne, series and tänkare pages share it. The front page's
// series cards keep their own (trad-routes.ts), because they also count the parts that
// are not shown.
//
// Progress lives in localStorage, so this is the one part of a list that cannot be
// rendered at build time; without it every essay simply reads as unread.
import { hasRead } from "./reading-progress";

/** Marks the read essays under `root`; returns how many of how many are read. */
export function markReadEssays(root: ParentNode = document): { read: number; total: number } {
	let read = 0;
	let total = 0;
	for (const item of root.querySelectorAll<HTMLElement>(".archive-item[data-slug]")) {
		const done = hasRead(item.dataset.slug ?? "");
		item.toggleAttribute("data-read", done);
		total++;
		if (done) read++;
	}
	return { read, total };
}
