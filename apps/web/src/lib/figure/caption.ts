/**
 * The figcaption every figure carries, and the house punctuation that goes into it.
 *
 * A chart and a table say the same three things in the same order — a lead sentence, the
 * source, and the honest caveat — so they share one builder. If they drifted, a page
 * holding both would show two different caption styles, which is the kind of defect a
 * reader notices without being able to name.
 *
 * The class names stay `chart-cap*` for both forms. That is deliberate: the CSS is
 * already written, already inlined into every page, and a parallel `table-cap*` family
 * would duplicate ~30 lines of stylesheet on ~2 473 pages to say the same thing.
 */
import { type HastNode, h } from "./hast";

export interface FigureCaptionSource {
	source: string;
	sourceUrl?: string;
	note?: string;
}

/**
 * House punctuation for author-written figure text.
 *
 * Prose gets its guillemets from remark-smartypants — but that plugin skips `code` nodes,
 * and a figure spec IS a code node. Without this, an author obeying the house rule (write
 * straight quotes; the pipeline converts them) would get "…" in the caption while the
 * paragraph above it got »…«. The alternative — telling authors to type »…« inside the
 * fence — makes scripts/check-house-style.py flag the file, and rightly so: the rule is
 * that the SOURCE uses straight quotes everywhere.
 */
export function housePunctuation(text: string): string {
	return text.replace(/"([^"]*)"/g, "»$1«").replace(/(\w)'(\w)/g, "$1’$2");
}

/**
 * The caption as flat text, for destinations that cannot take markup — the Typst book,
 * and anywhere the figure has to be described in one line. Takes the same `lead` the
 * markup version does so a figure says the same thing on screen and on paper.
 */
export function figureCaptionText(lead: string | null, spec: FigureCaptionSource): string {
	return housePunctuation([lead, `Källa: ${spec.source}.`, spec.note].filter(Boolean).join(" "));
}

export function figureCaptionNodes(lead: string | null, spec: FigureCaptionSource): HastNode[] {
	const nodes: HastNode[] = [];
	if (lead) {
		nodes.push(h("span", { className: "chart-cap-lead" }, [housePunctuation(lead)]));
	}
	const sourceChildren: (HastNode | string)[] = ["Källa: "];
	if (spec.sourceUrl) {
		sourceChildren.push(
			h("a", { href: spec.sourceUrl, rel: "nofollow" }, [housePunctuation(spec.source)]),
		);
	} else {
		sourceChildren.push(housePunctuation(spec.source));
	}
	sourceChildren.push(".");
	nodes.push(h("span", { className: "chart-cap-source" }, sourceChildren));
	if (spec.note) {
		nodes.push(h("span", { className: "chart-cap-note" }, [housePunctuation(spec.note)]));
	}
	return nodes;
}
