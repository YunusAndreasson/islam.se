/**
 * rehype-timeline: turn a ```timeline fence into a real figure at build time.
 *
 * Same shape as rehype-chart and rehype-table — the traversal, and the two warnings that
 * matter (Shiki's excludeLangs, and the content cache), live in rehype-fence.ts.
 */

import { buildTimelineHast } from "../lib/timeline/render";
import { parseTimelineSpec, type TimelineSpec, TimelineSpecError } from "../lib/timeline/spec";
import { rehypeFence } from "./rehype-fence";

export const rehypeTimeline = rehypeFence<TimelineSpec>({
	lang: "timeline",
	parse: parseTimelineSpec,
	build: buildTimelineHast,
	isSpecError: (error): error is TimelineSpecError => error instanceof TimelineSpecError,
});
